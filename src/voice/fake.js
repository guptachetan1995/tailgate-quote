'use strict';

// FakeVoiceProvider: speaks the Voice Agent API's documented JSON events with no network.
// A test (or the offline demo) pushes server events in with emit(); everything the bridge sends
// is recorded in `sent`. It answers session.update with session.ready and session.end with
// session.ended, as the real service does.

const { createEmitter } = require('./emitter');

const clone = (v) => JSON.parse(JSON.stringify(v));

class FakeVoiceProvider {
  constructor({ sessionId = 'sess_fake_0001', autoReady = true } = {}) {
    this.sessionId = sessionId;
    this.autoReady = autoReady;
    this.sent = [];
    this.connected = false;
    this.closed = false;
    this.events = createEmitter();
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
    if (!this.connected || this.closed) throw new Error(`FakeVoiceProvider: send(${event.type}) while not connected`);
    this.sent.push(clone(event));
    if (event.type === 'session.update' && this.autoReady && !this.readySent) {
      this.readySent = true;
      this.emit({
        type: 'session.ready',
        session_id: this.sessionId,
        expires_at: 1790000000,
        resume_token: 'fake-resume-token',
        config: { voice: event.session.output && event.session.output.voice },
      });
    }
    if (event.type === 'session.end') {
      this.emit({ type: 'session.ended', session_duration_seconds: 0, audio_duration_seconds: 0 });
    }
  }

  // Delivers one server event to the bridge.
  emit(event) {
    this.events.emit('message', clone(event));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.events.emit('close', { code: 1000 });
  }

  sentOfType(type) {
    return this.sent.filter((e) => e.type === type);
  }
}

module.exports = { FakeVoiceProvider };
