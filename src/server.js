'use strict';

// The local server. createApp() builds an app from injected parts and reads nothing from the
// environment; only start(), run as the entrypoint, loads .env and listens. Requiring this file
// therefore never reads a key and never opens a socket, which is what lets the tests run with
// a real key sitting in .env.
//
// Voice sessions are held here, on the server, never in the page: the server mints the
// AssemblyAI token, holds the socket, and relays the browser microphone (POST /api/audio, raw
// PCM16) in and the agent's voice (the voice.audio server-sent event) out. So the key never
// reaches a browser, and the "voice" actor that records what was heard exists only inside
// this process.

const fs = require('fs');
const path = require('path');
const express = require('express');
const { createStore } = require('./store');
const { createInvoke } = require('./invoke');
const { createApi } = require('./api');
const { createSessions } = require('./voice/sessions');

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const AUDIO_TYPE = 'application/octet-stream';
// Up to one second of 24 kHz PCM16 mono per request; the page posts 100 ms frames.
const AUDIO_LIMIT_BYTES = 48000;

// Only this machine may talk to the server: the owner's buttons are behind it.
function loopbackOnly(req, res, next) {
  if (!LOOPBACK.has(req.socket.remoteAddress)) return res.status(403).json({ error: 'This server only accepts connections from this machine.' });
  return next();
}

// Against DNS rebinding: a page on another origin that resolves to 127.0.0.1 still sends its
// own Host header.
function hostCheck(req, res, next) {
  const port = req.socket.localPort;
  const host = String(req.headers.host || '').toLowerCase();
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return res.status(403).json({ error: `Host "${host}" is not allowed.` });
  return next();
}

// A cross-site page cannot send application/json, or the audio route's
// application/octet-stream, without a CORS preflight, which this server never grants. So
// every POST requires one of the two.
function jsonOnly(req, res, next) {
  if (req.method !== 'POST') return next();
  if (req.path === '/api/audio') {
    if (!req.is(AUDIO_TYPE)) return res.status(415).json({ error: `POST /api/audio takes raw PCM16 as ${AUDIO_TYPE}.` });
    return next();
  }
  if (!req.is('application/json')) return res.status(415).json({ error: 'POST bodies must be application/json.' });
  return next();
}

// voices: [{ mode, label, synthetic?, create() }], the voice modes this server offers (see
// src/voice/sessions.js); none means the voice routes answer that no session is configured.
function createApp({ store = createStore(), voices = [] } = {}) {
  const invoke = createInvoke(store);
  const api = createApi({ store, invoke });
  const app = express();
  const streams = new Set();
  const broadcast = (type, data) => {
    for (const res of streams) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  store.subscribe((entry) => broadcast('activity', entry));
  const sessions = createSessions({ store, invoke, voices, broadcast });

  app.disable('x-powered-by');
  app.use(loopbackOnly, hostCheck, jsonOnly);
  app.use(express.json({ limit: '256kb' }));

  const reply = (res, r) => res.status(r.status).json(r.body);
  app.get('/api/state', (_req, res) => reply(res, api.getState()));
  app.get('/api/activity', (_req, res) => reply(res, api.getActivityLog()));
  app.get('/api/tools', (_req, res) => reply(res, api.getTools()));
  // The dashboard's buttons and the "Try it as the agent" panel both post here; the actor is
  // in the body and only "agent" or "owner" is accepted (api.js).
  app.post('/api/invoke', (req, res) => reply(res, api.postInvoke(req.body)));

  // Server-sent events: every activity-log entry, and the voice session's wire events, as they
  // happen, so the page re-renders after an agent's call exactly as after a tap.
  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    streams.add(res);
    req.on('close', () => streams.delete(res));
  });

  app.get('/api/voice', (_req, res) => res.json(sessions.describe()));
  app.post('/api/voice/start', async (req, res) => reply(res, await sessions.start(req.body)));
  app.post('/api/voice/stop', async (_req, res) => reply(res, await sessions.stop()));

  // The browser microphone: raw PCM16 mono at 24 kHz, relayed to the session as input.audio.
  app.post('/api/audio', express.raw({ type: AUDIO_TYPE, limit: AUDIO_LIMIT_BYTES }), (req, res) => {
    if (!sessions.active()) return res.status(409).json({ error: 'No voice session is running; POST /api/voice/start first.' });
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length % 2 !== 0) {
      return res.status(400).json({ error: 'The body must be whole 16-bit samples of PCM audio.' });
    }
    const refused = sessions.sendAudio(bytes.toString('base64'));
    if (refused) return reply(res, refused);
    return res.status(202).json({ accepted: bytes.length });
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = status === 413 ? 'The request body is too large.' : status === 400 ? 'The request body is not valid JSON.' : 'Internal error.';
    res.status(status).json({ error: message });
  });

  return app;
}

// The tape the server replays when it has no key or is asked to: the recorded session when it
// exists, the synthetic sample otherwise.
function defaultTape(root = path.join(__dirname, '..')) {
  const recorded = path.join(root, 'tapes', 'demo-session.jsonl');
  return fs.existsSync(recorded) ? recorded : path.join(root, 'tests', 'fixtures', 'sample-session.jsonl');
}

// The agent's recorded voice for a tape: tapes/raw/<name>.agent.pcm, written by
// record-session (raw PCM16 mono 24 kHz, the bytes every reply.audio offset points into).
function audioSidecar(tapeFile) {
  const file = path.join(path.dirname(tapeFile), 'raw', `${path.basename(tapeFile, '.jsonl')}.agent.pcm`);
  return fs.existsSync(file) ? file : null;
}

// readAudio(offset, bytes) for the replay provider: the agent's voice as base64, or null when
// the tape has no sidecar (the replay is then silent, and says so).
function sidecarReader(file) {
  if (!file) return null;
  const pcm = fs.readFileSync(file);
  return (offset, bytes) => pcm.subarray(offset, offset + bytes).toString('base64');
}

// After a tape ends, the store's clock carries on from the tape's last instant in real time,
// so what the owner does after the replay gets its own, later timestamps.
function continueAfter(provider, clock, wallNow = Date.now) {
  provider.on('close', () => {
    if (clock.now !== provider.now) return;
    const end = provider.now();
    const closedAt = wallNow();
    clock.now = () => end + (wallNow() - closedAt);
  });
}

// Voice modes for the entrypoint. `--replay [tape]` offers only that replay (`--speed N` plays
// it N times faster), which is what a video render wants. Otherwise the replay of the default
// tape is always offered, and the live Voice Agent API is offered too when the key is set (the
// dashboard's "Live mic" mode). Every session starts from the seeded board: a replay on the
// tape's own clock, so ids and timestamps match the recording; a live one on the wall clock.
function selectVoices({ key, argv, store, clock }) {
  const at = argv.indexOf('--replay');
  const explicit = at >= 0 && argv[at + 1] && !argv[at + 1].startsWith('--') ? path.resolve(argv[at + 1]) : null;
  const speedAt = argv.indexOf('--speed');
  const speed = speedAt >= 0 ? Number(argv[speedAt + 1]) : 1;
  if (!(speed > 0)) throw new Error('--speed takes a positive number');
  const { parseTape, tapeLabel } = require('./voice/tape');
  const { ReplayVoiceProvider } = require('./voice/replay');
  const file = explicit || defaultTape();
  const tape = parseTape(fs.readFileSync(file, 'utf8'));
  const audioFile = audioSidecar(file);
  const readAudio = sidecarReader(audioFile);
  const replay = {
    mode: 'replay',
    label: tapeLabel(tape.header),
    synthetic: Boolean(tape.header.synthetic),
    file,
    audioFile,
    audio: Boolean(audioFile),
    create: () => {
      const provider = new ReplayVoiceProvider({ tape, speed, readAudio });
      clock.now = provider.now;
      continueAfter(provider, clock);
      store.reset();
      return provider;
    },
  };
  if (at >= 0 || !key) return [replay];
  const { AssemblyAIVoiceProvider } = require('./voice/assemblyai');
  const live = {
    mode: 'live',
    label: 'Live AssemblyAI Voice Agent session',
    audio: true,
    create: () => {
      const provider = new AssemblyAIVoiceProvider({ apiKey: key });
      clock.now = Date.now;
      store.reset();
      return provider;
    },
  };
  return [live, replay];
}

function start({ port = Number(process.env.PORT) || 3000, argv = process.argv.slice(2) } = {}) {
  const { loadKey } = require('./env');
  const key = loadKey();
  const clock = { now: Date.now };
  const store = createStore({ now: () => clock.now() });
  const voices = selectVoices({ key, argv, store, clock });
  const app = createApp({ store, voices });
  const replay = voices.find((v) => v.mode === 'replay');
  return app.listen(port, '127.0.0.1', () => {
    // The key's value is never printed, only whether it is set.
    // eslint-disable-next-line no-console
    console.log(
      `Tailgate Quote on http://127.0.0.1:${port} (ASSEMBLYAI_API_KEY ${key ? 'is set' : 'is not set'}; ` +
        `modes: ${voices.map((v) => v.mode).join(', ')}; replay: ${replay.label}, ${path.relative(process.cwd(), replay.file)}, ` +
        `${replay.audioFile ? "with the agent's recorded voice" : 'silent: no agent-voice sidecar'})`,
    );
  });
}

if (require.main === module) start();

module.exports = { createApp, start, selectVoices, defaultTape, audioSidecar, sidecarReader, continueAfter, loopbackOnly, hostCheck, jsonOnly };
