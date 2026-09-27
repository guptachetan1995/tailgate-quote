'use strict';

// The live Voice Agent API provider against a scripted fetch and a scripted WebSocket: the
// token is minted server-side with a Bearer header, the socket connects by token, frames flow
// both ways as JSON, and the key never appears anywhere it could leak. No network.

const util = require('util');
const { AssemblyAIVoiceProvider } = require('../src/voice/assemblyai');
const { synthesizeLine } = require('../src/voice/synthesize');
const { createBridge } = require('../src/voice/bridge');
const { FakeVoiceProvider } = require('../src/voice/fake');
const { LINES } = require('../src/voice/scenario');
const { setup, QUOTE_ARGS } = require('./helpers');
const { mockWebSocketClass, scriptedFetch, virtualTime, forbidNetwork } = require('./fakes');

const KEY = 'aai-test-key-6f1c0e9d2b7a4c3e';
const TOKEN = 'tmp-token-9a8b7c6d5e4f';

let restoreNetwork;
beforeAll(() => {
  restoreNetwork = forbidNetwork();
});
afterAll(() => restoreNetwork());

function makeProvider(fetchAnswers = [{ status: 200, body: { token: TOKEN, expires_in_seconds: 60 } }], opts = {}) {
  const WS = mockWebSocketClass();
  const fetch = scriptedFetch(...fetchAnswers);
  const provider = new AssemblyAIVoiceProvider({ apiKey: KEY, fetch, WebSocket: WS, ...opts });
  const seen = [];
  const errors = [];
  const closes = [];
  provider.on('message', (e) => seen.push(e));
  provider.on('error', (e) => errors.push(e));
  provider.on('close', (e) => closes.push(e));
  return { provider, WS, fetch, seen, errors, closes };
}

// Starts connect(), waits for the socket to be constructed, then opens it from the "server".
async function connected(ctx) {
  const pending = ctx.provider.connect();
  await new Promise((r) => setImmediate(r));
  const ws = ctx.WS.instances[0];
  ws.open();
  await pending;
  return ws;
}

describe('connecting', () => {
  test('mints a token server-side with Bearer auth, then connects by token alone', async () => {
    const ctx = makeProvider();
    const ws = await connected(ctx);
    expect(ctx.fetch.calls).toEqual([
      {
        url: 'https://agents.assemblyai.com/v1/token?expires_in_seconds=60&max_session_duration_seconds=600',
        init: { method: 'GET', headers: { Authorization: `Bearer ${KEY}` } },
      },
    ]);
    expect(ws.url).toBe(`wss://agents.assemblyai.com/v1/ws?token=${TOKEN}`);
    expect(ws.url).not.toContain(KEY);
    expect(ws.binaryType).toBe('arraybuffer');
  });

  test('the token lifetime and session cap are configurable', async () => {
    const ctx = makeProvider(undefined, { tokenTtlSeconds: 30, maxSessionSeconds: 180 });
    await connected(ctx);
    expect(ctx.fetch.calls[0].url).toBe('https://agents.assemblyai.com/v1/token?expires_in_seconds=30&max_session_duration_seconds=180');
  });

  test('a refused token request explains itself without repeating the key', async () => {
    const ctx = makeProvider([{ status: 401, body: { error: `invalid key ${KEY}` } }]);
    const err = await ctx.provider.connect().catch((e) => e);
    expect(err.message).toMatch(/HTTP 401/);
    expect(err.message).toMatch(/Check that ASSEMBLYAI_API_KEY/);
    expect(err.message).toContain('[redacted]');
    expect(err.message).not.toContain(KEY);
    expect(ctx.WS.instances).toHaveLength(0);
  });

  test('a network failure is reported without the key', async () => {
    const ctx = makeProvider([new Error(`getaddrinfo ENOTFOUND with ${KEY}`)]);
    const err = await ctx.provider.connect().catch((e) => e);
    expect(err.message).toMatch(/Could not reach AssemblyAI/);
    expect(err.message).not.toContain(KEY);
  });

  test('a token response without a token is an error', async () => {
    const ctx = makeProvider([{ status: 200, body: { expires_in_seconds: 60 } }]);
    await expect(ctx.provider.connect()).rejects.toThrow(/without a token/);
  });

  test('a socket closed before it opens (1008) rejects with the reason, redacted', async () => {
    const ctx = makeProvider();
    const pending = ctx.provider.connect();
    await new Promise((r) => setImmediate(r));
    ctx.WS.instances[0].serverClose(1008, `Authentication failed for ${TOKEN}`);
    const err = await pending.catch((e) => e);
    expect(err.message).toMatch(/code 1008 \(unauthorized, or the account has no balance\)/);
    expect(err.message).not.toContain(TOKEN);
    expect(ctx.closes).toEqual([{ code: 1008, reason: 'Authentication failed for [redacted]' }]);
  });

  test('a socket that never opens times out', async () => {
    const vt = virtualTime();
    const ctx = makeProvider(undefined, { timers: vt.timers, connectTimeoutMs: 5000 });
    const pending = ctx.provider.connect().catch((e) => e);
    await vt.advance(5000);
    const err = await pending;
    expect(err.message).toMatch(/Timed out after 5000 ms/);
    expect(ctx.WS.instances[0].closedWith).toEqual({ code: 1000, reason: '' });
  });

  test('one provider holds one session: a second connect is refused', async () => {
    const ctx = makeProvider();
    await connected(ctx);
    await expect(ctx.provider.connect()).rejects.toThrow(/single-use/);
  });

  test('no key, no provider', () => {
    expect(() => new AssemblyAIVoiceProvider({ apiKey: '  ', fetch: () => {}, WebSocket: class {} })).toThrow(/ASSEMBLYAI_API_KEY/);
  });
});

describe('frames', () => {
  test('server frames are emitted as JSON events, text or binary; a non-JSON frame is an error', async () => {
    const ctx = makeProvider();
    const ws = await connected(ctx);
    ws.serverSend({ type: 'session.ready', session_id: 'sess_1' });
    ws.serverSend(new TextEncoder().encode(JSON.stringify({ type: 'input.speech.started' })).buffer);
    ws.serverSend('not json');
    expect(ctx.seen).toEqual([{ type: 'session.ready', session_id: 'sess_1' }, { type: 'input.speech.started' }]);
    expect(ctx.errors).toHaveLength(1);
  });

  test('send writes one JSON frame, and refuses once the socket is closed', async () => {
    const ctx = makeProvider();
    const ws = await connected(ctx);
    ctx.provider.send({ type: 'input.audio', audio: 'AAAA' });
    expect(ws.sent).toEqual(['{"type":"input.audio","audio":"AAAA"}']);
    ws.serverClose(1011, 'internal');
    expect(() => ctx.provider.send({ type: 'input.audio', audio: 'AAAA' })).toThrow(/not open/);
    expect(ctx.closes).toEqual([{ code: 1011, reason: 'internal' }]);
  });

  test('the key is in no URL, event, log line or serialisation of the provider', async () => {
    const ctx = makeProvider();
    const ws = await connected(ctx);
    ws.serverSend({ type: 'session.ready', session_id: 'sess_1' });
    const everything = [JSON.stringify(ctx.provider), util.inspect(ctx.provider, { showHidden: true, depth: 10 }), ws.url, JSON.stringify(ctx.seen)].join('\n');
    expect(everything).not.toContain(KEY);
    expect(JSON.stringify(ctx.provider)).not.toContain(TOKEN);
  });
});

describe('the bridge on the live provider', () => {
  test('a whole session: session.update first, tool calls through invoke as the agent, session.end last', async () => {
    const ctx = makeProvider();
    const { store, invoke } = setup();
    const bridge = createBridge({ provider: ctx.provider, invoke, store });
    const starting = bridge.start();
    await new Promise((r) => setImmediate(r));
    const ws = ctx.WS.instances[0];
    ws.open();
    await starting;
    const sent = () => ws.sentJson();
    expect(sent().map((e) => e.type)).toEqual(['session.update']);
    expect(sent()[0].session.tools.map((t) => t.name)).not.toContain('send_quote');

    ws.serverSend({ type: 'session.ready', session_id: 'sess_live_1', resume_token: 'r' });
    ws.serverSend({ type: 'transcript.user', item_id: 'item_u1', text: LINES.U1 });
    ws.serverSend({ type: 'transcript.user', item_id: 'item_u1b', text: LINES.U1B });
    ws.serverSend({ type: 'tool.call', call_id: 'call_4', name: 'draft_quote', arguments: QUOTE_ARGS });
    ws.serverSend({ type: 'tool.call', call_id: 'call_x', name: 'send_quote', arguments: { draft_id: 'Q-1001' } });
    ws.serverSend({ type: 'reply.done', reply_id: 'reply_1', status: 'completed' });
    const results = sent().filter((e) => e.type === 'tool.result');
    expect(results.map((r) => [r.call_id, r.is_error, typeof r.result])).toEqual([
      ['call_4', false, 'string'],
      ['call_x', true, 'string'],
    ]);
    expect(store.state.drafts[0]).toMatchObject({ id: 'Q-1001', status: 'draft' });
    expect(store.activityLog().filter((e) => e.tool === 'draft_quote')[0]).toMatchObject({ actor: 'agent', cause: { session_id: 'sess_live_1' } });

    const stopping = bridge.stop();
    expect(sent().at(-1)).toEqual({ type: 'session.end' });
    ws.serverSend({ type: 'session.ended', session_duration_seconds: 12, audio_duration_seconds: 10 });
    await stopping;
    expect(ws.closedWith).toEqual({ code: 1000, reason: 'client done' });
  });

  test('when the service closes the socket, stop() sends nothing and audio is dropped', async () => {
    const ctx = makeProvider();
    const { store, invoke } = setup();
    const bridge = createBridge({ provider: ctx.provider, invoke, store });
    const starting = bridge.start();
    await new Promise((r) => setImmediate(r));
    const ws = ctx.WS.instances[0];
    ws.open();
    await starting;
    ws.serverSend({ type: 'session.ready', session_id: 'sess_live_2' });
    ws.serverClose(3005, 'server error');
    expect(bridge.sendAudio('AAAA')).toBe(false);
    await bridge.stop();
    expect(ws.sentJson().map((e) => e.type)).toEqual(['session.update']);
    expect(bridge.status()).toMatchObject({ closed: true, droppedAudio: 1 });
  });
});

describe('session artifacts', () => {
  test('tries Bearer, then the raw key, and says which worked', async () => {
    const ctx = makeProvider([
      { status: 401, body: { error: 'nope' } },
      { status: 200, body: { id: 'sess_1', timeline: [] } },
    ]);
    const got = await ctx.provider.fetchSession('sess_1');
    expect(got).toEqual({ auth: 'raw key', body: { id: 'sess_1', timeline: [] } });
    expect(ctx.fetch.calls.map((c) => [c.url, c.init.headers.Authorization])).toEqual([
      ['https://agents.assemblyai.com/v1/sessions/sess_1', `Bearer ${KEY}`],
      ['https://agents.assemblyai.com/v1/sessions/sess_1', KEY],
    ]);
  });

  test('both refused: one error naming both, without the key; a malformed id is refused before any request', async () => {
    const ctx = makeProvider([
      { status: 401, body: `bad ${KEY}` },
      { status: 404, body: 'not found' },
    ]);
    const err = await ctx.provider.fetchSession('sess_1').catch((e) => e);
    expect(err.message).toMatch(/Bearer: HTTP 401.*raw key: HTTP 404/);
    expect(err.message).not.toContain(KEY);
    await expect(ctx.provider.fetchSession('../v1/agents')).rejects.toThrow(/not a session id/);
    expect(ctx.fetch.calls).toHaveLength(2);
  });
});

describe('scripted lines in AssemblyAI voices', () => {
  // A fake Voice Agent that speaks its greeting: two audio chunks, then reply.done.
  function speaking(spoken) {
    const fake = new FakeVoiceProvider();
    const send = fake.send.bind(fake);
    fake.send = (event) => {
      send(event);
      if (event.type === 'session.update') {
        fake.emit({ type: 'reply.started', reply_id: 'r1' });
        fake.emit({ type: 'reply.audio', data: Buffer.from([1, 2]).toString('base64') });
        fake.emit({ type: 'reply.audio', data: Buffer.from([3, 4]).toString('base64') });
        fake.emit({ type: 'reply.done', reply_id: 'r1', status: 'completed' });
        fake.emit({ type: 'transcript.agent', text: spoken, interrupted: false });
      }
    };
    return fake;
  }

  test('keeps the greeting audio, checks the words, and ends the session', async () => {
    const fake = speaking('Three quarter');
    const got = await synthesizeLine({ provider: fake, text: 'Three-quarter.', voice: 'george' });
    expect([...got.pcm]).toEqual([1, 2, 3, 4]);
    expect(got).toMatchObject({ matches: true, transcript: 'Three quarter', outcome: 'done' });
    expect(fake.sent[0].session).toMatchObject({ greeting: 'Three-quarter.', output: { voice: 'george' } });
    expect(fake.sent.at(-1).type).toBe('session.end');
    expect(fake.closed).toBe(true);
  });

  test('a line spoken differently does not match, so the script falls back to say', async () => {
    const got = await synthesizeLine({ provider: speaking('Three quarters, please.'), text: 'Three-quarter.', voice: 'george' });
    expect(got.matches).toBe(false);
  });
});
