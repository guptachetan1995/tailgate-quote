'use strict';

// Test doubles for the network edges: a scriptable WebSocket, a scripted fetch, and a virtual
// clock. Nothing here opens a socket or makes a request.

// A new WebSocket class per test, so instances never leak between tests. The "server side" of
// each instance is driven by the test: open(), serverSend(), serverClose().
function mockWebSocketClass() {
  const instances = [];
  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.listeners = {};
      this.closedWith = null;
      instances.push(this);
    }

    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    }

    dispatch(type, event) {
      for (const fn of this.listeners[type] || []) fn(event);
    }

    send(data) {
      if (this.readyState !== 1) throw new Error('MockWebSocket: send while not open');
      this.sent.push(data);
    }

    close(code = 1000, reason = '') {
      if (this.readyState >= 2) return;
      this.readyState = 3;
      this.closedWith = { code, reason };
      this.dispatch('close', { code, reason });
    }

    open() {
      this.readyState = 1;
      this.dispatch('open', {});
    }

    serverSend(value) {
      this.dispatch('message', { data: typeof value === 'string' || value instanceof ArrayBuffer ? value : JSON.stringify(value) });
    }

    serverClose(code, reason = '') {
      this.readyState = 3;
      this.dispatch('close', { code, reason });
    }

    sentJson() {
      return this.sent.filter((d) => typeof d === 'string').map((d) => JSON.parse(d));
    }
  }
  MockWebSocket.instances = instances;
  return MockWebSocket;
}

function response(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

// fetch that answers each call with the next scripted response (or throws it, if an Error).
function scriptedFetch(...answers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected fetch ${url}`);
    if (next instanceof Error) throw next;
    return response(next.status, next.body);
  };
  fn.calls = calls;
  return fn;
}

// Virtual time: timers run only when the test advances the clock, in time order.
function virtualTime(start = 1_000_000) {
  let now = start;
  let seq = 0;
  let queue = [];
  const timers = {
    setTimeout(fn, ms) {
      seq += 1;
      queue.push({ id: seq, at: now + Math.max(0, ms || 0), fn });
      return seq;
    },
    clearTimeout(id) {
      queue = queue.filter((q) => q.id !== id);
    },
  };
  const flush = async () => {
    for (let i = 0; i < 3; i += 1) await new Promise((r) => setImmediate(r));
  };
  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      await flush();
      queue.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = queue[0];
      if (!next || next.at > end) break;
      queue.shift();
      now = next.at;
      next.fn();
    }
    now = end;
    await flush();
  }
  // Advances in steps until the promise settles.
  async function until(promise, { step = 50, max = 10 * 60 * 1000 } = {}) {
    let settled = false;
    let value;
    let error;
    promise.then(
      (v) => {
        settled = true;
        value = v;
      },
      (e) => {
        settled = true;
        error = e;
      },
    );
    let spent = 0;
    while (!settled) {
      if (spent > max) throw new Error('virtual time ran out before the promise settled');
      await advance(step);
      spent += step;
    }
    if (error) throw error;
    return value;
  }
  return { now: () => now, timers, advance, until };
}

// Stand-ins for the runtime's network globals that fail loudly if anything reaches them.
function forbidNetwork() {
  const saved = { fetch: global.fetch, WebSocket: global.WebSocket };
  global.fetch = () => {
    throw new Error('network: fetch called in a test');
  };
  global.WebSocket = class {
    constructor() {
      throw new Error('network: WebSocket opened in a test');
    }
  };
  return () => {
    global.fetch = saved.fetch;
    global.WebSocket = saved.WebSocket;
  };
}

module.exports = { mockWebSocketClass, scriptedFetch, response, virtualTime, forbidNetwork };
