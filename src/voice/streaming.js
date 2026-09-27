'use strict';

// StreamingTranscriber: AssemblyAI's Streaming Speech-to-Text v3 (Node, server side only).
// It is the second AssemblyAI surface in this entry, used for evidence rather than at runtime:
// scripts/keyterms-ab.js streams the same recorded line twice, without and with
// keyterms_prompt built from the owner's price list, and keeps both transcripts.
//
//   connect()     mints a single-use token (GET https://streaming.assemblyai.com/v3/token,
//                 `Authorization: <key>` with no "Bearer" on this product), opens
//                 wss://streaming.assemblyai.com/v3/ws?…&token=… and resolves with Begin;
//   sendAudio()   one binary frame of PCM16 mono at sample_rate, 50–1000 ms long, never
//                 faster than real time (the pacer in wav.js guarantees that);
//   terminate()   sends {"type":"Terminate"} and waits for Termination, so the last Turn
//                 arrives and the session stops billing.
//
// Turns carry the whole turn so far; only end_of_turn turns are kept as final.

const { createEmitter } = require('./emitter');

const STT_HTTP = 'https://streaming.assemblyai.com';
const STT_WS = 'wss://streaming.assemblyai.com/v3/ws';
const OPEN = 1;
const DEFAULTS = { speech_model: 'universal-3-6-pro', sample_rate: 16000, encoding: 'pcm_s16le' };

function checkKeyterms(terms) {
  if (!Array.isArray(terms) || terms.length > 100) throw new Error('keyterms_prompt must be a list of at most 100 terms');
  for (const t of terms) if (typeof t !== 'string' || t.length === 0 || t.length > 50) throw new Error(`keyterm "${t}" must be 1–50 characters`);
}

class StreamingTranscriber {
  #apiKey;
  #token = null;
  #ws = null;
  #fetch;
  #WebSocket;

  constructor({
    apiKey,
    params = {},
    fetch: fetchImpl = (...a) => globalThis.fetch(...a),
    WebSocket: WebSocketImpl = globalThis.WebSocket,
    tokenTtlSeconds = 60,
    maxSessionSeconds = 600,
    timers = null,
  } = {}) {
    if (typeof apiKey !== 'string' || apiKey.trim() === '') throw new Error('StreamingTranscriber needs an API key: set ASSEMBLYAI_API_KEY in .env.');
    if (params.keyterms_prompt !== undefined) checkKeyterms(params.keyterms_prompt);
    this.#apiKey = apiKey.trim();
    this.params = { ...DEFAULTS, ...params };
    this.#fetch = fetchImpl;
    this.#WebSocket = WebSocketImpl;
    this.tokenTtlSeconds = tokenTtlSeconds;
    this.maxSessionSeconds = maxSessionSeconds;
    this.timers = timers || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };
    this.events = createEmitter();
    this.finals = [];
    this.begin = null;
    this.termination = null;
    this.errors = [];
  }

  on(type, fn) {
    return this.events.on(type, fn);
  }

  redact(text) {
    let out = String(text == null ? '' : text);
    for (const s of [this.#apiKey, this.#token]) if (s) out = out.split(s).join('[redacted]');
    return out;
  }

  async mintToken() {
    const url = `${STT_HTTP}/v3/token?expires_in_seconds=${this.tokenTtlSeconds}&max_session_duration_seconds=${this.maxSessionSeconds}`;
    let res;
    try {
      res = await this.#fetch(url, { method: 'GET', headers: { Authorization: this.#apiKey } });
    } catch (err) {
      throw new Error(`Could not reach AssemblyAI to mint a streaming token: ${this.redact(err && err.message)}`);
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = await res.text();
      } catch {
        // no body
      }
      throw new Error(`AssemblyAI refused the streaming token request (HTTP ${res.status}): ${this.redact(detail).slice(0, 300)}`);
    }
    const body = await res.json();
    if (!body || typeof body.token !== 'string' || body.token === '') throw new Error('AssemblyAI answered the streaming token request without a token.');
    return body.token;
  }

  // The socket URL with every parameter except the token, as written to evidence files.
  describeUrl() {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(this.params)) q.set(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
    return `${STT_WS}?${q.toString()}`;
  }

  async connect({ timeoutMs = 15000 } = {}) {
    if (this.#ws) throw new Error('This transcriber already holds a session; create a new one per session.');
    this.#token = await this.mintToken();
    const ws = new this.#WebSocket(`${this.describeUrl()}&token=${encodeURIComponent(this.#token)}`);
    ws.binaryType = 'arraybuffer';
    this.#ws = ws;
    return new Promise((resolve, reject) => {
      const timer = this.timers.setTimeout(() => {
        reject(new Error(`Timed out after ${timeoutMs} ms waiting for Begin.`));
        ws.close();
      }, timeoutMs);
      ws.addEventListener('message', (e) => {
        const event = this.#parse(e.data);
        if (event && event.type === 'Begin') {
          this.timers.clearTimeout(timer);
          resolve(event);
        }
      });
      ws.addEventListener('close', (e) => {
        this.timers.clearTimeout(timer);
        const info = { code: e.code, reason: this.redact(e.reason) };
        this.events.emit('close', info);
        if (!this.begin) {
          const last = this.errors[this.errors.length - 1];
          reject(new Error(`AssemblyAI closed the streaming socket before Begin: code ${info.code}${last ? `: ${last.error}` : info.reason ? `: ${info.reason}` : ''}`));
        }
      });
    });
  }

  #parse(data) {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    let event;
    try {
      event = JSON.parse(text);
    } catch {
      return null;
    }
    switch (event.type) {
      case 'Begin':
        this.begin = event;
        break;
      case 'Turn':
        if (event.end_of_turn) this.finals.push(event);
        this.events.emit('turn', event);
        break;
      case 'Termination':
        this.termination = event;
        this.events.emit('termination', event);
        break;
      case 'Error':
        this.errors.push({ error_code: event.error_code, error: this.redact(event.error) });
        break;
      default:
        break;
    }
    this.events.emit('message', event);
    return event;
  }

  sendAudio(bytes) {
    const ws = this.#ws;
    if (!ws || ws.readyState !== OPEN) throw new Error('Cannot send audio: the streaming socket is not open.');
    ws.send(bytes);
  }

  async terminate({ timeoutMs = 10000 } = {}) {
    const ws = this.#ws;
    if (!ws || ws.readyState !== OPEN) return this.termination;
    const done = new Promise((resolve) => {
      const timer = this.timers.setTimeout(resolve, timeoutMs);
      const finish = () => {
        this.timers.clearTimeout(timer);
        resolve();
      };
      this.events.on('termination', finish);
      this.events.on('close', finish);
    });
    ws.send(JSON.stringify({ type: 'Terminate' }));
    await done;
    if (ws.readyState <= OPEN) ws.close(1000, 'client done');
    return this.termination;
  }

  // The finished transcript: the text of every end-of-turn Turn, in order.
  transcript() {
    return this.finals.map((t) => t.transcript).join(' ').trim();
  }

  toJSON() {
    return { provider: 'assemblyai-streaming-stt', params: this.params };
  }
}

module.exports = { StreamingTranscriber, STT_HTTP, STT_WS, DEFAULTS };
