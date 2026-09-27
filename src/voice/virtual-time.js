'use strict';

// A clock and timer queue that move only when told to. The static demo plays a tape on it, so
// the page can pause, change speed, skip ahead or jump to an offset while the replay provider
// and the bridge run their ordinary setTimeout logic. Browser-safe, no globals.

function createVirtualTime(start = 0) {
  let now = start;
  let seq = 0;
  const queue = [];

  function earliest() {
    let best = null;
    for (const item of queue) if (!best || item.at < best.at || (item.at === best.at && item.id < best.id)) best = item;
    return best;
  }

  const time = {
    now: () => now,
    setTimeout(fn, ms) {
      seq += 1;
      queue.push({ id: seq, at: now + Math.max(0, Number(ms) || 0), fn });
      return seq;
    },
    clearTimeout(id) {
      const at = queue.findIndex((item) => item.id === id);
      if (at >= 0) queue.splice(at, 1);
    },
    // Runs every timer due by `target`, in time order, with now() reading each timer's own
    // time while it runs; then leaves now() at target.
    advanceTo(target) {
      for (;;) {
        const next = earliest();
        if (!next || next.at > target) break;
        queue.splice(queue.indexOf(next), 1);
        if (next.at > now) now = next.at;
        next.fn();
      }
      if (target > now) now = target;
    },
    advance(ms) {
      time.advanceTo(now + Math.max(0, ms));
    },
    // Runs timers until none is left (a tape played to its end), at most `limit` of them.
    runAll(limit = 100000) {
      for (let n = 0; n < limit; n += 1) {
        const next = earliest();
        if (!next) return;
        time.advanceTo(next.at);
      }
      throw new Error(`virtual time: more than ${limit} timers; something reschedules forever`);
    },
    pending: () => queue.length,
  };
  return time;
}

module.exports = { createVirtualTime };
