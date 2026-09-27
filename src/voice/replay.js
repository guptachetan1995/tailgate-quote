'use strict';

// ReplayVoiceProvider: plays a recorded session tape back through the same bridge and the same
// invoke() that ran it live. It speaks the provider interface (connect, send, on, close):
//
//   - the tape's server events ("in") are delivered at their recorded offsets, divided by
//     `speed`, counted from the moment the bridge sends its session.update, exactly as the
//     live session counted them; the playback ends at the recorded session.end;
//   - the bridge's own waits (the evidence wait, the tool-result fallback) must run on the
//     same timeline, so the bridge is given `bridgeTimers`: the replay's timers scaled by the
//     same speed. Speed Infinity plays on a private virtual clock that runs the tape's events
//     and the bridge's timers together in tape-time order, synchronously; so a replay gives the
//     same results at every speed;
//   - the tool calls in the tape are therefore re-executed by the real gate, and every
//     tool.result the bridge sends now is compared with the one it sent during the recording
//     (drift()), so a change to pricing or evidence logic shows up as a difference;
//   - its clock (now) is the tape clock, recordedAt plus the offset of the latest delivered
//     event; a store built on it produces the recording's timestamps and ids on any day;
//   - events recorded after the client's session.end, and session.ended itself, are delivered
//     when the bridge sends session.end, so stopping early behaves like the live service.
//
// Browser-safe: no Node modules, no process, no filesystem. `readAudio(offset, bytes)` may
// return the agent's recorded voice (base64) from the tape's audio sidecar.

const { createEmitter } = require('./emitter');
const { createTapeClock } = require('./tape');
const { createVirtualTime } = require('./virtual-time');

const clone = (v) => JSON.parse(JSON.stringify(v));
const REAL_TIMERS = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };

// Timers whose delays are divided by `speed`: a 3 s wait in tape time is 0.75 s at speed 4.
function scaledTimers(timers, speed) {
  if (speed === 1) return timers;
  return { setTimeout: (fn, ms) => timers.setTimeout(fn, ms / speed), clearTimeout: (id) => timers.clearTimeout(id) };
}

class ReplayVoiceProvider {
  constructor({ tape, speed = 1, now = () => Date.now(), timers = null, readAudio = null }) {
    if (!(speed > 0)) throw new Error('speed must be a positive number; Infinity replays instantly');
    this.header = tape.header;
    this.speed = speed;
    this.clock = createTapeClock(tape.header.recordedAt);
    this.now = this.clock.now;
    if (Number.isFinite(speed)) {
      this.realNow = now;
      this.timers = timers || REAL_TIMERS;
      this.pace = speed;
      this.instant = null;
    } else {
      this.instant = createVirtualTime();
      this.realNow = this.instant.now;
      this.timers = this.instant;
      this.pace = 1;
    }
    this.bridgeTimers = scaledTimers(this.timers, this.pace);
    this.readAudio = readAudio;
    this.events = createEmitter();

    const lines = tape.lines;
    const updateAt = lines.findIndex((l) => l.dir === 'out' && l.event.type === 'session.update');
    const endAt = lines.findIndex((l) => l.dir === 'out' && l.event.type === 'session.end');
    this.t0 = updateAt >= 0 ? lines[updateAt].t : 0;
    // Typed turns (the text-only smoke run) were recorded by the bridge as it sent them, so
    // they are replayed as the transcripts they stood for, in their place in the session.
    const typed = (l) => l.dir === 'out' && l.event.type === 'conversation.message' && l.event.role === 'user';
    this.playback = lines.filter((l, i) => (l.dir === 'in' || typed(l)) && (endAt < 0 || i < endAt));
    this.afterEnd = endAt < 0 ? [] : lines.filter((l, i) => l.dir === 'in' && i > endAt);
    // Where the playback ends: the recorded session.end (so a wait that was still running when
    // the recording ended is cancelled here too), or the last event of a tape without one.
    const last = this.playback[this.playback.length - 1];
    this.endT = endAt >= 0 ? lines[endAt].t : last ? last.t : this.t0;
    this.recorded = new Map();
    for (const l of lines) if (l.dir === 'out' && l.event.type === 'tool.result') this.recorded.set(l.event.call_id, l.event);
    this.replayed = new Map();

    this.connected = false;
    this.closed = false;
    this.started = false;
    this.ending = false;
    this.position = 0;
    this.typedSeq = 0;
    this.timer = null;
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  on(type, fn) {
    return this.events.on(type, fn);
  }

  connect() {
    this.connected = true;
    this.events.emit('open');
    return Promise.resolve();
  }

  send(event) {
    if (!this.connected || this.closed) throw new Error(`ReplayVoiceProvider: send(${event.type}) while not connected`);
    switch (event.type) {
      case 'session.update':
        if (!this.started) {
          this.started = true;
          this.play();
        }
        break;
      case 'tool.result':
        this.replayed.set(event.call_id, clone(event));
        break;
      case 'session.end':
        this.end();
        break;
      default:
        break;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    this.resolveDone();
    this.events.emit('close', { code: 1000 });
  }

  play() {
    const start = this.realNow();
    const due = (t) => start + (t - this.t0) / this.pace;
    const tick = () => {
      this.timer = null;
      while (this.position < this.playback.length && !this.ending && !this.closed) {
        const line = this.playback[this.position];
        const wait = due(line.t) - this.realNow();
        if (wait > 0) {
          this.timer = this.timers.setTimeout(tick, wait);
          return;
        }
        this.position += 1;
        this.deliver(line);
      }
      if (this.ending || this.closed) return;
      const wait = due(this.endT) - this.realNow();
      if (wait > 0) {
        this.timer = this.timers.setTimeout(() => {
          this.timer = null;
          this.resolveDone();
        }, wait);
      } else {
        this.resolveDone();
      }
    };
    tick();
    // Speed Infinity: run the whole session now, tape events and bridge timers in time order.
    if (this.instant) this.instant.advanceTo(due(this.endT));
  }

  end() {
    if (this.ending) return;
    this.ending = true;
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    for (const line of this.afterEnd) this.deliver(line);
    if (!this.afterEnd.some((l) => l.event.type === 'session.ended')) {
      this.deliverEvent({ type: 'session.ended', session_duration_seconds: 0, audio_duration_seconds: 0 }, this.clock.t);
    }
    this.resolveDone();
  }

  deliver(line) {
    if (line.dir === 'out') {
      // The recording's clock stood at the last server event when the typed turn was stored.
      this.typedSeq += 1;
      this.deliverEvent({ type: 'transcript.user', item_id: `text_${this.typedSeq}`, text: line.event.content }, this.clock.t);
      return;
    }
    this.deliverEvent(this.serverEvent(line.event), line.t);
  }

  deliverEvent(event, t) {
    this.clock.advance(t);
    this.events.emit('progress', { index: this.position, total: this.playback.length, t, type: event.type });
    this.events.emit('message', event);
  }

  serverEvent(recorded) {
    if (recorded.type !== 'reply.audio') return clone(recorded);
    const { audio_offset: offset, audio_bytes: bytes } = recorded;
    return { type: 'reply.audio', data: this.readAudio ? this.readAudio(offset, bytes) : '', audio_offset: offset, audio_bytes: bytes };
  }

  // Every recorded tool.result against the one sent during this replay. `missing` means the
  // replay has not (or never) produced it; `changed` means the gate now answers differently;
  // `unexpected` means the replay produced a result the recording never sent.
  drift() {
    const out = [];
    for (const [callId, rec] of this.recorded) {
      const got = this.replayed.get(callId);
      if (!got) out.push({ call_id: callId, kind: 'missing', recorded: rec });
      else if (got.result !== rec.result || Boolean(got.is_error) !== Boolean(rec.is_error)) {
        out.push({ call_id: callId, kind: 'changed', recorded: rec, replayed: got });
      }
    }
    for (const [callId, got] of this.replayed) if (!this.recorded.has(callId)) out.push({ call_id: callId, kind: 'unexpected', replayed: got });
    return out;
  }

  // Milliseconds the playback covers at speed 1, from the session.update to the session.end.
  get durationMs() {
    return this.endT - this.t0;
  }

  // The session's own time zero on the tape clock: the moment of the session.update. Session
  // times shown anywhere (the wire rail, the progress bar, ?at=) count from here, as
  // durationMs does; tape `t` values count from before the socket opened.
  get originMs() {
    return Date.parse(this.header.recordedAt) + this.t0;
  }
}

module.exports = { ReplayVoiceProvider, scaledTimers };
