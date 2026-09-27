'use strict';

// Real sockets on 127.0.0.1 for the HTTP tests: a request helper, an app listening on an
// ephemeral port, and a server-sent-events reader.

const http = require('http');
const { createApp } = require('../src/server');
const { createStore } = require('../src/store');
const { T0 } = require('./helpers');

function request(port, { method = 'GET', path: p = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data, json: () => JSON.parse(data) }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function listen(opts = {}) {
  const store = opts.store || createStore({ now: () => T0 });
  const app = createApp({ ...opts, store });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const bodies = [];
  const call = async (method, p, payload, headers = {}) => {
    const res = await request(port, {
      method,
      path: p,
      headers: { Host: `127.0.0.1:${port}`, ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: payload === undefined ? undefined : typeof payload === 'string' ? payload : JSON.stringify(payload),
    });
    bodies.push(res.text);
    return res;
  };
  return { store, server, port, call, bodies, close: () => new Promise((r) => server.close(r)) };
}

// Subscribes to /api/events. `ready` resolves once the stream is open; waitFor(pred) resolves
// with every event so far once one matches.
function openEvents(port) {
  const events = [];
  const waiters = [];
  let req;
  const ready = new Promise((resolve, reject) => {
    req = http.get({ host: '127.0.0.1', port, path: '/api/events', headers: { Host: `127.0.0.1:${port}` } }, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        let at;
        while ((at = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, at);
          buf = buf.slice(at + 2);
          const type = /^event: (.*)$/m.exec(block);
          const data = /^data: (.*)$/m.exec(block);
          if (!type || !data) continue;
          const event = { type: type[1], data: JSON.parse(data[1]) };
          events.push(event);
          for (const w of waiters.slice()) {
            if (w.pred(event)) {
              waiters.splice(waiters.indexOf(w), 1);
              w.resolve(events);
            }
          }
        }
      });
      resolve();
    });
    req.on('error', reject);
  });
  return {
    ready,
    events,
    waitFor: (pred) => new Promise((resolve) => (events.some(pred) ? resolve(events) : waiters.push({ pred, resolve }))),
    close: () => req.destroy(),
  };
}

module.exports = { request, listen, openEvents };
