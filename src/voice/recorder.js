'use strict';

// One recorded session: a provider (the live AssemblyAI one in scripts/record-session.js, the
// fake one in tests) wrapped so every event is written to a tape, the real bridge and the real
// invoke() behind it, and the feeder playing the plan's clips as microphone audio. The tape
// clock is advanced on every server event, so replaying the tape later reproduces every tool
// result byte for byte (see replay.js).

const { createBridge } = require('./bridge');
const { createFeeder } = require('./feeder');
const { recordingProvider } = require('./tape');

// The model name, if the session reports one anywhere in its config.
function findModel(config) {
  if (!config || typeof config !== 'object') return null;
  for (const [k, v] of Object.entries(config)) {
    if (/model/i.test(k) && typeof v === 'string') return v;
    const inner = findModel(v);
    if (inner) return inner;
  }
  return null;
}

function createRecorder({
  provider: inner,
  store,
  invoke,
  writer,
  elapsed,
  clock,
  plan,
  sampleRate = 24000,
  feeder: feederOptions = {},
  maxSessionMs = 5 * 60 * 1000,
  readyTimeoutMs = 20000,
  now = () => Date.now(),
  timers = null,
  log = () => {},
}) {
  const t = timers || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };
  const provider = recordingProvider(inner, { writer, elapsed, clock });
  const bridge = createBridge({ provider, invoke, store, timers: t });
  const feeder = createFeeder({ bridge, plan, sampleRate, now, timers: t, log, ...feederOptions });
  const session = { sessionId: null, model: null, errors: [], closed: null, ended: null };

  provider.on('message', (event) => {
    if (event.type === 'session.ready') {
      session.sessionId = event.session_id || null;
      session.model = findModel(event.config);
    }
  });
  bridge.on('error', (e) => {
    session.errors.push({ code: e.code, message: e.message });
    log({ type: 'session.error', code: e.code, message: e.message });
  });
  bridge.on('ended', (e) => {
    session.ended = { session_duration_seconds: e.session_duration_seconds, audio_duration_seconds: e.audio_duration_seconds };
  });

  let closedEarly;
  const closed = new Promise((resolve) => {
    closedEarly = resolve;
  });
  bridge.on('close', (info) => {
    session.closed = info;
    log({ type: 'socket.closed', code: info && info.code, reason: info && info.reason });
    feeder.stop();
    closedEarly('closed');
  });

  async function run() {
    const ready = new Promise((resolve) => bridge.on('ready', () => resolve('ready')));
    let readyTimer;
    const timeout = new Promise((resolve) => {
      readyTimer = t.setTimeout(() => resolve('timeout'), readyTimeoutMs);
    });
    await bridge.start();
    const first = await Promise.race([ready, closed, timeout]);
    t.clearTimeout(readyTimer);
    if (first !== 'ready') {
      log({ type: 'session.not-ready', why: first });
      await bridge.stop();
      return { ...session, ok: false, framesSent: 0, bridge: bridge.status() };
    }
    log({ type: 'session.ready', sessionId: session.sessionId, model: session.model });
    const limit = t.setTimeout(() => {
      log({ type: 'session.limit', maxSessionMs });
      feeder.stop();
    }, maxSessionMs);
    const { framesSent } = await feeder.start();
    t.clearTimeout(limit);
    await bridge.stop();
    return { ...session, ok: !session.closed || Boolean(session.ended), framesSent, bridge: bridge.status() };
  }

  return { run, stop: () => feeder.stop(), bridge, provider };
}

module.exports = { createRecorder, findModel };
