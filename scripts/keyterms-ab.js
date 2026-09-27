#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// Keyterms A/B on AssemblyAI Streaming Speech-to-Text v3: streams the same noisy recording of
// the owner's first line twice, in real time, once without and once with keyterms_prompt built
// from the owner's price list, suppliers and leads, and writes both transcripts to
// docs/evidence/keyterms-ab.json. Whatever the result is, it is what gets quoted; identical
// transcripts are reported as identical.
//
//   npm run clips                 once, for clips/u1.16k.wav
//   npm run keyterms-ab
//
// Two short sessions at the Universal-3.6 Pro streaming rate (well under one cent). Refuses
// before contacting AssemblyAI when ASSEMBLYAI_API_KEY is not set.

const fs = require('fs');
const path = require('path');
const { requireKey, MissingKeyError } = require('../src/env');
const { createStore } = require('../src/store');
const { keyterms } = require('../src/voice/bridge');
const { StreamingTranscriber, DEFAULTS } = require('../src/voice/streaming');
const { parseWav, assertFormat, frames, pace, silence } = require('../src/voice/wav');
const { LINES } = require('../src/voice/scenario');

const ROOT = path.join(__dirname, '..');
const RATE = 16000;
const FRAME_MS = 50;

async function transcribe(key, pcm, params) {
  const stt = new StreamingTranscriber({ apiKey: key, params: { ...DEFAULTS, sample_rate: RATE, ...params } });
  const begin = await stt.connect();
  // A second of silence after the line lets turn detection close the turn on its own.
  const list = [...frames(pcm, { sampleRate: RATE, frameMs: FRAME_MS }), ...Array.from({ length: 20 }, () => silence({ sampleRate: RATE, frameMs: FRAME_MS }))];
  await pace(list, (f) => stt.sendAudio(f), { frameMs: FRAME_MS });
  const termination = await stt.terminate();
  return {
    url: stt.describeUrl(),
    model: begin.configuration ? begin.configuration.model || null : null,
    sessionId: begin.id,
    transcript: stt.transcript(),
    turns: stt.finals.map((t) => t.transcript),
    errors: stt.errors,
    audioSeconds: termination ? termination.audio_duration_seconds : null,
  };
}

async function main() {
  let key;
  try {
    key = requireKey('keyterms-ab');
  } catch (err) {
    console.error(err.message);
    process.exitCode = err instanceof MissingKeyError ? 2 : 1;
    return;
  }
  const clip = path.join(ROOT, 'clips', 'u1.16k.wav');
  if (!fs.existsSync(clip)) {
    console.error('clips/u1.16k.wav is missing; run npm run clips first.');
    process.exitCode = 1;
    return;
  }
  const wav = parseWav(fs.readFileSync(clip));
  assertFormat(wav, { sampleRate: RATE, channels: 1 });
  const terms = keyterms(createStore().state);

  console.log('A: without keyterms ...');
  const without = await transcribe(key, wav.data, {});
  console.log(`   "${without.transcript}"`);
  console.log(`B: with ${terms.length} keyterms from the price list ...`);
  const withTerms = await transcribe(key, wav.data, { keyterms_prompt: terms });
  console.log(`   "${withTerms.transcript}"`);

  const out = {
    recordedAt: new Date().toISOString(),
    clip: 'clips/u1.16k.wav (synthesized speech with added brown noise)',
    spoken: LINES.U1,
    keyterms: terms,
    withoutKeyterms: without,
    withKeyterms: withTerms,
    identical: without.transcript === withTerms.transcript,
  };
  const file = path.join(ROOT, 'docs', 'evidence', 'keyterms-ab.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${out.identical ? 'identical transcripts' : 'the transcripts differ'}; wrote ${path.relative(process.cwd(), file)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
