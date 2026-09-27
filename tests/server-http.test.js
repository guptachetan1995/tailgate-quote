'use strict';

// The real Express app over a real ephemeral socket on 127.0.0.1.

const http = require('http');
const path = require('path');
const { createApp, loopbackOnly } = require('../src/server');
const { request, listen } = require('./http');
const { createStore } = require('../src/store');
const { FakeVoiceProvider } = require('../src/voice/fake');
const { LINES } = require('../src/voice/scenario');
const { T0, QUOTE_ARGS } = require('./helpers');

describe('HTTP', () => {
  let srv;
  const DUMMY_KEY = 'aai-dummy-key-0123456789abcdef';
  beforeEach(async () => {
    process.env.ASSEMBLYAI_API_KEY = DUMMY_KEY;
    srv = await listen();
  });
  afterEach(async () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    await srv.close();
  });

  test('a full cycle: the owner drafts and sends; the agent is refused; the state shows it', async () => {
    const tools = await srv.call('GET', '/api/tools');
    expect(tools.status).toBe(200);
    expect(tools.json().map((t) => t.name)).not.toContain('send_quote');

    const draft = await srv.call('POST', '/api/invoke', { tool: 'draft_quote', args: { customer: 'Helen Marsh', lines: [{ sku: 'PNR-DP24', qty: 1 }], labor_hours: 1 }, actor: 'owner' });
    expect(draft.status).toBe(200);
    const id = draft.json().result.draft.id;
    expect(draft.json().result.draft.total).toBe(27.5 + 110);

    const agentSend = await srv.call('POST', '/api/invoke', { tool: 'send_quote', args: { draft_id: id }, actor: 'agent' });
    expect(agentSend.status).toBe(200);
    expect(agentSend.json()).toMatchObject({ success: false, error: expect.stringMatching(/owner-only/) });

    const ownerSend = await srv.call('POST', '/api/invoke', { tool: 'send_quote', args: { draft_id: id }, actor: 'owner' });
    expect(ownerSend.json()).toMatchObject({ success: true, result: { customer_copy: { taxNote: 'Tax calculated at invoicing', to: { email: 'helen.marsh@example.com' } } } });

    const state = (await srv.call('GET', '/api/state')).json();
    expect(state.drafts[0]).toMatchObject({ id, status: 'sent', sentBy: 'owner' });
    expect(state.outbox).toHaveLength(1);
    const log = (await srv.call('GET', '/api/activity')).json();
    expect(log.map((e) => [e.actor, e.tool, e.outcome])).toEqual([
      ['owner', 'draft_quote', 'ok'],
      ['agent', 'send_quote', 'refused'],
      ['owner', 'send_quote', 'ok'],
    ]);
    for (const text of srv.bodies) expect(text).not.toContain(DUMMY_KEY);
  });

  test('400 without an actor, and for any actor but agent or owner', async () => {
    for (const actor of [undefined, 'voice', 'admin']) {
      const res = await srv.call('POST', '/api/invoke', { tool: 'send_quote', args: { draft_id: 'Q-1001' }, actor });
      expect(res.status).toBe(400);
    }
    expect((await srv.call('POST', '/api/invoke', { args: {}, actor: 'owner' })).status).toBe(400);
  });

  test('415 for a POST that is not JSON; 400 for malformed JSON', async () => {
    const form = await srv.call('POST', '/api/invoke', 'tool=send_quote&actor=owner', { 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(form.status).toBe(415);
    const text = await srv.call('POST', '/api/invoke', '{"tool":"get_board"}', { 'Content-Type': 'text/plain' });
    expect(text.status).toBe(415);
    const bad = await srv.call('POST', '/api/invoke', '{"tool": ', {});
    expect(bad.status).toBe(400);
    expect(bad.json().error).toMatch(/not valid JSON/);
  });

  test('403 for a foreign Host header (DNS rebinding)', async () => {
    for (const host of ['evil.example.com', `evil.example.com:${srv.port}`, '127.0.0.1:1']) {
      const res = await srv.call('GET', '/api/state', undefined, { Host: host });
      expect(res.status).toBe(403);
    }
    expect((await srv.call('GET', '/api/state', undefined, { Host: `localhost:${srv.port}` })).status).toBe(200);
  });

  test('server-sent events carry each activity entry', async () => {
    const got = await new Promise((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port: srv.port, path: '/api/events', headers: { Host: `127.0.0.1:${srv.port}` } }, (res) => {
        res.setEncoding('utf8');
        res.once('data', (chunk) => {
          req.destroy();
          resolve(chunk);
        });
        srv.call('POST', '/api/invoke', { tool: 'get_board', args: {}, actor: 'owner' }).catch(reject);
      });
      req.on('error', () => {});
    });
    expect(got).toMatch(/^event: activity\ndata: \{.*"tool":"get_board"/);
  });
});

test('non-loopback clients get 403', () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  const next = jest.fn();
  loopbackOnly({ socket: { remoteAddress: '192.168.1.20' } }, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
  loopbackOnly({ socket: { remoteAddress: '::ffff:127.0.0.1' } }, res, next);
  expect(next).toHaveBeenCalled();
});

test('the voice routes run a session through the same invoke', async () => {
  const provider = new FakeVoiceProvider();
  const srv = await listen({ voices: [{ mode: 'fake', create: () => provider }] });
  try {
    expect((await srv.call('POST', '/api/voice/start', {})).status).toBe(200);
    expect(provider.sent[0].type).toBe('session.update');
    provider.emit({ type: 'transcript.user', item_id: 'item_u1', text: LINES.U1 });
    provider.emit({ type: 'transcript.user', item_id: 'item_u1b', text: LINES.U1B });
    provider.emit({ type: 'tool.call', call_id: 'call_4', name: 'draft_quote', arguments: QUOTE_ARGS });
    const state = (await srv.call('GET', '/api/state')).json();
    expect(state.drafts[0]).toMatchObject({ id: 'Q-1001', status: 'draft', createdBy: 'agent' });
    expect((await srv.call('POST', '/api/voice/stop', {})).status).toBe(200);
    expect(provider.sent.at(-1).type).toBe('session.end');
  } finally {
    await srv.close();
  }
});

test('requiring the server reads no .env and opens no socket', () => {
  const realLoad = process.loadEnvFile;
  const realWS = global.WebSocket;
  process.loadEnvFile = () => {
    throw new Error('loadEnvFile called at require time');
  };
  global.WebSocket = class {
    constructor() {
      throw new Error('WebSocket constructed at require time');
    }
  };
  try {
    jest.isolateModules(() => {
      const mod = require(path.join(__dirname, '..', 'src', 'server.js'));
      mod.createApp({ store: createStore({ now: () => T0 }) });
    });
  } finally {
    process.loadEnvFile = realLoad;
    global.WebSocket = realWS;
  }
});

describe('voice sessions over HTTP', () => {
  const PCM = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);

  async function withVoice(create) {
    const made = [];
    const srv = await listen({
      voices: [
        {
          mode: 'fake',
          create: () => {
            const p = create ? create() : new FakeVoiceProvider();
            made.push(p);
            return p;
          },
        },
      ],
    });
    const audio = (body, type = 'application/octet-stream') =>
      request(srv.port, { method: 'POST', path: '/api/audio', headers: { Host: `127.0.0.1:${srv.port}`, 'Content-Type': type }, body });
    return { ...srv, made, audio };
  }

  test('the microphone relay: raw PCM16 in, input.audio to the session, nothing without a session', async () => {
    const srv = await withVoice();
    try {
      expect((await srv.audio(PCM)).status).toBe(409);
      expect((await srv.call('POST', '/api/voice/start', {})).status).toBe(200);
      const res = await srv.audio(PCM);
      expect(res.status).toBe(202);
      expect(res.json()).toEqual({ accepted: 8 });
      expect(srv.made[0].sentOfType('input.audio')).toEqual([{ type: 'input.audio', audio: PCM.toString('base64') }]);
      expect((await srv.audio(Buffer.from([1, 2, 3]))).status).toBe(400);
      expect((await srv.audio(Buffer.alloc(48002))).status).toBe(413);
      // text/plain needs no CORS preflight, so a cross-site page could send it: refused.
      expect((await srv.audio(PCM, 'text/plain')).status).toBe(415);
      expect(srv.made[0].sentOfType('input.audio')).toHaveLength(1);
    } finally {
      await srv.close();
    }
  });

  test("the agent's voice goes out as a voice.audio server-sent event", async () => {
    const srv = await withVoice();
    try {
      await srv.call('POST', '/api/voice/start', {});
      const got = await new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port: srv.port, path: '/api/events', headers: { Host: `127.0.0.1:${srv.port}` } }, (res) => {
          res.setEncoding('utf8');
          let buf = '';
          res.on('data', (chunk) => {
            buf += chunk;
            if (buf.includes('event: voice.audio')) {
              req.destroy();
              resolve(buf);
            }
          });
          srv.made[0].emit({ type: 'reply.audio', data: 'UENNMTY=' });
        });
        req.on('error', reject);
      });
      expect(got).toContain('event: voice.audio\ndata: {"data":"UENNMTY=","ms":0}');
    } finally {
      await srv.close();
    }
  });

  test('one session at a time; each session gets a fresh provider', async () => {
    const srv = await withVoice();
    try {
      expect((await srv.call('POST', '/api/voice/stop', {})).status).toBe(409);
      expect((await srv.call('POST', '/api/voice/start', {})).status).toBe(200);
      expect((await srv.call('POST', '/api/voice/start', {})).status).toBe(409);
      expect((await srv.call('GET', '/api/voice')).json()).toMatchObject({ mode: 'fake', active: true, status: { ready: true } });
      expect((await srv.call('POST', '/api/voice/stop', {})).status).toBe(200);
      expect((await srv.call('POST', '/api/voice/start', {})).status).toBe(200);
      expect(srv.made).toHaveLength(2);
      expect(srv.made[0].sent.at(-1).type).toBe('session.end');
      expect(srv.made[1].sent[0].type).toBe('session.update');
    } finally {
      await srv.close();
    }
  });

  test('a provider that cannot connect is a 502 with its (key-free) reason, and the next start can retry', async () => {
    let fail = true;
    const srv = await withVoice(() => {
      const p = new FakeVoiceProvider();
      if (fail) p.connect = () => Promise.reject(new Error('AssemblyAI refused the session token request (HTTP 401): [redacted]'));
      return p;
    });
    try {
      const res = await srv.call('POST', '/api/voice/start', {});
      expect(res.status).toBe(502);
      expect(res.json().error).toMatch(/HTTP 401/);
      fail = false;
      expect((await srv.call('POST', '/api/voice/start', {})).status).toBe(200);
    } finally {
      await srv.close();
    }
  });
});

describe('voice selection at startup', () => {
  const { selectVoices } = require('../src/server');
  const { FIXTURE } = require('../scripts/make-sample-tape');

  test('with a key: live first (the Live mic mode), the replay always offered; the provider is created only when a session starts', () => {
    const clock = { now: Date.now };
    const store = createStore({ now: () => clock.now() });
    const voices = selectVoices({ key: 'aai-dummy', argv: [], store, clock });
    expect(voices.map((v) => v.mode)).toEqual(['live', 'replay']);
    const { AssemblyAIVoiceProvider } = require('../src/voice/assemblyai');
    expect(voices[0].create()).toBeInstanceOf(AssemblyAIVoiceProvider);
  });

  test('without a key, or with --replay: only the tape, replayed from the seeded board on its own clock, ending itself', async () => {
    const clock = { now: () => T0 };
    const store = createStore({ now: () => clock.now() });
    for (const argv of [[], ['--replay']]) expect(selectVoices({ key: null, argv, store, clock }).map((v) => v.mode)).toEqual(['replay']);
    const voices = selectVoices({ key: 'aai-dummy', argv: ['--replay', FIXTURE, '--speed', 'Infinity'], store, clock });
    expect(voices).toHaveLength(1);
    expect(voices[0]).toMatchObject({ mode: 'replay', label: 'Scripted sample, not a recorded session', synthetic: true, file: FIXTURE });
    expect(() => selectVoices({ key: null, argv: ['--speed', '0'], store, clock })).toThrow(/positive/);

    const app = createApp({ store, voices });
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;
    const post = (p, body) =>
      request(port, { method: 'POST', path: p, headers: { Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const get = (p) => request(port, { path: p, headers: { Host: `127.0.0.1:${port}` } });
    try {
      store.state.drafts.push({ id: 'junk' });
      expect((await post('/api/voice/start', {})).status).toBe(200);
      const state = store.snapshot();
      expect(state.drafts.map((d) => [d.id, d.status])).toEqual([
        ['Q-1001', 'draft'],
        ['S-2001', 'draft'],
      ]);
      expect(state.leads[0].createdAt < '2026-09-28T07:00:00.000Z').toBe(true);
      // The tape played to its end, so the session ended itself with session.end.
      expect((await get('/api/voice')).json()).toMatchObject({ active: false, modes: [{ mode: 'replay', synthetic: true }] });
      expect((await post('/api/voice/stop', {})).status).toBe(409);
      expect((await post('/api/invoke', { tool: 'send_quote', args: { draft_id: 'Q-1001' }, actor: 'agent' })).json().success).toBe(false);
      expect((await post('/api/invoke', { tool: 'send_quote', args: { draft_id: 'Q-1001' }, actor: 'owner' })).json().success).toBe(true);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

describe('replay plumbing on the server', () => {
  const fs = require('fs');
  const os = require('os');
  const { continueAfter, audioSidecar, sidecarReader } = require('../src/server');
  const { createEmitter } = require('../src/voice/emitter');

  test('after a tape ends, the store clock carries on from its last instant in real time', () => {
    const events = createEmitter();
    let tapeNow = Date.parse('2026-09-28T07:00:00.000Z');
    const provider = { now: () => tapeNow, on: events.on };
    const clock = { now: provider.now };
    let wall = 5_000_000;
    continueAfter(provider, clock, () => wall);
    tapeNow += 67910;
    events.emit('close');
    expect(new Date(clock.now()).toISOString()).toBe('2026-09-28T07:01:07.910Z');
    wall += 4000;
    expect(new Date(clock.now()).toISOString()).toBe('2026-09-28T07:01:11.910Z');
  });

  test("a newer session's clock is left alone when an old tape closes", () => {
    const events = createEmitter();
    const provider = { now: () => 1, on: events.on };
    const newer = () => 2;
    const clock = { now: provider.now };
    continueAfter(provider, clock, () => 0);
    clock.now = newer;
    events.emit('close');
    expect(clock.now).toBe(newer);
  });

  test("the agent-voice sidecar is tapes/raw/<name>.agent.pcm, read by the tape's byte offsets", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tailgate-sidecar-'));
    try {
      const tape = path.join(dir, 'take-2.jsonl');
      fs.writeFileSync(tape, '');
      expect(audioSidecar(tape)).toBeNull();
      expect(sidecarReader(null)).toBeNull();
      fs.mkdirSync(path.join(dir, 'raw'));
      fs.writeFileSync(path.join(dir, 'raw', 'take-2.agent.pcm'), Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
      expect(audioSidecar(tape)).toBe(path.join(dir, 'raw', 'take-2.agent.pcm'));
      const read = sidecarReader(audioSidecar(tape));
      expect([...Buffer.from(read(2, 4), 'base64')]).toEqual([2, 3, 4, 5]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
