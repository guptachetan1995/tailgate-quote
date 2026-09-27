'use strict';

// Voice sessions, one at a time, behind the same { status, body } route shape as api.js. The
// local server and the static demo's bundle both use this, so a replay in the browser runs the
// same bridge, the same invoke() and the same event stream as a session on the server.
//
//   voices    [{ mode, label, synthetic?, audio?, timers?, create() }]: the modes this surface
//             offers (audio: a replay that carries the agent's recorded voice).
//             create() returns a fresh provider per session (a live token is single-use, and a
//             replay resets the board onto the tape's clock).
//   broadcast (type, data): every activity entry goes out as "activity" (wired by the caller);
//             this module adds the session's events as "voice.*", each stamped with `ms`, the
//             session clock's milliseconds since the session started (for a tape, since its
//             session.update, the zero its durationMs counts from).
//
// A provider that can finish on its own (a tape) exposes a `done` promise; when it resolves,
// the session is ended the way a live one is, with session.end. A provider that paces its own
// events (a tape) also names the timers the bridge must wait on (`bridgeTimers`), so the
// bridge's waits run on the tape's timeline at any replay speed.
//
// A stop that arrives while a session is still starting (a live token being minted) waits for
// the start to settle, then ends that session, so no socket is ever left open unreachable.

const { createBridge } = require('./bridge');

const FORWARD = ['wire', 'partial', 'agentDelta', 'agent', 'result', 'waiting', 'ready', 'ended', 'error'];

function createSessions({ store, invoke, voices = [], broadcast }) {
  let session = null;
  const clockMs = () => Date.parse(store.nowIso());

  function describe() {
    return {
      modes: voices.map((v) => ({ mode: v.mode, label: v.label || null, synthetic: Boolean(v.synthetic), audio: Boolean(v.audio) })),
      active: Boolean(session),
      mode: session ? session.voice.mode : null,
      label: session ? session.voice.label || null : null,
      status: session ? session.bridge.status() : null,
    };
  }

  async function stop() {
    if (!session) return { status: 409, body: { error: 'No voice session is running.', ...describe() } };
    const current = session;
    session = null;
    if (current.starting) await current.starting;
    await current.bridge.stop();
    return { status: 200, body: { ...describe(), status: current.bridge.status() } };
  }

  async function start(body = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, body: { error: 'The request body must be a JSON object: { mode }.' } };
    const extra = Object.keys(body).filter((k) => k !== 'mode');
    if (extra.length) return { status: 400, body: { error: `Unexpected field(s): ${extra.join(', ')}. The body is { mode }.` } };
    if (voices.length === 0) return { status: 404, body: { error: 'This surface has no voice session configured.' } };
    const mode = body.mode === undefined ? voices[0].mode : body.mode;
    const voice = voices.find((v) => v.mode === mode);
    if (!voice) {
      const offered = voices.map((v) => JSON.stringify(v.mode)).join(' or ');
      const hint = mode === 'live' ? ' Live mode needs the local server started with ASSEMBLYAI_API_KEY set in .env.' : '';
      return { status: 400, body: { error: `mode must be ${offered}; ${JSON.stringify(mode)} is not offered here.${hint}` } };
    }
    if (session) return { status: 409, body: { error: 'A voice session is already running; stop it first.', ...describe() } };

    const provider = voice.create();
    const timers = provider.bridgeTimers || voice.timers;
    const bridge = createBridge({ provider, invoke, store, ...(timers ? { timers } : {}) });
    const current = { voice, provider, bridge, starting: null };
    session = current;
    const t0 = typeof provider.originMs === 'number' ? provider.originMs : clockMs();
    const emit = (type, data) => broadcast(type, { ...data, ms: Math.max(0, clockMs() - t0) });

    for (const type of FORWARD) bridge.on(type, (data) => emit(`voice.${type}`, data));
    // A replayed tape without its audio sidecar carries empty payloads: nothing to play.
    bridge.on('audio', (data) => {
      if (data) emit('voice.audio', { data });
    });
    provider.on('progress', (p) => emit('voice.progress', { index: p.index, total: p.total, durationMs: provider.durationMs }));
    bridge.on('close', (info) => {
      if (session === current) session = null;
      emit('voice.close', info || {});
    });
    emit('voice.start', {
      mode: voice.mode,
      label: voice.label || null,
      synthetic: Boolean(voice.synthetic),
      durationMs: provider.durationMs ?? null,
      speed: provider.speed ?? 1,
    });

    // Settles, never rejects, so a stop() waiting on it always gets to end the session.
    current.starting = bridge.start().then(
      () => null,
      (err) => err,
    );
    const failed = await current.starting;
    current.starting = null;
    if (failed) {
      if (session === current) session = null;
      // Provider errors are already free of the key and token; say what failed, not how.
      return { status: 502, body: { error: String(failed && failed.message) } };
    }
    if (session !== current) {
      return { status: 409, body: { error: 'The voice session was stopped before it finished starting; it has been ended.', ...describe() } };
    }
    if (provider.done && typeof provider.done.then === 'function') {
      provider.done.then(() => {
        if (session === current) stop();
      });
    }
    return { status: 200, body: describe() };
  }

  // PCM16 mono 24 kHz, base64: the browser microphone, relayed by the local server.
  function sendAudio(base64) {
    if (!session) return { status: 409, body: { error: 'No voice session is running; POST /api/voice/start first.' } };
    if (!session.bridge.sendAudio(base64)) return { status: 409, body: { error: 'The voice session is not ready for audio.' } };
    return null;
  }

  return { describe, start, stop, sendAudio, active: () => Boolean(session) };
}

module.exports = { createSessions, FORWARD };
