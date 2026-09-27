'use strict';

// Latencies measured from a tape, never assumed. For each user turn (from the end of speech,
// input.speech.stopped):
//   firstAudioMs  until the agent's first reply.audio after it;
//   draftMs       until a draft verb that turn led to ran in the gate, read from the moment
//                 its tool.result went out: a draft verb is a hold-mode tool, sent as soon as
//                 it runs, so this includes any wait for the words it cites (up to the
//                 bridge's evidence wait) and never understates it; only calls whose recorded
//                 result was not an error count.

const DRAFT_VERBS = new Set(['draft_quote', 'revise_quote', 'draft_supplier_request']);

function stats(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return { n: sorted.length, min: sorted[0], median, max: sorted[sorted.length - 1] };
}

function measureLatency(tape) {
  const turns = [];
  let current = null;
  const pending = new Map();
  for (const { t, dir, event } of tape.lines) {
    if (dir === 'in' && event.type === 'input.speech.stopped') {
      current = { stoppedAt: t, itemId: null, text: null, transcriptAt: null, firstAudioMs: null, drafts: [] };
      turns.push(current);
    } else if (dir === 'in' && event.type === 'transcript.user' && current && current.transcriptAt === null) {
      current.itemId = event.item_id;
      current.text = event.text;
      current.transcriptAt = t;
    } else if (dir === 'in' && event.type === 'reply.audio' && current && current.firstAudioMs === null) {
      current.firstAudioMs = t - current.stoppedAt;
    } else if (dir === 'in' && event.type === 'tool.call' && DRAFT_VERBS.has(event.name) && current) {
      pending.set(event.call_id, { turn: current, name: event.name, callAt: t });
    } else if (dir === 'out' && event.type === 'tool.result' && pending.has(event.call_id)) {
      const p = pending.get(event.call_id);
      pending.delete(event.call_id);
      if (!event.is_error) p.turn.drafts.push({ tool: p.name, call_id: event.call_id, draftMs: t - p.turn.stoppedAt });
    }
  }
  return {
    sessionId: tape.header.sessionId,
    synthetic: Boolean(tape.header.synthetic),
    turns: turns.map((x) => ({ item_id: x.itemId, text: x.text, firstAudioMs: x.firstAudioMs, drafts: x.drafts })),
    endOfSpeechToFirstAudio: stats(turns.map((x) => x.firstAudioMs).filter((v) => v !== null)),
    endOfSpeechToDraft: stats(turns.flatMap((x) => x.drafts.map((d) => d.draftMs))),
  };
}

// The protocol order around the first call to `name`: every event type from that tool.call up
// to and including the next reply.done after its tool.result, with offsets from the call. The
// first live run logs this for one `hold` and one `interactive` tool, and the bridge tests
// encode it.
function callOrder(tape, name) {
  const start = tape.lines.findIndex((l) => l.dir === 'in' && l.event.type === 'tool.call' && l.event.name === name);
  if (start < 0) return null;
  const call = tape.lines[start].event;
  const order = [];
  let resultSent = false;
  for (const { t, dir, event } of tape.lines.slice(start)) {
    order.push({ ms: t - tape.lines[start].t, dir, type: event.type, ...(event.call_id ? { call_id: event.call_id } : {}), ...(event.status ? { status: event.status } : {}) });
    if (dir === 'out' && event.type === 'tool.result' && event.call_id === call.call_id) resultSent = true;
    if (resultSent && dir === 'in' && event.type === 'reply.done') break;
  }
  return { name, call_id: call.call_id, order: order.filter((e) => e.type !== 'reply.audio' && e.type !== 'transcript.agent.delta') };
}

module.exports = { measureLatency, callOrder };
