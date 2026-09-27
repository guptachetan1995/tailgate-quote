'use strict';

// The dashboard over a real socket: the page and its scripts are served, the owner's buttons
// reach invoke() as "owner" through POST /api/invoke, and the agent cannot use that route or
// its own voice session to reach an owner-only verb. The actor is fixed by where a call comes
// from, never by what the model puts in its arguments.

const { selectVoices } = require('../src/server');
const { createStore } = require('../src/store');
const { FakeVoiceProvider } = require('../src/voice/fake');
const { LINES } = require('../src/voice/scenario');
const { OWNER_VERB_NAMES } = require('../src/invoke');
const { FIXTURE } = require('../scripts/make-sample-tape');
const { MARKER } = require('../scripts/build-pages');
const { QUOTE_ARGS } = require('./helpers');
const { listen, openEvents, request } = require('./http');

// A server whose voice session is the fake provider, with the demo's quote and supplier
// request already drafted by the agent through it.
async function withDrafts() {
  const provider = new FakeVoiceProvider();
  const srv = await listen({ voices: [{ mode: 'fake', label: 'Fake', create: () => provider }] });
  await srv.call('POST', '/api/voice/start', { mode: 'fake' });
  provider.emit({ type: 'transcript.user', item_id: 'item_u1', text: LINES.U1 });
  provider.emit({ type: 'transcript.user', item_id: 'item_u1b', text: LINES.U1B });
  provider.emit({ type: 'tool.call', call_id: 'call_q', name: 'draft_quote', arguments: QUOTE_ARGS });
  provider.emit({ type: 'transcript.user', item_id: 'item_u3', text: LINES.U3 });
  provider.emit({
    type: 'tool.call',
    call_id: 'call_s',
    name: 'draft_supplier_request',
    arguments: { supplier: 'Northgate', lines: [{ sku: 'AQN-TX199', qty: 1, heard: 'the TX-199' }], needed_by: 'Thursday', needed_by_heard: 'for Thursday' },
  });
  const state = (await srv.call('GET', '/api/state')).json();
  expect(state.drafts.map((d) => [d.id, d.status, d.createdBy])).toEqual([
    ['Q-1001', 'draft', 'agent'],
    ['S-2001', 'draft', 'agent'],
  ]);
  return { ...srv, provider };
}

const resultOf = (provider, callId) => {
  const sent = provider.sentOfType('tool.result').find((r) => r.call_id === callId);
  return { ...sent, payload: JSON.parse(sent.result) };
};

describe('the page', () => {
  let srv;
  beforeAll(async () => {
    srv = await listen();
  });
  afterAll(() => srv.close());

  test('GET / serves the dashboard; the served page keeps the Pages marker and never loads the static bundle', async () => {
    const res = await srv.call('GET', '/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain(MARKER);
    expect(res.text).not.toContain('tailgate.bundle.js');
    for (const text of ['Approve &amp; send', 'Try it as the agent', 'AssemblyAI wire rail', 'Replay recorded session', 'Live mic']) {
      expect(res.text + (await srv.call('GET', '/app.js')).text).toContain(text);
    }
  });

  test('its scripts are served as JavaScript, with the same guards as the API', async () => {
    for (const file of ['/app.js', '/audio.js', '/mic-worklet.js']) {
      const res = await srv.call('GET', file);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/javascript/);
    }
    expect((await srv.call('GET', '/app.js', undefined, { Host: 'evil.example.com' })).status).toBe(403);
  });
});

describe("the owner's buttons and the agent", () => {
  let srv;
  beforeEach(async () => {
    srv = await withDrafts();
  });
  afterEach(() => srv.close());

  test('Approve & send, Edit and Reject post to /api/invoke and reach invoke() as the owner', async () => {
    const edit = await srv.call('POST', '/api/invoke', { tool: 'revise_quote', args: { draft_id: 'Q-1001', changes: [{ op: 'set_qty', sku: 'BWK-BV34', qty: 3 }] }, actor: 'owner' });
    expect(edit.json()).toMatchObject({ success: true, result: { revisions: [{ op: 'set_qty', from: 2, to: 3, by: 'owner', heard: null }] } });
    const send = await srv.call('POST', '/api/invoke', { tool: 'send_quote', args: { draft_id: 'Q-1001' }, actor: 'owner' });
    expect(send.json()).toMatchObject({ success: true, result: { draft: { status: 'sent', sentBy: 'owner' }, outbox: { to: 'priya.shah@example.com', by: 'owner' } } });
    const reject = await srv.call('POST', '/api/invoke', { tool: 'discard_draft', args: { draft_id: 'S-2001', reason: 'Calling Northgate myself' }, actor: 'owner' });
    expect(reject.json()).toMatchObject({ success: true, result: { draft: { status: 'discarded', discardedBy: 'owner' } } });

    const log = (await srv.call('GET', '/api/activity')).json().filter((e) => e.cause.source === 'http');
    expect(log.map((e) => [e.actor, e.tool, e.outcome])).toEqual([
      ['owner', 'revise_quote', 'ok'],
      ['owner', 'send_quote', 'ok'],
      ['owner', 'discard_draft', 'ok'],
    ]);
  });

  test('the agent cannot use that route for an owner-only verb, and nothing changes', async () => {
    const before = (await srv.call('GET', '/api/state')).json();
    for (const tool of OWNER_VERB_NAMES) {
      const args = tool === 'discard_draft' ? { draft_id: 'Q-1001', reason: 'x' } : { draft_id: tool === 'send_quote' ? 'Q-1001' : 'S-2001' };
      const res = await srv.call('POST', '/api/invoke', { tool, args, actor: 'agent' });
      expect(res.status).toBe(200);
      expect(res.json()).toMatchObject({ success: false, error: expect.stringMatching(`${tool} is owner-only`) });
    }
    // Only "agent" and "owner" exist over HTTP: no "human", no "voice", no default.
    for (const actor of ['human', 'voice', 'Owner', undefined]) {
      expect((await srv.call('POST', '/api/invoke', { tool: 'send_quote', args: { draft_id: 'Q-1001' }, actor })).status).toBe(400);
    }
    expect((await srv.call('GET', '/api/state')).json()).toEqual(before);
  });

  test("nor through its own voice session: the bridge fixes the actor, whatever the model's arguments say", async () => {
    const before = (await srv.call('GET', '/api/state')).json();
    const { provider } = srv;
    provider.emit({ type: 'tool.call', call_id: 'c1', name: 'send_quote', arguments: { draft_id: 'Q-1001' } });
    provider.emit({ type: 'tool.call', call_id: 'c2', name: 'send_quote', arguments: { draft_id: 'Q-1001', actor: 'owner' } });
    provider.emit({ type: 'tool.call', call_id: 'c3', name: 'discard_draft', arguments: { draft_id: 'S-2001', reason: 'no' } });
    provider.emit({ type: 'tool.call', call_id: 'c4', name: 'revise_quote', arguments: { draft_id: 'Q-1001', actor: 'owner', changes: [{ op: 'remove', sku: 'FLX-PA34', heard: 'twenty feet of Flexline PEX' }] } });
    provider.emit({ type: 'tool.call', call_id: 'c5', name: 'revise_quote', arguments: { draft_id: 'Q-1001', changes: [{ op: 'set_qty', sku: 'FLX-PA34', qty: 30, heard: 'make that thirty feet', actor: 'owner' }] } });
    // The end of the reply these calls arrived in: when interactive results may go out.
    provider.emit({ type: 'reply.done', reply_id: 'r', status: 'completed' });

    for (const id of ['c1', 'c2', 'c3']) expect(resultOf(provider, id)).toMatchObject({ is_error: true, payload: { error: expect.stringMatching(/owner-only/) } });
    for (const id of ['c4', 'c5']) expect(resultOf(provider, id)).toMatchObject({ is_error: true, payload: { error: expect.stringMatching(/actor" is not a field of revise_quote/) } });
    expect((await srv.call('GET', '/api/state')).json()).toEqual(before);

    const log = (await srv.call('GET', '/api/activity')).json().filter((e) => ['c1', 'c2', 'c3', 'c4', 'c5'].includes(e.cause.call_id));
    expect(log.map((e) => [e.actor, e.outcome])).toEqual(Array(5).fill(['agent', 'refused']));
  });

  test('a spoken "send it" is recorded and refused as approval; only the tap after it sends', async () => {
    const { provider } = srv;
    provider.emit({ type: 'transcript.user', item_id: 'item_u4', text: LINES.U4 });
    let state = (await srv.call('GET', '/api/state')).json();
    expect(state.drafts.map((d) => [d.status, d.spokenApprovalsRefused])).toEqual([
      ['draft', ['turn_4']],
      ['draft', ['turn_4']],
    ]);
    expect(state.outbox).toEqual([]);
    await srv.call('POST', '/api/invoke', { tool: 'send_quote', args: { draft_id: 'Q-1001' }, actor: 'owner' });
    state = (await srv.call('GET', '/api/state')).json();
    expect(state.outbox.map((o) => [o.draftId, o.by])).toEqual([['Q-1001', 'owner']]);
  });
});

describe('the mode switch', () => {
  // As start() wires it: the store reads a clock that a replay session points at its tape.
  function replayServer() {
    const clock = { now: Date.now };
    const store = createStore({ now: () => clock.now() });
    const voices = selectVoices({ key: null, argv: ['--replay', FIXTURE, '--speed', 'Infinity'], store, clock });
    return listen({ store, voices });
  }

  test('GET /api/voice lists the modes; Live is refused when the server has no key; the body is only { mode }', async () => {
    const srv = await replayServer();
    try {
      expect((await srv.call('GET', '/api/voice')).json()).toEqual({
        modes: [{ mode: 'replay', label: 'Scripted sample, not a recorded session', synthetic: true, audio: false }],
        active: false,
        mode: null,
        label: null,
        status: null,
      });
      const live = await srv.call('POST', '/api/voice/start', { mode: 'live' });
      expect(live.status).toBe(400);
      expect(live.json().error).toMatch(/"live" is not offered here\. Live mode needs the local server started with ASSEMBLYAI_API_KEY/);
      expect((await srv.call('POST', '/api/voice/start', { mode: 'replay', speed: 99 })).status).toBe(400);
      expect((await srv.call('POST', '/api/voice/start', [])).status).toBe(400);
      expect((await srv.call('GET', '/api/voice')).json().active).toBe(false);
    } finally {
      await srv.close();
    }
  });

  test('without any voice configured, starting a session is a 404 and audio is a 409', async () => {
    const srv = await listen();
    try {
      expect((await srv.call('GET', '/api/voice')).json()).toMatchObject({ modes: [], active: false });
      expect((await srv.call('POST', '/api/voice/start', {})).status).toBe(404);
      const audio = await request(srv.port, { method: 'POST', path: '/api/audio', headers: { Host: `127.0.0.1:${srv.port}`, 'Content-Type': 'application/octet-stream' }, body: Buffer.alloc(4) });
      expect(audio.status).toBe(409);
    } finally {
      await srv.close();
    }
  });

  test('a replay streams the session to the page as voice.* events stamped with the session clock, and ends itself', async () => {
    const srv = await replayServer();
    const stream = openEvents(srv.port);
    try {
      await stream.ready;
      expect((await srv.call('POST', '/api/voice/start', { mode: 'replay' })).status).toBe(200);
      const events = await stream.waitFor((e) => e.type === 'voice.close');
      const types = new Set(events.map((e) => e.type));
      for (const t of ['voice.start', 'voice.ready', 'voice.partial', 'voice.agentDelta', 'voice.agent', 'voice.result', 'voice.wire', 'voice.progress', 'voice.ended', 'activity']) {
        expect(types).toContain(t);
      }
      const voiceEvents = events.filter((e) => e.type.startsWith('voice.'));
      expect(voiceEvents.every((e) => typeof e.data.ms === 'number')).toBe(true);
      expect(events.find((e) => e.type === 'voice.start').data).toMatchObject({ mode: 'replay', synthetic: true, ms: 0 });
      const partial = events.find((e) => e.type === 'voice.partial');
      expect(partial.data).toEqual({ item_id: 'item_u1', text: 'New job for Priya Shah', ms: 6600 });
      const interrupted = events.find((e) => e.type === 'voice.wire' && e.data.event.type === 'reply.done' && e.data.event.status === 'interrupted');
      expect(interrupted.data.ms).toBe(27830);
      const audio = events.find((e) => e.type === 'voice.wire' && e.data.event.type === 'reply.audio');
      expect(audio.data.event.bytes).toBe(6);
      expect(events.filter((e) => e.type === 'voice.audio')).toEqual([]);
      expect(events.at(-1)).toMatchObject({ type: 'voice.close' });
      expect((await srv.call('GET', '/api/voice')).json().active).toBe(false);
    } finally {
      stream.close();
      await srv.close();
    }
  });
});
