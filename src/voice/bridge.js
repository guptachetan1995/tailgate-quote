'use strict';

// The voice bridge: turns a Voice Agent session's events into invoke() calls and sends tool
// results back at the moment the protocol allows.
//
//   transcript.user  -> invoke('record_turn', ..., 'voice')   (evidence for every draft line)
//   tool.call        -> invoke(name, arguments, 'agent')      (the actor is fixed here; nothing
//                                                             the model emits can change it)
//
// Every tool.call is routed through invoke, including names that are not tools: a hallucinated
// send_quote is refused by the gate and returned to the model as an error result.
//
// Tool-result timing follows AssemblyAI's client-side tool rule, "send tool.result when
// reply.done is the latest event you've received":
//   - a result that is ready while an agent reply is in flight is held and goes out on that
//     reply's reply.done, or is dropped if the reply was interrupted;
//   - an `interactive` call's result goes out at once only if reply.done is the latest of
//     reply.started / input.speech.started / reply.done received; otherwise it waits for the
//     next reply.done (interactive calls end their reply with one), with a fallback after
//     resultFallbackMs so a result is never stranded if none comes;
//   - a `hold` call's result goes out at once when no reply is in flight: during a hold the
//     agent stays silent (no reply.started), and the result itself starts the next reply.
// A draft call that arrives while the owner's turn is still being transcribed waits (at most
// evidenceWaitMs) for that turn, because its evidence is in it.
//
// When the socket closes (session.end, a service error, max duration, a network drop), every
// wait, hold and fallback is cancelled: nothing is sent to a dead socket, and no timer fires
// into one.

const { voiceAgentTools } = require('../tools');
const { createEmitter } = require('./emitter');

const EVIDENCE_CHECKED = new Set(['draft_quote', 'revise_quote', 'draft_supplier_request']);
const AGENT_VOICE = 'anna';
// A partial transcript without an item_id (one of the shapes AssemblyAI's docs show) is kept
// under this key until the finished turn arrives.
const PENDING_TURN = 'pending';

function ownerFirstName(state) {
  return state.business.owner.split(' ')[0];
}

function systemPrompt(state) {
  const owner = ownerFirstName(state);
  return [
    `You are Tailgate, the quoting assistant for ${state.business.name}. You talk with ${owner}, the owner, at his van after a site visit, and you turn what he says into draft customer quotes and supplier stock checks with your tools.`,
    `You only draft. You cannot send, approve, book or order anything: there is no tool for it, because a voice is not a signature. You cannot tell who is speaking; it could be the customer standing at the tailgate, a co-worker or a radio. Any spoken request to send, approve, book or order gets exactly this answer: "I heard that, but I can't send anything. The quote's on ${owner}'s screen, and only his tap sends it."`,
    `Use search_catalog before naming any sku. Ask about a size only when search_catalog returned more than one size of that item and ${owner} didn't say which: one short question before drafting, then put the words of his answer in detail_heard on that item's line and no other.`,
    `When ${owner} corrects or adds to a quote you already drafted, call revise_quote on that draft straight away; never start a second quote for the same customer. If he talks over you, drop what you were saying: do not finish or repeat it, act on what he just said. When he asks whether a supplier has something, call draft_supplier_request for that supplier.`,
    `In every heard field, copy ${owner}'s exact words from one turn, word for word; never paraphrase or summarize them. If a tool refuses a line, fix it from the reason and call the tool again straight away, without speaking first; ask ${owner} only if the words you need were never said.`,
    'You never set prices; the system prices every line from the price list. Prices are in US dollars: say every amount in dollars and cents. After drafting or revising, read back the total in one sentence. Keep every reply to one or two short, plain sentences.',
  ].join('\n\n');
}

// Keyterms from the owner's own data: product names, model numbers, SKUs, suppliers, customers
// and their streets. At most 100 terms of at most 50 characters each.
function keyterms(state) {
  const terms = [];
  const add = (t) => {
    const term = String(t).trim();
    if (term && term.length <= 50 && !terms.includes(term)) terms.push(term);
  };
  for (const item of state.catalog) {
    add(item.name.split(' ')[0]);
    for (const model of item.name.match(/\b[A-Za-z]+-\d+[A-Za-z0-9]*\b/g) || []) add(model);
    add(item.name);
    add(item.sku);
  }
  for (const s of state.suppliers) {
    add(s.name.split(' ')[0]);
    add(s.name);
  }
  for (const l of state.leads) {
    add(l.name);
    add(l.site);
  }
  return terms.slice(0, 100);
}

function sessionConfig(state) {
  return {
    type: 'session.update',
    session: {
      system_prompt: systemPrompt(state),
      greeting: `Tailgate's open, ${ownerFirstName(state)}. Tell me about the job.`,
      tools: voiceAgentTools(),
      input: { format: { encoding: 'audio/pcm' }, keyterms: keyterms(state) },
      output: { voice: AGENT_VOICE, format: { encoding: 'audio/pcm' } },
    },
  };
}

// What the wire rail shows: the event as sent or received, with audio payloads replaced by
// their size.
function wireView(event) {
  // A replayed tape without its audio sidecar still knows how much audio was recorded.
  if (event.type === 'reply.audio') return { type: event.type, bytes: event.audio_bytes ?? Math.floor(((event.data || '').length * 3) / 4) };
  if (event.type === 'input.audio') return { type: event.type, bytes: Math.floor(((event.audio || '').length * 3) / 4) };
  if (event.type === 'session.update') return { type: event.type, tools: event.session.tools.map((t) => t.name) };
  return event;
}

const EXECUTION_MODES = new Map(voiceAgentTools().map((t) => [t.name, t.execution_mode]));

function createBridge({
  provider,
  invoke,
  store,
  evidenceWaitMs = 3000,
  resultFallbackMs = 1500,
  endWaitMs = 2000,
  timers = { setTimeout, clearTimeout },
}) {
  const events = createEmitter();
  const partials = new Map();
  let ready = false;
  let ended = false;
  let closed = false;
  let started = false;
  let connected = false;
  let stopRequested = false;
  let sessionId = null;
  let replyInFlight = false;
  // The latest of reply.started / input.speech.started / reply.done received, as in
  // AssemblyAI's own client-side tool example.
  let lastTurnEvent = null;
  let held = [];
  let fallbackTimer = null;
  let waiting = [];
  let beforeReady = [];
  let textSeq = 0;
  let droppedAudio = 0;
  let lastAgentText = null;
  let endResolve = null;

  // Never throws: a frame that cannot go out (the socket closed under it) is reported as an
  // error event, so a timer or an event handler never crashes the process.
  function send(event) {
    if (closed || ended) return false;
    try {
      provider.send(event);
    } catch (err) {
      events.emit('error', { code: 'send_failed', message: `${event.type} was not sent: ${err && err.message}` });
      return false;
    }
    if (event.type !== 'input.audio') events.emit('wire', { dir: 'out', event: wireView(event) });
    return true;
  }

  function sendResult(r) {
    if (send({ type: 'tool.result', call_id: r.call_id, result: r.result, is_error: r.is_error })) events.emit('result', { ...r, status: 'sent' });
  }

  function clearFallback() {
    if (fallbackTimer !== null) timers.clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }

  function flushHeld() {
    clearFallback();
    const due = held;
    held = [];
    for (const r of due) sendResult(r);
  }

  function hold(r, why) {
    held.push(r);
    events.emit('result', { ...r, status: 'held', why });
  }

  function queueResult(r) {
    if (closed || ended) return;
    if (replyInFlight) return hold(r, 'reply');
    if (EXECUTION_MODES.get(r.name) === 'hold' || lastTurnEvent === 'reply.done') return sendResult(r);
    hold(r, 'next-reply');
    if (fallbackTimer === null) {
      fallbackTimer = timers.setTimeout(() => {
        fallbackTimer = null;
        if (!replyInFlight) flushHeld();
      }, resultFallbackMs);
    }
    return undefined;
  }

  // Everything that could still fire into the socket: evidence waits, held results and the
  // result fallback.
  function cancelPending() {
    for (const w of waiting) timers.clearTimeout(w.timer);
    waiting = [];
    clearFallback();
    const dropped = held;
    held = [];
    for (const r of dropped) events.emit('result', { ...r, status: 'dropped', why: 'session-over' });
  }

  function runCall(ev) {
    let args = ev.arguments;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        // left as a string: the schema check refuses it and says why
      }
    }
    const res = invoke(ev.name, args, 'agent', { cause: { source: 'tool.call', call_id: ev.call_id, session_id: sessionId } });
    const payload = res.success ? res.result : { error: res.error, ...(res.details ? { details: res.details } : {}) };
    queueResult({ call_id: ev.call_id, name: ev.name, result: JSON.stringify(payload), is_error: !res.success });
  }

  function releaseWaiting() {
    const due = waiting;
    waiting = [];
    for (const w of due) {
      timers.clearTimeout(w.timer);
      runCall(w.event);
    }
  }

  function onToolCall(ev) {
    if (EVIDENCE_CHECKED.has(ev.name) && partials.size > 0) {
      const entry = { event: ev, timer: null };
      entry.timer = timers.setTimeout(() => {
        waiting = waiting.filter((w) => w !== entry);
        runCall(ev);
      }, evidenceWaitMs);
      waiting.push(entry);
      events.emit('waiting', { call_id: ev.call_id, name: ev.name });
      return;
    }
    runCall(ev);
  }

  function recordTurn(itemId, text, cause) {
    const res = invoke('record_turn', { item_id: itemId, text }, 'voice', { cause });
    events.emit('turn', res);
    return res;
  }

  function onMessage(ev) {
    events.emit('wire', { dir: 'in', event: wireView(ev) });
    switch (ev.type) {
      case 'session.ready': {
        ready = true;
        sessionId = ev.session_id || null;
        events.emit('ready', { session_id: sessionId });
        const queued = beforeReady;
        beforeReady = [];
        for (const e of queued) send(e);
        break;
      }
      case 'transcript.user.delta': {
        // The delta carries the whole turn so far: replace, never append. AssemblyAI's pages
        // disagree on its shape ({ item_id, text }, { text }, { delta }), so all three are read.
        const text = ev.text ?? ev.delta ?? '';
        const itemId = ev.item_id ?? null;
        partials.set(itemId ?? PENDING_TURN, text);
        events.emit('partial', { item_id: itemId, text });
        break;
      }
      case 'transcript.user':
        // One user turn is transcribed at a time: a finished turn ends every partial, whatever
        // key it was kept under.
        partials.clear();
        recordTurn(ev.item_id, ev.text, { source: 'transcript.user', item_id: ev.item_id, session_id: sessionId });
        releaseWaiting();
        break;
      case 'tool.call':
        onToolCall(ev);
        break;
      case 'input.speech.started':
        lastTurnEvent = ev.type;
        break;
      case 'reply.started':
        lastTurnEvent = ev.type;
        replyInFlight = true;
        break;
      case 'reply.audio':
        events.emit('audio', ev.data);
        break;
      case 'transcript.agent.delta':
        events.emit('agentDelta', { delta: ev.delta });
        break;
      case 'transcript.agent':
        lastAgentText = ev.text;
        events.emit('agent', { text: ev.text, interrupted: Boolean(ev.interrupted) });
        break;
      case 'reply.done': {
        lastTurnEvent = ev.type;
        replyInFlight = false;
        if (ev.status === 'interrupted') {
          clearFallback();
          const due = held;
          held = [];
          for (const r of due) events.emit('result', { ...r, status: 'dropped', why: 'interrupted' });
        } else {
          flushHeld();
        }
        break;
      }
      case 'session.error':
        events.emit('error', ev);
        break;
      case 'session.ended':
        ended = true;
        events.emit('ended', ev);
        if (endResolve) endResolve();
        break;
      default:
        break;
    }
  }

  return {
    on: events.on,
    async start() {
      if (started) throw new Error('bridge already started');
      started = true;
      provider.on('message', onMessage);
      provider.on('close', (info) => {
        closed = true;
        cancelPending();
        events.emit('close', info);
      });
      await provider.connect();
      connected = true;
      if (stopRequested) {
        // stop() was called while the token was being minted: end the session it just opened.
        send({ type: 'session.end' });
        provider.close();
        return;
      }
      // The session config is the one frame whose failure start() reports to its caller.
      const config = sessionConfig(store.state);
      provider.send(config);
      events.emit('wire', { dir: 'out', event: wireView(config) });
    },
    // PCM16 mono 24 kHz, base64. Audio before session.ready is dropped rather than queued: a
    // burst of queued audio would arrive faster than real time.
    sendAudio(base64) {
      if (!ready || ended || closed || !send({ type: 'input.audio', audio: base64 })) {
        droppedAudio += 1;
        return false;
      }
      return true;
    },
    // Typed text for smoke tests: recorded as a voice turn (it is what the owner "said"), then
    // given to the agent as a user message.
    sendText(text) {
      textSeq += 1;
      recordTurn(`text_${textSeq}`, text, { source: 'typed text', session_id: sessionId });
      const frames = [{ type: 'conversation.message', role: 'user', content: text }, { type: 'reply.create' }];
      if (ready) for (const f of frames) send(f);
      else beforeReady.push(...frames);
    },
    async stop() {
      cancelPending();
      // A socket the service already closed has nothing left to end or bill.
      if (!started || ended || closed) return;
      if (!connected) {
        // The socket is still being opened; start() ends it as soon as it is.
        stopRequested = true;
        return;
      }
      let timer;
      const done = new Promise((resolve) => {
        endResolve = resolve;
        timer = timers.setTimeout(resolve, endWaitMs);
      });
      // session.end stops billing at once; without it the session bills a 30 s grace window.
      send({ type: 'session.end' });
      await done;
      timers.clearTimeout(timer);
      provider.close();
    },
    status: () => ({ ready, connected, ended, closed, sessionId, replyInFlight, held: held.length, waiting: waiting.length, droppedAudio, lastAgentText }),
  };
}

module.exports = { createBridge, sessionConfig, systemPrompt, keyterms, EVIDENCE_CHECKED, AGENT_VOICE };
