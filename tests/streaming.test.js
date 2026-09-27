'use strict';

// Streaming Speech-to-Text v3 against a scripted fetch and WebSocket: raw-key token mint,
// connect by token with the keyterms as a JSON list, Begin / Turn / Termination handling, and
// Terminate before closing. No network.

const { StreamingTranscriber } = require('../src/voice/streaming');
const { keyterms } = require('../src/voice/bridge');
const { setup } = require('./helpers');
const { mockWebSocketClass, scriptedFetch, virtualTime, forbidNetwork } = require('./fakes');

const KEY = 'aai-test-key-streaming-51d0';
const TOKEN = 'stt-token-77aa';

let restoreNetwork;
beforeAll(() => {
  restoreNetwork = forbidNetwork();
});
afterAll(() => restoreNetwork());

function make(params = {}, fetchAnswers = [{ status: 200, body: { token: TOKEN, expires_in_seconds: 60 } }], opts = {}) {
  const WS = mockWebSocketClass();
  const fetch = scriptedFetch(...fetchAnswers);
  const stt = new StreamingTranscriber({ apiKey: KEY, params, fetch, WebSocket: WS, ...opts });
  return { stt, WS, fetch };
}

async function begun(ctx) {
  const pending = ctx.stt.connect();
  await new Promise((r) => setImmediate(r));
  const ws = ctx.WS.instances[0];
  ws.open();
  ws.serverSend({ type: 'Begin', id: 'stt_sess_1', expires_at: 1790000000, configuration: { model: 'universal-3-6-pro' } });
  const begin = await pending;
  return { ws, begin };
}

test('mints the token with the raw key (no Bearer) and connects by token with the pinned model', async () => {
  const terms = keyterms(setup().store.state);
  const ctx = make({ keyterms_prompt: terms });
  const { ws, begin } = await begun(ctx);
  expect(ctx.fetch.calls).toEqual([
    {
      url: 'https://streaming.assemblyai.com/v3/token?expires_in_seconds=60&max_session_duration_seconds=600',
      init: { method: 'GET', headers: { Authorization: KEY } },
    },
  ]);
  const url = new URL(ws.url);
  expect(`${url.origin}${url.pathname}`).toBe('wss://streaming.assemblyai.com/v3/ws');
  expect(url.searchParams.get('speech_model')).toBe('universal-3-6-pro');
  expect(url.searchParams.get('sample_rate')).toBe('16000');
  expect(url.searchParams.get('encoding')).toBe('pcm_s16le');
  expect(JSON.parse(url.searchParams.get('keyterms_prompt'))).toEqual(terms);
  expect(url.searchParams.get('token')).toBe(TOKEN);
  expect(ws.url).not.toContain(KEY);
  expect(ctx.stt.describeUrl()).not.toContain(TOKEN);
  expect(begin).toMatchObject({ type: 'Begin', id: 'stt_sess_1' });
});

test('audio goes out as binary frames; only end-of-turn Turns count; Terminate waits for Termination', async () => {
  const ctx = make();
  const { ws } = await begun(ctx);
  const frame = new Uint8Array(1600);
  ctx.stt.sendAudio(frame);
  expect(ws.sent[0]).toBe(frame);
  ws.serverSend({ type: 'Turn', turn_order: 0, end_of_turn: false, transcript: 'New job for' });
  ws.serverSend({ type: 'Turn', turn_order: 0, end_of_turn: true, transcript: 'New job for Priya Shah.' });
  ws.serverSend({ type: 'Turn', turn_order: 1, end_of_turn: true, transcript: 'Call it six hours labor.' });

  const terminating = ctx.stt.terminate();
  expect(JSON.parse(ws.sent.at(-1))).toEqual({ type: 'Terminate' });
  expect(ws.closedWith).toBeNull();
  ws.serverSend({ type: 'Termination', audio_duration_seconds: 14, session_duration_seconds: 15 });
  expect(await terminating).toEqual({ type: 'Termination', audio_duration_seconds: 14, session_duration_seconds: 15 });
  expect(ws.closedWith).toEqual({ code: 1000, reason: 'client done' });
  expect(ctx.stt.transcript()).toBe('New job for Priya Shah. Call it six hours labor.');
});

test('a Termination that never comes does not hang: terminate() gives up after its timeout', async () => {
  const vt = virtualTime();
  const ctx = make({}, undefined, { timers: vt.timers });
  const pending = ctx.stt.connect();
  await vt.advance(0);
  ctx.WS.instances[0].open();
  ctx.WS.instances[0].serverSend({ type: 'Begin', id: 's' });
  await pending;
  const terminating = ctx.stt.terminate({ timeoutMs: 2000 });
  await vt.advance(2000);
  expect(await terminating).toBeNull();
});

test('closed before Begin: the error names the service error, redacted', async () => {
  const ctx = make();
  const pending = ctx.stt.connect();
  await new Promise((r) => setImmediate(r));
  const ws = ctx.WS.instances[0];
  ws.open();
  ws.serverSend({ type: 'Error', error_code: 1008, error: `Unauthorized Connection: ${TOKEN}` });
  ws.serverClose(1008, '');
  const err = await pending.catch((e) => e);
  expect(err.message).toMatch(/before Begin: code 1008: Unauthorized Connection: \[redacted\]/);
});

test('a refused token request carries the status, never the key', async () => {
  const ctx = make({}, [{ status: 401, body: `bad key ${KEY}` }]);
  const err = await ctx.stt.connect().catch((e) => e);
  expect(err.message).toMatch(/HTTP 401/);
  expect(err.message).not.toContain(KEY);
});

test('keyterms are checked against the documented limits before anything is sent', () => {
  expect(() => make({ keyterms_prompt: Array.from({ length: 101 }, (_, i) => `term${i}`) })).toThrow(/at most 100/);
  expect(() => make({ keyterms_prompt: ['x'.repeat(51)] })).toThrow(/1–50 characters/);
  expect(() => new StreamingTranscriber({ apiKey: '' })).toThrow(/ASSEMBLYAI_API_KEY/);
  expect(JSON.stringify(make().stt)).not.toContain(KEY);
});
