#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// Replays a session tape in the terminal: every recorded server event goes through the real
// bridge and the real invoke() again, at the recorded pace (or --speed N times faster), and
// every tool result is compared with the one sent during the recording. No key, no network.
//
//   npm run replay                                   the recorded session, or the sample
//   npm run replay -- tapes/demo-session.jsonl --speed 4
//
// Exits 1 if any tool result differs from the recording (drift).

const fs = require('fs');
const path = require('path');
const seed = require('../fake-data/seed.json');
const { createStore } = require('../src/store');
const { createInvoke } = require('../src/invoke');
const { createBridge } = require('../src/voice/bridge');
const { ReplayVoiceProvider } = require('../src/voice/replay');
const { parseTape, tapeLabel, fingerprint } = require('../src/voice/tape');
const { defaultTape } = require('../src/server');
const { describe, red, green, dim, bold, who } = require('./print');

function args(argv) {
  const speedAt = argv.indexOf('--speed');
  const speed = speedAt >= 0 ? Number(argv[speedAt + 1]) : 1;
  if (!(speed > 0)) throw new Error('--speed takes a positive number (Infinity replays instantly)');
  const file = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--speed');
  return { speed, file: file ? path.resolve(file) : defaultTape() };
}

async function main() {
  const { speed, file } = args(process.argv.slice(2));
  const tape = parseTape(fs.readFileSync(file, 'utf8'));
  const provider = new ReplayVoiceProvider({ tape, speed });
  const store = createStore({ now: provider.now });
  const invoke = createInvoke(store);
  // The bridge waits on the tape's timeline, scaled like the tape, so every speed gives the
  // same results.
  const bridge = createBridge({ provider, invoke, store, timers: provider.bridgeTimers });

  console.log(bold(`Tailgate Quote: ${tapeLabel(tape.header)}`));
  console.log(dim(`${path.relative(process.cwd(), file)}, ${tape.lines.length} events, ${(provider.durationMs / 1000).toFixed(1)} s at speed 1; playing at speed ${speed}`));
  if (tape.header.seedHash && tape.header.seedHash !== fingerprint(seed)) {
    console.log(red('The seed data has changed since this tape was recorded; results may differ.'));
  }

  store.subscribe((entry) => console.log(`${who(entry.actor)} ${describe(entry)}`));
  bridge.on('partial', ({ text }) => console.log(`${who('heard')} ${dim(`... ${text}`)}`));
  bridge.on('agent', ({ text, interrupted }) => console.log(`${who('says')} ${dim(`agent: "${text}"${interrupted ? ' (interrupted)' : ''}`)}`));
  bridge.on('result', (r) => {
    if (r.status !== 'sent') console.log(`${who('wire')} ${dim(`tool.result ${r.call_id} ${r.status}`)}`);
  });

  await bridge.start();
  await provider.done;
  await bridge.stop();

  const drift = provider.drift();
  const state = store.snapshot();
  console.log(`\n${bold('== result')}`);
  for (const d of state.drafts) console.log(`  ${d.id} ${d.kind.replace('_', ' ')}: ${d.status}${d.total !== undefined ? `, total $${d.total}` : ''}`);
  console.log(`  outbox: ${state.outbox.length} (the tape can draft; only an owner tap sends)`);
  if (drift.length === 0) {
    console.log(green(`  drift: none; every tool result matches the recording`));
    return;
  }
  for (const d of drift) console.log(red(`  drift: ${d.kind} ${d.call_id}`));
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
