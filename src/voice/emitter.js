'use strict';

// A minimal event emitter that also bundles for the browser (Node's `events` does not).
function createEmitter() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type).delete(fn);
    },
    emit(type, payload) {
      for (const fn of handlers.get(type) || []) fn(payload);
    },
  };
}

module.exports = { createEmitter };
