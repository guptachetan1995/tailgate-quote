'use strict';

// AssemblyAIVoiceProvider: a live session on AssemblyAI's Voice Agent API (Node, server side
// only). One provider holds one session:
//
//   1. connect() mints a single-use temporary token with the API key
//        GET https://agents.assemblyai.com/v1/token?expires_in_seconds=…&max_session_duration_seconds=…
//        Authorization: Bearer <key>
//      (the token endpoints send no CORS headers, so this can only happen on a server), then
//      opens wss://agents.assemblyai.com/v1/ws?token=… with the runtime's global WebSocket.
//      Connecting by token needs no WebSocket `headers` option, so it works on every Node with
//      a global WebSocket, and it is the same connect path a browser would use.
//   2. every JSON frame from the service is emitted as a 'message' event; the bridge turns
//      them into invoke() calls. send(event) writes one JSON frame.
//   3. close() closes the socket. The bridge sends session.end first, which stops billing at
//      once instead of after the 30-second grace window.
//
// The key lives in a private field: it is never emitted, logged, put in a URL or included in
// an error message (any text that comes back from the service is redacted before use). The
// token is a credential too and is handled the same way.
//
// fetch and WebSocket are injectable so the tests run against fakes with no network.

const { createEmitter } = require('./emitter');

const AGENTS_HTTP = 'https://agents.assemblyai.com';
const AGENTS_WS = 'wss://agents.assemblyai.com/v1/ws';
const OPEN = 1;

function redactor(secrets) {
  return (text) => {
    let out = String(text == null ? '' : text);
    for (const s of secrets()) if (s) out = out.split(s).join('[redacted]');
    return out;
  };
}

async function bodyText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

class AssemblyAIVoiceProvider {
  #apiKey;
  #token = null;
  #ws = null;
  #fetch;
  #WebSocket;

  constructor({
    apiKey,
    fetch: fetchImpl = (...a) => globalThis.fetch(...a),
    WebSocket: WebSocketImpl = globalThis.WebSocket,
    tokenTtlSeconds = 60,
    maxSessionSeconds = 600,
    connectTimeoutMs = 15000,
    timers = null,
  } = {}) {
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error('AssemblyAIVoiceProvider needs an API key: set ASSEMBLYAI_API_KEY in .env (server side only).');
    }
    if (typeof WebSocketImpl !== 'function') throw new Error('This runtime has no global WebSocket; use Node.js 22 or newer.');
    this.#apiKey = apiKey.trim();
    this.#fetch = fetchImpl;
    this.#WebSocket = WebSocketImpl;
    this.tokenTtlSeconds = tokenTtlSeconds;
    this.maxSessionSeconds = maxSessionSeconds;
    this.connectTimeoutMs = connectTimeoutMs;
    this.timers = timers || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };
    this.events = createEmitter();
    this.redact = redactor(() => [this.#apiKey, this.#token]);
    this.closed = false;
  }

  on(type, fn) {
    return this.events.on(type, fn);
  }

  async mintToken() {
    const url = `${AGENTS_HTTP}/v1/token?expires_in_seconds=${this.tokenTtlSeconds}&max_session_duration_seconds=${this.maxSessionSeconds}`;
    let res;
    try {
      res = await this.#fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${this.#apiKey}` } });
    } catch (err) {
      throw new Error(`Could not reach AssemblyAI to mint a session token: ${this.redact(err && err.message)}`);
    }
    if (!res.ok) {
      const detail = this.redact(await bodyText(res)).slice(0, 300);
      // An invalid key has been seen to come back as 404 {"detail":"Invalid API key"}, not only 401.
      const hint = [401, 403, 404].includes(res.status) ? ' Check that ASSEMBLYAI_API_KEY in .env is the key from your AssemblyAI dashboard.' : '';
      throw new Error(`AssemblyAI refused the session token request (HTTP ${res.status}): ${detail}${hint}`);
    }
    const body = await res.json();
    if (!body || typeof body.token !== 'string' || body.token === '') throw new Error('AssemblyAI answered the token request without a token.');
    return body.token;
  }

  async connect() {
    if (this.#ws) throw new Error('This provider already holds a session; create a new provider for each session (tokens are single-use).');
    this.#token = await this.mintToken();
    const ws = new this.#WebSocket(`${AGENTS_WS}?token=${encodeURIComponent(this.#token)}`);
    ws.binaryType = 'arraybuffer';
    this.#ws = ws;

    await new Promise((resolve, reject) => {
      let opened = false;
      const timer = this.timers.setTimeout(() => {
        reject(new Error(`Timed out after ${this.connectTimeoutMs} ms opening the Voice Agent socket.`));
        ws.close();
      }, this.connectTimeoutMs);
      ws.addEventListener('open', () => {
        opened = true;
        this.timers.clearTimeout(timer);
        this.events.emit('open');
        resolve();
      });
      ws.addEventListener('error', (e) => {
        if (opened) return;
        this.timers.clearTimeout(timer);
        reject(new Error(`Could not open the Voice Agent socket: ${this.redact((e && e.message) || 'connection error')}`));
      });
      ws.addEventListener('close', (e) => {
        this.timers.clearTimeout(timer);
        this.closed = true;
        const info = { code: e.code, reason: this.redact(e.reason) };
        this.events.emit('close', info);
        if (!opened) {
          const why = info.code === 1008 ? ' (unauthorized, or the account has no balance)' : '';
          reject(new Error(`AssemblyAI closed the Voice Agent socket before it opened: code ${info.code}${why}${info.reason ? `: ${info.reason}` : ''}`));
        }
      });
      ws.addEventListener('message', (e) => this.#onFrame(e.data));
    });
  }

  #onFrame(data) {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    let event;
    try {
      event = JSON.parse(text);
    } catch {
      this.events.emit('error', { message: 'AssemblyAI sent a frame that is not JSON; it was ignored.' });
      return;
    }
    this.events.emit('message', event);
  }

  send(event) {
    const ws = this.#ws;
    if (!ws || ws.readyState !== OPEN) throw new Error(`Cannot send ${event.type}: the Voice Agent socket is not open.`);
    ws.send(JSON.stringify(event));
  }

  close() {
    const ws = this.#ws;
    if (ws && ws.readyState <= OPEN) ws.close(1000, 'client done');
  }

  // Session artifacts (timeline and metadata) for the evidence folder, after the session. The
  // docs' examples disagree on the auth header for this REST call, so Bearer is tried first,
  // then the raw key; the result says which one worked, so it can be written down.
  async fetchSession(sessionId) {
    if (!/^[A-Za-z0-9_-]+$/.test(String(sessionId))) throw new Error(`"${sessionId}" is not a session id.`);
    const url = `${AGENTS_HTTP}/v1/sessions/${sessionId}`;
    const tried = [];
    for (const [auth, header] of [
      ['Bearer', `Bearer ${this.#apiKey}`],
      ['raw key', this.#apiKey],
    ]) {
      const res = await this.#fetch(url, { method: 'GET', headers: { Authorization: header } });
      if (res.ok) return { auth, body: await res.json() };
      tried.push(`${auth}: HTTP ${res.status} ${this.redact(await bodyText(res)).slice(0, 200)}`);
    }
    throw new Error(`Could not read session ${sessionId}: ${tried.join('; ')}`);
  }

  // Never serialise the credentials; the private fields are already invisible to JSON and
  // util.inspect, and this keeps the rest of the object out of logs too.
  toJSON() {
    return { provider: 'assemblyai-voice-agent', closed: this.closed };
  }
}

module.exports = { AssemblyAIVoiceProvider, AGENTS_HTTP, AGENTS_WS };
