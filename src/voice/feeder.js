'use strict';

// The recording feeder: plays scripted clips into a live Voice Agent session the way a
// microphone would. One wall-clock-paced loop sends a frame every frameMs from the moment it
// starts (after session.ready) until the plan is done: the next frame of a clip while one is
// playing, zero-filled silence otherwise. Turn detection therefore always hears continuous
// audio, and nothing reaches the API faster than real time.
//
// Each step of the plan is { id, clip } (PCM16 mono bytes at the session's rate) or
// { id, text } (typed, for the cheap text-only smoke run). A step starts when its gate opens:
//
//   'reply' (default)  the agent has answered the previous step (a reply.done arrived after
//                      it ended; the first step waits for the greeting's), no agent reply is in
//                      flight, no tool result is held or waiting, and no server event has
//                      arrived for quietMs;
//   'barge-in'         delayMs after the first reply.audio that follows a successful result of
//                      `afterTool`: the owner talks over the agent's read-back on purpose.
//
// A step with onlyIf({ lastAgentText }) is skipped unless it holds, so the answer to the size
// question is fed only if the agent asked it. A gate still shut after maxWaitMs opens anyway
// and the log says so; the take can be judged from the tape.

const { frames: cutFrames, silence } = require('./wav');

const toBase64 = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');

function createFeeder({
  bridge,
  plan,
  sampleRate = 24000,
  frameMs = 50,
  quietMs = 1500,
  maxWaitMs = 30000,
  now = () => Date.now(),
  timers = null,
  log = () => {},
}) {
  const t = timers || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };
  const quiet = silence({ sampleRate, frameMs });
  const steps = plan.map((s) => ({ ...s, frames: s.clip ? cutFrames(s.clip, { sampleRate, frameMs }) : null }));

  let index = 0;
  let playing = null;
  let lastEventAt = now();
  let waitingSince = now();
  let answered = false;
  const armed = new Set();
  const firstAudioAfter = new Map();
  let timer = null;
  let running = false;
  let finished = false;
  let framesSent = 0;
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const offWire = bridge.on('wire', ({ dir, event }) => {
    if (dir !== 'in') return;
    lastEventAt = now();
    if (event.type === 'reply.done') answered = true;
    if (event.type === 'reply.audio') {
      for (const tool of armed) firstAudioAfter.set(tool, now());
      armed.clear();
    }
  });
  const offResult = bridge.on('result', (r) => {
    if (r.status === 'sent' && !r.is_error) armed.add(r.name);
  });

  function settled() {
    const s = bridge.status();
    return answered && !s.replyInFlight && s.held === 0 && s.waiting === 0 && now() - lastEventAt >= quietMs;
  }

  function gateOpen(step) {
    if (now() - waitingSince >= maxWaitMs) {
      log({ type: 'gate.forced', step: step ? step.id : 'end', waitedMs: now() - waitingSince });
      return true;
    }
    if (step && step.when === 'barge-in') {
      const at = firstAudioAfter.get(step.afterTool);
      if (at === undefined) return false;
      if (now() >= at + (step.delayMs || 1500)) {
        if (!bridge.status().replyInFlight) log({ type: 'barge-in.late', step: step.id, note: 'the reply had already finished; this is not an interruption' });
        return true;
      }
      return false;
    }
    return settled();
  }

  function finish() {
    if (finished) return;
    finished = true;
    running = false;
    if (timer !== null) t.clearTimeout(timer);
    timer = null;
    offWire();
    offResult();
    log({ type: 'plan.done', framesSent });
    resolveDone({ framesSent });
  }

  function startSteps() {
    while (!playing && running) {
      const step = steps[index];
      if (!step) {
        if (gateOpen(null)) finish();
        return;
      }
      if (!gateOpen(step)) return;
      index += 1;
      if (step.onlyIf && !step.onlyIf({ lastAgentText: bridge.status().lastAgentText })) {
        log({ type: 'step.skipped', step: step.id, lastAgentText: bridge.status().lastAgentText });
        continue;
      }
      log({ type: 'step.start', step: step.id, kind: step.clip ? 'clip' : 'text' });
      if (step.text !== undefined) {
        bridge.sendText(step.text);
        stepEnded(step);
      } else {
        playing = { step, i: 0 };
      }
    }
  }

  function stepEnded(step) {
    log({ type: 'step.end', step: step.id });
    answered = false;
    waitingSince = now();
    lastEventAt = now();
    firstAudioAfter.clear();
  }

  function nextFrame() {
    if (!playing) return quiet;
    const frame = playing.step.frames[playing.i];
    playing.i += 1;
    if (playing.i >= playing.step.frames.length) {
      const { step } = playing;
      playing = null;
      stepEnded(step);
    }
    return frame;
  }

  function loop(start) {
    const tick = () => {
      timer = null;
      while (running) {
        const wait = start + framesSent * frameMs - now();
        if (wait > 0) {
          timer = t.setTimeout(tick, wait);
          return;
        }
        startSteps();
        if (!running) return;
        bridge.sendAudio(toBase64(nextFrame()));
        framesSent += 1;
      }
    };
    tick();
  }

  return {
    // Call after session.ready: audio sent before it is dropped by the bridge.
    start() {
      if (running) throw new Error('the feeder runs once');
      // Stopped before it started (the socket closed right after session.ready): nothing to play.
      if (finished) return done;
      running = true;
      waitingSince = now();
      lastEventAt = now();
      loop(now());
      return done;
    },
    stop() {
      finish();
      return done;
    },
    done,
    status: () => ({ step: steps[index] ? steps[index].id : null, playing: playing ? playing.step.id : null, framesSent, finished }),
  };
}

module.exports = { createFeeder };
