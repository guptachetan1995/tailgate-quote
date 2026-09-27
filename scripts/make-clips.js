#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// Makes the scripted demo lines as audio clips: the owner's four lines and the customer's
// "send it over", as 24 kHz PCM16 mono WAVs (what the Voice Agent API takes) with brown site
// noise mixed in, a 16 kHz copy of each (what Streaming Speech-to-Text takes), and a manifest.
// These are synthesized voices, never a real person's, and are labelled as such wherever they
// are played.
//
//   npm run clips                                  macOS `say` voices, into clips/ (no key)
//   npm run clips -- --voices assemblyai           AssemblyAI's own voices (george for the owner,
//                                                  jane for the customer; needs the key, a few
//                                                  cents of Voice Agent time), `say` as fallback
//   npm run clips -- --out /tmp/clips --no-noise
//   npm run clips -- --m4a                         also tapes/clips/<id>.m4a for the static demo
//
// Needs macOS `say` and ffmpeg.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { LINES } = require('../src/voice/scenario');
const { parseWav, assertFormat, encodeWav, durationMs } = require('../src/voice/wav');
const { requireKey, MissingKeyError } = require('../src/env');
const { AssemblyAIVoiceProvider } = require('../src/voice/assemblyai');
const { synthesizeLine } = require('../src/voice/synthesize');

const ROOT = path.join(__dirname, '..');
const RATE = 24000;
const RATE_STT = 16000;

const SCRIPT = [
  { id: 'u1', speaker: 'owner', text: LINES.U1 },
  { id: 'u1b', speaker: 'owner', text: LINES.U1B },
  { id: 'u2', speaker: 'owner', text: LINES.U2 },
  { id: 'u3', speaker: 'owner', text: LINES.U3 },
  { id: 'u4', speaker: 'customer', text: LINES.U4 },
];

function parseArgs(argv) {
  const opts = {
    out: path.join(ROOT, 'clips'),
    voices: 'say',
    noise: true,
    m4a: false,
    say: { owner: 'Reed (English (US))', customer: 'Samantha' },
    assemblyai: { owner: 'george', customer: 'jane' },
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      i += 1;
      if (argv[i] === undefined) throw new Error(`${a} needs a value`);
      return argv[i];
    };
    if (a === '--out') opts.out = path.resolve(next());
    else if (a === '--voices') opts.voices = next();
    else if (a === '--no-noise') opts.noise = false;
    else if (a === '--m4a') opts.m4a = true;
    else if (a === '--owner-voice') opts.say.owner = next();
    else if (a === '--customer-voice') opts.say.customer = next();
    else throw new Error(`unknown option ${a}`);
  }
  if (!['say', 'assemblyai'].includes(opts.voices)) throw new Error('--voices takes say or assemblyai');
  return opts;
}

const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

// Words per minute, per speaker: the default owner voice reads slowly at its own default.
const SAY_RATE = { owner: 215, customer: 185 };

function sayTo(file, text, voice, speaker) {
  execFileSync('say', ['-v', voice, '-r', String(SAY_RATE[speaker]), '-o', file, '--file-format=WAVE', `--data-format=LEI16@${RATE}`, text]);
}

// Site noise: seeded brown noise under the voice (about 15 dB below it), a short lead-in and
// tail, so the recording is not clean studio audio. Deterministic for a given input.
function finish(clean, out, { noise }) {
  const common = ['-ac', '1', '-ar', String(RATE), '-c:a', 'pcm_s16le', '-bitexact', '-map_metadata', '-1'];
  if (!noise) return ffmpeg(['-i', clean, '-af', 'adelay=250:all=1,apad=pad_dur=0.4', ...common, out]);
  return ffmpeg([
    '-i',
    clean,
    '-f',
    'lavfi',
    '-i',
    `anoisesrc=color=brown:amplitude=0.03:sample_rate=${RATE}:seed=7`,
    '-filter_complex',
    '[0:a]adelay=250:all=1,apad=pad_dur=0.4[v];[v][1:a]amix=inputs=2:duration=first:normalize=0[m]',
    '-map',
    '[m]',
    ...common,
    out,
  ]);
}

// One throwaway Voice Agent session per line, so each clip is exactly the greeting it spoke.
function assemblyaiVoice(key, line, voice) {
  const provider = new AssemblyAIVoiceProvider({ apiKey: key, maxSessionSeconds: 60 });
  return synthesizeLine({ provider, text: line.text, voice });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const key = opts.voices === 'assemblyai' ? requireKey('npm run clips -- --voices assemblyai') : null;
  fs.mkdirSync(opts.out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tailgate-clips-'));
  const manifest = { generatedBy: 'scripts/make-clips.js', synthesized: true, sampleRate: RATE, noise: opts.noise, clips: [] };
  try {
    for (const line of SCRIPT) {
      const clean = path.join(tmp, `${line.id}.clean.wav`);
      let source = 'say';
      let voice = opts.say[line.speaker];
      if (opts.voices === 'assemblyai') {
        const got = await assemblyaiVoice(key, line, opts.assemblyai[line.speaker]);
        if (got.matches) {
          fs.writeFileSync(clean, encodeWav(got.pcm, { sampleRate: RATE }));
          source = 'assemblyai';
          voice = opts.assemblyai[line.speaker];
        } else {
          console.log(`${line.id}: the AssemblyAI voice said "${got.transcript}" (${got.outcome}${got.error ? `, ${got.error}` : ''}); using say instead`);
        }
      }
      if (source === 'say') sayTo(clean, line.text, voice, line.speaker);

      const file = `${line.id}.wav`;
      const file16k = `${line.id}.16k.wav`;
      finish(clean, path.join(opts.out, file), opts);
      ffmpeg(['-i', path.join(opts.out, file), '-ac', '1', '-ar', String(RATE_STT), '-c:a', 'pcm_s16le', '-bitexact', '-map_metadata', '-1', path.join(opts.out, file16k)]);

      const wav = parseWav(fs.readFileSync(path.join(opts.out, file)));
      assertFormat(wav, { sampleRate: RATE, channels: 1 });
      assertFormat(parseWav(fs.readFileSync(path.join(opts.out, file16k))), { sampleRate: RATE_STT, channels: 1 });
      const entry = { id: line.id, speaker: line.speaker, text: line.text, source, voice, file, file16k, durationMs: durationMs(wav.data, RATE) };
      manifest.clips.push(entry);
      console.log(`${line.id} (${line.speaker}, ${source} voice ${voice}): ${(entry.durationMs / 1000).toFixed(2)} s`);

      if (opts.m4a) {
        const dir = path.join(ROOT, 'tapes', 'clips');
        fs.mkdirSync(dir, { recursive: true });
        ffmpeg(['-i', path.join(opts.out, file), '-c:a', 'aac', '-b:a', '64k', '-map_metadata', '-1', path.join(dir, `${line.id}.m4a`)]);
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(opts.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${manifest.clips.length} clips and manifest.json to ${opts.out}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = err instanceof MissingKeyError ? 2 : 1;
  });
}

module.exports = { SCRIPT, parseArgs };
