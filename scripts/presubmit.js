#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// The check before the lablab form is filled: everything the submission copy claims must exist.
// ./verify.sh passes on a clean clone at any time; this passes only once a real session has
// been recorded and the media rendered from it.
//
//   npm run presubmit
//
// It checks that:
//   - tapes/demo-session.jsonl is a recorded AssemblyAI session, not the scripted sample;
//   - its agent-voice sidecar exists and covers every reply.audio offset (the copy says the
//     demo plays the agent's own voice);
//   - it replays through the current gate with no drift;
//   - docs/evidence/latency.json was measured from that same session;
//   - media/ holds a --final render from that session (media/media.json);
//   - README.md names the recorded session, so its status is not the pre-recording one;
//   - docs/submission.md makes none of the claims that were dropped because they were never
//     built.
// Exits 1 and lists every gap.

const fs = require('fs');
const path = require('path');
const { parseTape } = require('../src/voice/tape');
const { ReplayVoiceProvider } = require('../src/voice/replay');
const { createStore } = require('../src/store');
const { createInvoke } = require('../src/invoke');
const { createBridge } = require('../src/voice/bridge');

// Claims that were cut from the build, so the copy may not make them.
const RETIRED_CLAIMS = [
  [/playable/i, 'a playable receipt (receipts are highlighted text; there is no receipt audio)'],
  [/clip of a local microphone session/i, 'a local microphone clip in the demo (none is embedded)'],
];

async function check(root) {
  const gaps = [];
  const oks = [];
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const exists = (rel) => fs.existsSync(path.join(root, rel));

  const tapeRel = 'tapes/demo-session.jsonl';
  let tape = null;
  if (!exists(tapeRel)) gaps.push(`${tapeRel} is missing: record a session (npm run record-session) and copy the best take there`);
  else {
    tape = parseTape(read(tapeRel));
    if (tape.header.synthetic) gaps.push(`${tapeRel} is marked synthetic; the demo must replay a recorded session`);
    else if (!/^sess_/.test(String(tape.header.sessionId))) gaps.push(`${tapeRel} has no AssemblyAI session id in its header`);
    else oks.push(`${tapeRel}: recorded session ${tape.header.sessionId}`);
  }

  if (tape && !tape.header.synthetic) {
    const sidecarRel = 'tapes/raw/demo-session.agent.pcm';
    const need = Math.max(0, ...tape.lines.filter((l) => l.event.type === 'reply.audio').map((l) => l.event.audio_offset + l.event.audio_bytes));
    if (!exists(sidecarRel)) gaps.push(`${sidecarRel} is missing: the demo would be silent`);
    else if (fs.statSync(path.join(root, sidecarRel)).size < need) gaps.push(`${sidecarRel} is shorter than the tape's reply.audio offsets (${need} bytes)`);
    else oks.push(`${sidecarRel}: the agent's recorded voice, ${need} bytes`);

    const provider = new ReplayVoiceProvider({ tape, speed: Infinity });
    const store = createStore({ now: provider.now });
    const bridge = createBridge({ provider, invoke: createInvoke(store), store, timers: provider.bridgeTimers });
    await bridge.start();
    await provider.done;
    await bridge.stop();
    const drift = provider.drift();
    if (drift.length) gaps.push(`${tapeRel} drifts from the current gate: ${drift.map((d) => `${d.kind} ${d.call_id}`).join(', ')}`);
    else oks.push(`${tapeRel}: replays with no drift`);

    const latencyRel = 'docs/evidence/latency.json';
    const latency = exists(latencyRel) ? JSON.parse(read(latencyRel)) : null;
    if (!latency) gaps.push(`${latencyRel} is missing: npm run latency -- ${tapeRel}`);
    else if (latency.sessionId !== tape.header.sessionId) gaps.push(`${latencyRel} is from ${latency.sessionId}, not ${tape.header.sessionId}`);
    else if (!latency.endOfSpeechToDraft) gaps.push(`${latencyRel} measured no draft latency`);
    else oks.push(`${latencyRel}: measured on ${latency.sessionId}`);

    const mediaRel = 'media/media.json';
    const media = exists(mediaRel) ? JSON.parse(read(mediaRel)) : null;
    if (!media || !media.final) gaps.push('media/ has no final render: npm run media -- --playwright <path> --final');
    else if (media.sessionId !== tape.header.sessionId) gaps.push(`media/ was rendered from ${media.sessionId}, not ${tape.header.sessionId}`);
    else oks.push(`media/: final cover and deck from ${media.sessionId}`);

    if (!read('README.md').includes(tape.header.sessionId)) gaps.push(`README.md does not name the recorded session ${tape.header.sessionId}; update its status`);
    else oks.push('README.md names the recorded session');
  }

  const copy = read('docs/submission.md');
  for (const [re, what] of RETIRED_CLAIMS) if (re.test(copy)) gaps.push(`docs/submission.md claims ${what}`);
  if (!RETIRED_CLAIMS.some(([re]) => re.test(copy))) oks.push('docs/submission.md makes no retired claim');
  return { gaps, oks };
}

async function main() {
  const at = process.argv.indexOf('--root');
  const root = at >= 0 ? path.resolve(process.argv[at + 1]) : path.join(__dirname, '..');
  const { gaps, oks } = await check(root);
  for (const ok of oks) console.log(`  ok: ${ok}`);
  for (const gap of gaps) console.log(`  MISSING: ${gap}`);
  if (gaps.length) {
    console.log(`Not ready to submit: ${gaps.length} gap(s).`);
    process.exitCode = 1;
    return;
  }
  console.log('Ready to submit: everything the copy claims exists.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = { check, RETIRED_CLAIMS };
