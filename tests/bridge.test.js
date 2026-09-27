'use strict';

// The voice bridge against the fake provider: protocol shape, the actor it asserts, and the
// tool-result timing rule with its two guards.

const { createBridge, sessionConfig, keyterms, EVIDENCE_CHECKED } = require('../src/voice/bridge');
const { FakeVoiceProvider } = require('../src/voice/fake');
const { validate } = require('../src/schema');
const { AGENT_TOOL_NAMES } = require('../src/tools');
const { LINES } = require('../src/voice/scenario');
const { setup, QUOTE_ARGS } = require('./helpers');

async function started(opts = {}) {
  const ctx = setup();
  const provider = new FakeVoiceProvider(opts.provider);
  const bridge = createBridge({ provider, invoke: ctx.invoke, store: ctx.store, ...opts.bridge });
  await bridge.start();
  return { ...ctx, provider, bridge };
}

const results = (provider) => provider.sentOfType('tool.result');
const userTurn = (provider, itemId, text) => {
  provider.emit({ type: 'transcript.user', item_id: itemId, text });
};
// The end of the agent reply an interactive tool.call arrived in: when its result may go out.
const replyDone = (provider, status = 'completed') => provider.emit({ type: 'reply.done', reply_id: 'r', status });

describe('session setup', () => {
  test('session.update is the first frame, and nothing else goes out before session.ready', async () => {
    const { provider, bridge } = await started({ provider: { autoReady: false } });
    expect(provider.sent.map((e) => e.type)).toEqual(['session.update']);
    expect(bridge.sendAudio('AAAA')).toBe(false);
    bridge.sendText('New job for Helen Marsh.');
    expect(provider.sent.map((e) => e.type)).toEqual(['session.update']);
    provider.emit({ type: 'session.ready', session_id: 'sess_test' });
    expect(provider.sent.map((e) => e.type)).toEqual(['session.update', 'conversation.message', 'reply.create']);
    expect(bridge.sendAudio('AAAA')).toBe(true);
    expect(provider.sent.at(-1)).toEqual({ type: 'input.audio', audio: 'AAAA' });
    expect(bridge.status()).toMatchObject({ ready: true, sessionId: 'sess_test', droppedAudio: 1 });
  });

  test('tools go out in the flat form, with a timeout and a mode on every tool', () => {
    const cfg = sessionConfig(setup().store.state);
    expect(cfg.type).toBe('session.update');
    expect(cfg.session.tools.map((t) => t.name)).toEqual(AGENT_TOOL_NAMES);
    for (const tool of cfg.session.tools) {
      expect(Object.keys(tool).sort()).toEqual(['description', 'execution_mode', 'name', 'parameters', 'timeout_seconds', 'type']);
      expect(tool.type).toBe('function');
      expect(tool.timeout_seconds).toBeGreaterThan(0);
      expect(tool.execution_mode).toBe(EVIDENCE_CHECKED.has(tool.name) ? 'hold' : 'interactive');
      expect(validate({ type: 'object' }, tool.parameters, tool.name)).toBeNull();
      expect(tool.parameters.additionalProperties).toBe(false);
    }
  });

  test('the prompt carries the refusal line and the greeting names the owner', () => {
    const { session } = sessionConfig(setup().store.state);
    expect(session.system_prompt).toContain("I heard that, but I can't send anything. The quote's on Dave's screen, and only his tap sends it.");
    expect(session.system_prompt).toMatch(/cannot tell who is speaking/);
    expect(session.greeting).toBe("Tailgate's open, Dave. Tell me about the job.");
    expect(session.output).toEqual({ voice: 'anna', format: { encoding: 'audio/pcm' } });
  });

  test('keyterms come from the owner data: at most 100 terms of at most 50 characters', () => {
    const terms = keyterms(setup().store.state);
    expect(terms.length).toBeGreaterThan(10);
    expect(terms.length).toBeLessThanOrEqual(100);
    for (const t of terms) expect(t.length).toBeLessThanOrEqual(50);
    expect(terms).toEqual(expect.arrayContaining(['Aquilon', 'TX-199', 'AQN-TX199', 'Brasswick', 'Northgate Plumbing Supply', 'Priya Shah', '41 Linden Avenue']));
    expect(new Set(terms).size).toBe(terms.length);
  });
});

describe('routing', () => {
  test('a tool.call runs as the agent, never as anyone else, with its cause', async () => {
    const { provider, store } = await started();
    provider.emit({ type: 'tool.call', call_id: 'call_1', name: 'search_catalog', arguments: { query: 'Panrite' } });
    replyDone(provider);
    expect(store.activityLog().at(-1)).toMatchObject({
      actor: 'agent',
      tool: 'search_catalog',
      outcome: 'ok',
      cause: { source: 'tool.call', call_id: 'call_1', session_id: 'sess_fake_0001' },
    });
  });

  test('a finished user transcript is recorded as a voice turn', async () => {
    const { provider, store } = await started();
    userTurn(provider, 'item_u1', LINES.U1);
    expect(store.state.turns).toEqual([expect.objectContaining({ id: 'turn_1', itemId: 'item_u1', text: LINES.U1 })]);
    expect(store.activityLog().at(-1)).toMatchObject({ actor: 'voice', tool: 'record_turn', cause: { source: 'transcript.user', item_id: 'item_u1' } });
  });

  test('tool.result.result is a JSON string, and refusals come back with is_error', async () => {
    const { provider } = await started();
    provider.emit({ type: 'tool.call', call_id: 'call_1', name: 'search_catalog', arguments: { query: 'TX-199' } });
    provider.emit({ type: 'tool.call', call_id: 'call_2', name: 'search_catalog', arguments: { query: 'TX-199', unit_price: 1 } });
    replyDone(provider);
    const [ok, refused] = results(provider);
    expect(typeof ok.result).toBe('string');
    expect(JSON.parse(ok.result).results[0].sku).toBe('AQN-TX199');
    expect(ok.is_error).toBe(false);
    expect(refused.is_error).toBe(true);
    expect(JSON.parse(refused.result)).toEqual({ error: expect.stringContaining('"unit_price" is not a field'), details: { field: 'unit_price' } });
  });

  test('a hallucinated send_quote goes through the gate and comes back as an error', async () => {
    const { provider, store, invoke } = await started();
    userTurn(provider, 'item_u1', LINES.U1);
    userTurn(provider, 'item_u1b', LINES.U1B);
    invoke('draft_quote', QUOTE_ARGS, 'agent');
    const before = store.snapshot();
    provider.emit({ type: 'tool.call', call_id: 'call_x', name: 'send_quote', arguments: { draft_id: 'Q-1001' } });
    provider.emit({ type: 'tool.call', call_id: 'call_y', name: 'approve_and_send', arguments: {} });
    replyDone(provider);
    const [x, y] = results(provider);
    expect(x).toMatchObject({ call_id: 'call_x', is_error: true });
    expect(JSON.parse(x.result).error).toMatch(/owner-only/);
    expect(y).toMatchObject({ call_id: 'call_y', is_error: true });
    expect(JSON.parse(y.result).error).toMatch(/Unknown tool/);
    expect(store.snapshot()).toEqual(before);
    expect(store.state.drafts[0].status).toBe('draft');
  });

  test('arguments that arrive as a JSON string are parsed', async () => {
    const { provider } = await started();
    provider.emit({ type: 'tool.call', call_id: 'c', name: 'search_catalog', arguments: '{"query":"Panrite"}' });
    replyDone(provider);
    expect(results(provider)[0].is_error).toBe(false);
  });

  test('reply.audio is read from `data`', async () => {
    const { provider, bridge } = await started();
    const got = [];
    bridge.on('audio', (d) => got.push(d));
    provider.emit({ type: 'reply.audio', data: 'UENNMTY=' });
    provider.emit({ type: 'reply.audio', audio: 'd3Jvbmc=' });
    expect(got).toEqual(['UENNMTY=', undefined]);
  });

  test('each transcript.user.delta carries the whole partial and replaces the last one', async () => {
    const { provider, bridge } = await started();
    const partials = [];
    bridge.on('partial', (p) => partials.push(p.text));
    provider.emit({ type: 'transcript.user.delta', item_id: 'i', text: 'New job' });
    provider.emit({ type: 'transcript.user.delta', item_id: 'i', text: 'New job for Priya' });
    expect(partials).toEqual(['New job', 'New job for Priya']);
  });

  test('a delta in any of the documented shapes is read: { item_id, text }, { text } and { delta }', async () => {
    const { provider, bridge } = await started();
    const partials = [];
    bridge.on('partial', (p) => partials.push(p));
    provider.emit({ type: 'transcript.user.delta', text: "What's the weather in" });
    provider.emit({ type: 'transcript.user.delta', delta: 'hey there' });
    expect(partials).toEqual([
      { item_id: null, text: "What's the weather in" },
      { item_id: null, text: 'hey there' },
    ]);
  });

  test('an id-less partial is ended by the finished turn, so a draft call after it runs at once', async () => {
    const { provider, store } = await started();
    userTurn(provider, 'item_u1', LINES.U1);
    provider.emit({ type: 'transcript.user.delta', text: 'Three' });
    userTurn(provider, 'item_u1b', LINES.U1B);
    provider.emit({ type: 'tool.call', call_id: 'c1', name: 'draft_quote', arguments: QUOTE_ARGS });
    expect(results(provider)).toEqual([expect.objectContaining({ call_id: 'c1', is_error: false })]);
    expect(store.state.drafts).toHaveLength(1);
  });

  test('typed text is recorded as a voice turn, then given to the agent', async () => {
    const { provider, bridge, store } = await started();
    bridge.sendText('And a Ventora vent kit.');
    expect(store.state.turns.at(-1)).toMatchObject({ itemId: 'text_1', text: 'And a Ventora vent kit.' });
    expect(store.activityLog().at(-1)).toMatchObject({ actor: 'voice', cause: { source: 'typed text' } });
    expect(provider.sent.slice(-2)).toEqual([{ type: 'conversation.message', role: 'user', content: 'And a Ventora vent kit.' }, { type: 'reply.create' }]);
  });

  test('stop sends session.end and closes the socket', async () => {
    const { provider, bridge } = await started();
    await bridge.stop();
    expect(provider.sent.at(-1)).toEqual({ type: 'session.end' });
    expect(provider.closed).toBe(true);
    expect(bridge.status().ended).toBe(true);
  });
});

describe('tool-result timing', () => {
  test('an interactive result goes out at once when reply.done is the latest turn event', async () => {
    const { provider } = await started();
    provider.emit({ type: 'reply.started', reply_id: 'r1' });
    provider.emit({ type: 'reply.done', reply_id: 'r1', status: 'completed' });
    provider.emit({ type: 'tool.call', call_id: 'c1', name: 'get_board', arguments: {} });
    expect(results(provider).map((r) => r.call_id)).toEqual(['c1']);
  });

  test('documented order: tool.call, then reply.done, and only then the tool.result', async () => {
    const { provider, bridge } = await started();
    const statuses = [];
    bridge.on('result', (r) => statuses.push(`${r.call_id}:${r.status}`));
    provider.emit({ type: 'input.speech.started' });
    provider.emit({ type: 'transcript.user', item_id: 'i1', text: 'Is the Panrite pan in stock?' });
    provider.emit({ type: 'tool.call', call_id: 'c1', name: 'search_catalog', arguments: { query: 'Panrite' } });
    expect(results(provider)).toEqual([]);
    replyDone(provider);
    expect(results(provider).map((r) => r.call_id)).toEqual(['c1']);
    expect(statuses).toEqual(['c1:held', 'c1:sent']);
  });

  test('an interactive result that never sees a reply.done goes out after the fallback', async () => {
    jest.useFakeTimers();
    try {
      const { provider, bridge } = await started({ bridge: { timers: { setTimeout, clearTimeout } } });
      provider.emit({ type: 'input.speech.started' });
      provider.emit({ type: 'tool.call', call_id: 'c1', name: 'get_board', arguments: {} });
      jest.advanceTimersByTime(1499);
      expect(results(provider)).toEqual([]);
      expect(bridge.status().held).toBe(1);
      jest.advanceTimersByTime(1);
      expect(results(provider).map((r) => r.call_id)).toEqual(['c1']);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a hold-mode result goes out at once when no reply is in flight: a hold has no reply.started', async () => {
    const { provider } = await started();
    provider.emit({ type: 'input.speech.started' });
    userTurn(provider, 'item_u1', LINES.U1);
    userTurn(provider, 'item_u1b', LINES.U1B);
    provider.emit({ type: 'tool.call', call_id: 'c1', name: 'draft_quote', arguments: QUOTE_ARGS });
    expect(results(provider).map((r) => [r.call_id, r.is_error])).toEqual([['c1', false]]);
  });

  test('a result is held while a reply is in flight and sent on its reply.done', async () => {
    const { provider, bridge } = await started();
    const statuses = [];
    bridge.on('result', (r) => statuses.push(`${r.call_id}:${r.status}`));
    provider.emit({ type: 'reply.started', reply_id: 'r1' });
    provider.emit({ type: 'tool.call', call_id: 'c1', name: 'search_catalog', arguments: { query: 'Panrite' } });
    expect(results(provider)).toEqual([]);
    expect(bridge.status().held).toBe(1);
    provider.emit({ type: 'reply.done', reply_id: 'r1', status: 'completed' });
    expect(results(provider).map((r) => r.call_id)).toEqual(['c1']);
    expect(statuses).toEqual(['c1:held', 'c1:sent']);
  });

  test('a result held when the owner barges in is dropped with the interrupted reply', async () => {
    const { provider, bridge } = await started();
    const statuses = [];
    bridge.on('result', (r) => statuses.push(`${r.call_id}:${r.status}`));
    provider.emit({ type: 'reply.started', reply_id: 'r1' });
    provider.emit({ type: 'input.speech.started' });
    provider.emit({ type: 'tool.call', call_id: 'c1', name: 'get_board', arguments: {} });
    provider.emit({ type: 'reply.done', reply_id: 'r1', status: 'interrupted' });
    expect(results(provider)).toEqual([]);
    expect(statuses).toEqual(['c1:held', 'c1:dropped']);
    provider.emit({ type: 'tool.call', call_id: 'c2', name: 'get_board', arguments: {} });
    expect(results(provider).map((r) => r.call_id)).toEqual(['c2']);
  });

  test('a draft call that arrives mid-turn waits for the turn it cites', async () => {
    const { provider, store } = await started();
    userTurn(provider, 'item_u1', LINES.U1);
    provider.emit({ type: 'transcript.user.delta', item_id: 'item_u1b', text: 'Three' });
    provider.emit({ type: 'tool.call', call_id: 'c1', name: 'draft_quote', arguments: QUOTE_ARGS });
    expect(results(provider)).toEqual([]);
    expect(store.state.drafts).toHaveLength(0);
    userTurn(provider, 'item_u1b', LINES.U1B);
    const [r] = results(provider);
    expect(r).toMatchObject({ call_id: 'c1', is_error: false });
    expect(JSON.parse(r.result).draft.lines).toHaveLength(3);
  });

  test('if the cited turn never arrives, the call runs after the wait and is refused as not heard yet', async () => {
    jest.useFakeTimers();
    try {
      const ctx = setup();
      const provider = new FakeVoiceProvider();
      const bridge = createBridge({ provider, invoke: ctx.invoke, store: ctx.store, timers: { setTimeout, clearTimeout } });
      await bridge.start();
      userTurn(provider, 'item_u1', LINES.U1);
      provider.emit({ type: 'transcript.user.delta', item_id: 'item_u1b', text: 'Three' });
      provider.emit({ type: 'tool.call', call_id: 'c1', name: 'draft_quote', arguments: QUOTE_ARGS });
      jest.advanceTimersByTime(2999);
      expect(results(provider)).toEqual([]);
      jest.advanceTimersByTime(1);
      const [r] = results(provider);
      expect(r.is_error).toBe(false);
      const body = JSON.parse(r.result);
      expect(body.refused).toEqual([expect.objectContaining({ sku: 'BWK-BV34', reason: expect.stringMatching(/not in any turn heard so far/) })]);
    } finally {
      jest.useRealTimers();
    }
  });

  test('read calls never wait for a turn', async () => {
    const { provider, bridge } = await started();
    provider.emit({ type: 'transcript.user.delta', item_id: 'i', text: 'Is the' });
    provider.emit({ type: 'tool.call', call_id: 'c1', name: 'get_board', arguments: {} });
    expect(bridge.status().waiting).toBe(0);
    replyDone(provider);
    expect(results(provider).map((r) => r.call_id)).toEqual(['c1']);
  });
});

describe('when the socket closes under the bridge', () => {
  test('a draft call waiting for its turn is cancelled: nothing runs, nothing is sent, nothing throws', async () => {
    jest.useFakeTimers();
    try {
      const { provider, bridge, store } = await started({ bridge: { timers: { setTimeout, clearTimeout } } });
      const errors = [];
      bridge.on('error', (e) => errors.push(e));
      userTurn(provider, 'item_u1', LINES.U1);
      provider.emit({ type: 'transcript.user.delta', item_id: 'item_u1b', text: 'Three' });
      provider.emit({ type: 'tool.call', call_id: 'c1', name: 'draft_quote', arguments: QUOTE_ARGS });
      expect(bridge.status().waiting).toBe(1);
      provider.close();
      expect(bridge.status()).toMatchObject({ closed: true, waiting: 0, held: 0 });
      jest.advanceTimersByTime(10000);
      expect(store.state.drafts).toHaveLength(0);
      expect(results(provider)).toEqual([]);
      expect(errors).toEqual([]);
      await bridge.stop();
    } finally {
      jest.useRealTimers();
    }
  });

  test('held results and their fallback are dropped, and a send to a dead socket is an error event, never a throw', async () => {
    jest.useFakeTimers();
    try {
      const { provider, bridge } = await started({ bridge: { timers: { setTimeout, clearTimeout } } });
      const statuses = [];
      bridge.on('result', (r) => statuses.push(`${r.call_id}:${r.status}`));
      provider.emit({ type: 'input.speech.started' });
      provider.emit({ type: 'tool.call', call_id: 'c1', name: 'get_board', arguments: {} });
      provider.close();
      jest.advanceTimersByTime(5000);
      expect(statuses).toEqual(['c1:held', 'c1:dropped']);
      expect(results(provider)).toEqual([]);
      expect(bridge.sendAudio('AAAA')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a provider whose send throws (the socket went away before its close event) is reported, not thrown', async () => {
    const { provider, bridge } = await started();
    const errors = [];
    bridge.on('error', (e) => errors.push(e.code));
    provider.send = () => {
      throw new Error('socket not open');
    };
    replyDone(provider);
    expect(() => provider.emit({ type: 'tool.call', call_id: 'c1', name: 'get_board', arguments: {} })).not.toThrow();
    expect(errors).toEqual(['send_failed']);
  });
});

describe('stopping while the socket is still being opened', () => {
  test('stop() before connect resolves sends nothing then; start() ends the session as soon as it opens', async () => {
    const ctx = setup();
    const provider = new FakeVoiceProvider();
    let open;
    provider.connect = () =>
      new Promise((resolve) => {
        open = () => {
          provider.connected = true;
          resolve();
        };
      });
    const bridge = createBridge({ provider, invoke: ctx.invoke, store: ctx.store });
    const starting = bridge.start();
    await bridge.stop();
    expect(provider.sent).toEqual([]);
    open();
    await starting;
    expect(provider.sent.map((e) => e.type)).toEqual(['session.end']);
    expect(provider.closed).toBe(true);
  });
});
