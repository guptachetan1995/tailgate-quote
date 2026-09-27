'use strict';

const defaultSeed = require('../fake-data/seed.json');
const { catalogModels } = require('./evidence');

const DAY_MS = 24 * 60 * 60 * 1000;

// Sequential ids, so a replayed session produces the same ids as the recording.
function createIds() {
  const counters = { quote: 1000, supplier: 2000, turn: 0, outbox: 0 };
  const format = {
    quote: (n) => `Q-${n}`,
    supplier: (n) => `S-${n}`,
    turn: (n) => `turn_${n}`,
    outbox: (n) => `OUT-${n}`,
  };
  return {
    next(kind) {
      counters[kind] += 1;
      return format[kind](counters[kind]);
    },
  };
}

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

// Seed dates are day offsets resolved against the injected clock, never the system clock, so
// the story never goes stale and a replay on a later day produces the same state.
function resolveSeed(seed, now) {
  const base = clone(seed);
  return {
    business: base.business,
    suppliers: base.suppliers,
    catalog: base.catalog,
    leads: base.leads.map(({ createdDaysAgo, ...lead }) => ({
      ...lead,
      createdAt: new Date(now() - createdDaysAgo * DAY_MS).toISOString(),
    })),
    turns: [],
    drafts: [],
    outbox: [],
  };
}

// createStore({ seed, now, ids }): in-memory state with an append-only activity log.
//   now  - () => epoch milliseconds (the server passes Date.now; replay passes the tape clock)
//   ids  - a factory returning an id source with next(kind)
function createStore({ seed = defaultSeed, now = Date.now, ids = createIds } = {}) {
  let state;
  let log;
  let idSource;
  let models;
  let seq;
  const listeners = new Set();

  function reset() {
    state = resolveSeed(seed, now);
    log = [];
    idSource = ids();
    models = catalogModels(state.catalog);
    seq = 0;
  }
  reset();

  return {
    // Live state, for the verb handlers only. Everything leaving the store is a copy.
    get state() {
      return state;
    },
    get models() {
      return models;
    },
    nowIso: () => new Date(now()).toISOString(),
    nextId: (kind) => idSource.next(kind),
    snapshot: () => clone(state),
    // Entries are frozen JSON snapshots taken at append time: a later change to a draft never
    // rewrites what the log says happened.
    appendLog(entry) {
      seq += 1;
      const frozen = deepFreeze(clone({ seq, at: new Date(now()).toISOString(), ...entry }));
      log.push(frozen);
      for (const fn of listeners) fn(frozen);
      return clone(frozen);
    },
    activityLog: () => clone(log),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reset,
  };
}

module.exports = { createStore, createIds, clone };
