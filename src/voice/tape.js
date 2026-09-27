'use strict';

// Session tapes: one JSON line per protocol event, so a real session can be replayed through
// the real invoke() later. Scrubbed at write time, not afterwards:
//   - each event keeps only the fields on its type's allowlist (unknown types keep only `type`);
//   - any key containing "token" is dropped at every depth (resume tokens, temporary tokens);
//   - URLs lose their query string and fragment (signed URLs);
//   - reply.audio payloads go to a sidecar via writeAudio and the tape keeps only an offset;
//   - the owner's microphone audio (input.audio) is never written.

const { createEmitter } = require('./emitter');

const ALLOW = {
  'session.ready': ['session_id', 'expires_at', 'config'],
  'session.updated': [],
  'input.speech.started': [],
  'input.speech.stopped': [],
  'transcript.user.delta': ['item_id', 'text', 'delta'],
  'transcript.user': ['item_id', 'text'],
  'reply.started': ['reply_id', 'item_id'],
  'transcript.agent.delta': ['delta', 'start_ms', 'end_ms'],
  'transcript.agent': ['text', 'interrupted'],
  'reply.done': ['reply_id', 'status'],
  'tool.call': ['call_id', 'name', 'arguments'],
  'session.error': ['code', 'message', 'param'],
  'session.ended': ['session_duration_seconds', 'audio_duration_seconds'],
  'session.update': ['session'],
  'tool.result': ['call_id', 'result', 'is_error'],
  'conversation.message': ['role', 'content'],
  'reply.create': ['instructions'],
  'session.end': [],
};

function stripUrl(s) {
  if (!/^(https?|wss?):\/\//i.test(s)) return s;
  try {
    const url = new URL(s);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return s.replace(/[?#].*$/, '');
  }
}

function scrub(value) {
  if (typeof value === 'string') return stripUrl(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!/token/i.test(k)) out[k] = scrub(v);
    return out;
  }
  return value;
}

function base64Length(b64) {
  const s = String(b64 || '');
  return Math.floor((s.length * 3) / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);
}

function scrubEvent(event) {
  const keep = ALLOW[event.type] || [];
  const out = { type: event.type };
  for (const k of keep) if (event[k] !== undefined) out[k] = scrub(event[k]);
  return out;
}

// The first line of every tape. `synthetic` is true only for a hand-made sample, which the
// demo must label as such; a recorded session carries its real session id.
function tapeHeader({ recordedAt, seedHash = null, sessionId = null, model = null, synthetic = false, label = null }) {
  return scrub({ type: 'tape.header', recordedAt, seedHash, sessionId, model, synthetic, label });
}

// What the page and the terminal say a tape is.
function tapeLabel(header) {
  if (header.synthetic) return header.label || 'Scripted sample, not a recorded session';
  const day = String(header.recordedAt).slice(0, 10);
  return `Replay of a real AssemblyAI Voice Agent session (${header.sessionId}, recorded ${day})`;
}

// A short, stable fingerprint of the seed data (FNV-1a, 32 bit), so a replay can say when the
// price list it runs on is not the one the session was recorded against. Not a security hash;
// it also runs in the browser bundle, which has no crypto module.
function fingerprint(value) {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// The session clock a tape defines: recordedAt plus the offset of the latest server event.
// The recorder advances it on every event it receives and the replay on every event it
// delivers, so the store's timestamps (and so every tool result) come out identical on any
// later day.
function createTapeClock(recordedAt) {
  const base = Date.parse(recordedAt);
  if (Number.isNaN(base)) throw new Error(`tape recordedAt "${recordedAt}" is not a date`);
  let t = 0;
  return {
    now: () => base + t,
    advance(ms) {
      if (ms > t) t = ms;
    },
    get t() {
      return t;
    },
  };
}

// Wraps a provider so every event in both directions is written to the tape as it happens,
// with t = elapsed() milliseconds since the session started. Outgoing events are recorded
// before they are sent, because a provider may answer synchronously.
function recordingProvider(inner, { writer, elapsed, clock = null }) {
  const events = createEmitter();
  inner.on('message', (event) => {
    const t = elapsed();
    if (clock) clock.advance(t);
    writer.record('in', event, t);
    events.emit('message', event);
  });
  inner.on('open', (info) => events.emit('open', info));
  inner.on('close', (info) => events.emit('close', info));
  return {
    on: events.on,
    connect: () => inner.connect(),
    send(event) {
      writer.record('out', event, elapsed());
      inner.send(event);
    },
    close: () => inner.close(),
  };
}

// write(line) receives each JSON line (no newline); writeAudio(base64) stores a reply.audio
// payload and the tape records the byte offset it would start at.
function createTapeWriter({ write, writeAudio = () => {}, header }) {
  write(JSON.stringify(tapeHeader(header)));
  let audioOffset = 0;
  return {
    // t: milliseconds since the session started; dir: "in" (server to client) or "out".
    record(dir, event, t) {
      if (event.type === 'input.audio') return;
      let line;
      if (event.type === 'reply.audio') {
        const bytes = base64Length(event.data);
        writeAudio(event.data);
        line = { t, dir, event: { type: 'reply.audio', audio_offset: audioOffset, audio_bytes: bytes } };
        audioOffset += bytes;
      } else {
        line = { t, dir, event: scrubEvent(event) };
      }
      write(JSON.stringify(line));
    },
  };
}

function parseTape(text) {
  const rows = String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        throw new Error(`tape line ${i + 1} is not JSON`);
      }
    });
  if (rows.length === 0 || rows[0].type !== 'tape.header') throw new Error('tape must start with a tape.header line');
  const [header, ...lines] = rows;
  lines.forEach((row, i) => {
    if (typeof row.t !== 'number' || !['in', 'out'].includes(row.dir) || !row.event || typeof row.event.type !== 'string') {
      throw new Error(`tape line ${i + 2} must be { t, dir, event: { type, ... } }`);
    }
  });
  return { header, lines };
}

module.exports = {
  createTapeWriter,
  parseTape,
  scrub,
  scrubEvent,
  tapeHeader,
  tapeLabel,
  fingerprint,
  createTapeClock,
  recordingProvider,
  ALLOW,
};
