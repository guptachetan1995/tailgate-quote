'use strict';

// The static live demo's backend, bundled for the browser by scripts/build-pages.js. It is the
// local server's routes without the server: the same api.js, invoke.js, store, bridge, replay
// provider and session hub, answering the same paths with the same { status, body }, and
// emitting the same events the server streams. Every request and every response is
// round-tripped through JSON, as HTTP would, so the page never holds a live reference into
// the store.
//
// A tape is replayed on virtual time (voice/virtual-time.js) that the page advances, so the
// replay can be paused, sped up or skipped to the end. There is no network and no key here:
// nothing in this file's import graph reads the environment or opens a socket.

const { createStore } = require('./store');
const { createInvoke } = require('./invoke');
const { createApi } = require('./api');
const { createSessions } = require('./voice/sessions');
const { ReplayVoiceProvider } = require('./voice/replay');
const { parseTape, tapeLabel } = require('./voice/tape');
const { createEmitter } = require('./voice/emitter');
const { createVirtualTime } = require('./voice/virtual-time');

const viaJson = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const normalize = (path) => `/${String(path).replace(/^\.?\/+/, '').replace(/[?#].*$/, '')}`;

// Base64 of a slice of the agent-voice sidecar, in chunks small enough for fromCharCode.
function base64Slice(bytes, offset, length) {
  const view = new Uint8Array(bytes, offset, Math.max(0, Math.min(length, bytes.byteLength - offset)));
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode.apply(null, view.subarray(i, i + 0x8000));
  return btoa(binary);
}

// hasAudio: whether the build shipped the tape's agent-voice sidecar; the page fetches it and
// hands it over with setAgentAudio(ArrayBuffer), and reply.audio events carry it from then on.
function createStaticBackend({ tapeText, hasAudio = false }) {
  const tape = parseTape(tapeText);
  const time = createVirtualTime();
  const clock = { now: () => Date.parse(tape.header.recordedAt) };
  const store = createStore({ now: () => clock.now() });
  const invoke = createInvoke(store);
  const api = createApi({ store, invoke });
  const events = createEmitter();
  const broadcast = (type, data) => events.emit('event', { type, data: viaJson(data) });
  store.subscribe((entry) => broadcast('activity', entry));
  let agentAudio = null;
  const readAudio = (offset, bytes) => (agentAudio && offset < agentAudio.byteLength ? base64Slice(agentAudio, offset, bytes) : '');
  const update = tape.lines.find((l) => l.dir === 'out' && l.event.type === 'session.update');

  const replay = {
    mode: 'replay',
    label: tapeLabel(tape.header),
    synthetic: Boolean(tape.header.synthetic),
    audio: Boolean(hasAudio),
    timers: time,
    create: () => {
      const provider = new ReplayVoiceProvider({ tape, speed: 1, now: time.now, timers: time, readAudio });
      clock.now = provider.now;
      // After the tape, the owner's taps get real, later times: the tape's last instant plus the
      // wall-clock time since it ended.
      provider.on('close', () => {
        if (clock.now !== provider.now) return;
        const end = provider.now();
        const closedAt = Date.now();
        clock.now = () => end + (Date.now() - closedAt);
      });
      store.reset();
      return provider;
    },
  };
  const sessions = createSessions({ store, invoke, voices: [replay], broadcast });

  const GET = {
    '/api/state': () => api.getState(),
    '/api/activity': () => api.getActivityLog(),
    '/api/tools': () => api.getTools(),
    '/api/voice': () => ({ status: 200, body: sessions.describe() }),
  };
  const POST = {
    '/api/invoke': (body) => api.postInvoke(body),
    '/api/voice/start': (body) => sessions.start(body),
    '/api/voice/stop': () => sessions.stop(),
  };

  return {
    kind: 'static',
    header: viaJson(tape.header),
    // The tape's session.update offset: a tape `t` minus this is a session time (?t= in the page).
    tapeT0: update ? update.t : 0,
    hasAudio: Boolean(hasAudio),
    setAgentAudio(buffer) {
      agentAudio = buffer && typeof buffer.byteLength === 'number' ? buffer : null;
    },
    async get(path) {
      const route = GET[normalize(path)];
      if (!route) throw new Error(`The static demo has no route GET ${path}.`);
      return viaJson(await route());
    },
    async post(path, body) {
      const route = POST[normalize(path)];
      if (!route) throw new Error(`The static demo has no route POST ${path}.`);
      return viaJson(await route(viaJson(body)));
    },
    // fn({ type, data }) for every event the server would stream: "activity" and "voice.*".
    on: (fn) => events.on('event', fn),
    clock: {
      now: time.now,
      advance: (ms) => time.advance(ms),
      runAll: () => time.runAll(),
      pending: () => time.pending(),
    },
  };
}

module.exports = { createStaticBackend, viaJson };
