#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// Measures latencies from a session tape (end of speech to the agent's first audio, and to the
// draft on screen) and writes them to docs/evidence/latency.json. Only a recorded session is
// written there: a synthetic tape's timings are invented, so they are printed and labelled but
// never saved as evidence.
//
//   npm run latency                              tapes/demo-session.jsonl, or the sample
//   npm run latency -- tapes/take-2.jsonl

const fs = require('fs');
const path = require('path');
const { parseTape, tapeLabel } = require('../src/voice/tape');
const { measureLatency } = require('../src/voice/latency');
const { defaultTape } = require('../src/server');

function main() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const file = arg ? path.resolve(arg) : defaultTape();
  const tape = parseTape(fs.readFileSync(file, 'utf8'));
  const result = { tape: path.basename(file), label: tapeLabel(tape.header), ...measureLatency(tape) };
  console.log(JSON.stringify(result, null, 2));
  if (tape.header.synthetic) {
    console.log('Synthetic tape: these timings are invented, so nothing was written to docs/evidence.');
    return;
  }
  const out = path.join(__dirname, '..', 'docs', 'evidence', 'latency.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

main();
