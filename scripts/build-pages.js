#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// Builds the static live demo: the dashboard (public/) plus one bundle of the real code
// (src/browser-entry.js: api.js, invoke.js, the store, the bridge, the replay provider and the
// session hub) with the session tape inside it. The page replays that tape in the browser
// through the real approval gate. No API key and no network: a static page can never mint an
// AssemblyAI token, so it never talks to AssemblyAI.
//
//   npm run build:pages                  -> dist/pages
//   npm run build:pages -- <outDir>
//
// The output is byte-deterministic: esbuild runs from a fixed working directory with relative
// paths, and the build hash is a sha256 of everything written.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');
const { defaultTape, audioSidecar } = require('../src/server');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const MARKER = '<!-- pages:bundle -->';
const BUNDLE = 'tailgate.bundle.js';
// The agent's recorded voice (the tape's sidecar, raw PCM16 mono 24 kHz), shipped beside the
// bundle when the tape has one; the page fetches it and plays it in time with the replay.
const AUDIO = 'agent-voice.pcm';

const occurrences = (text, needle) => text.split(needle).length - 1;

function checkTemplate(template, assets) {
  if (occurrences(template, MARKER) !== 1) throw new Error(`public/index.html must contain exactly one ${MARKER} marker`);
  if (occurrences(template, '</head>') !== 1) throw new Error('public/index.html must contain exactly one </head>');
  for (const asset of assets) {
    if (occurrences(template, `src="${asset}"`) > 1) throw new Error(`public/index.html references ${asset} more than once`);
  }
  if (/\s(src|href)="\//.test(template)) throw new Error('public/index.html has a root-relative link; GitHub Pages serves the demo under a sub-path, so use relative links');
}

async function bundle(tapeRel, audioFile) {
  const result = await esbuild.build({
    stdin: {
      contents: [
        "const entry = require('./src/browser-entry.js');",
        `const tapeText = require(${JSON.stringify(`./${tapeRel}`)});`,
        `const audioFile = ${JSON.stringify(audioFile)};`,
        'module.exports = { tapeText, audioFile, createBackend: () => entry.createStaticBackend({ tapeText, hasAudio: Boolean(audioFile) }) };',
      ].join('\n'),
      resolveDir: ROOT,
      sourcefile: 'pages-entry.js',
      loader: 'js',
    },
    absWorkingDir: ROOT,
    bundle: true,
    format: 'iife',
    globalName: 'TailgateStatic',
    platform: 'browser',
    target: ['es2020'],
    loader: { '.jsonl': 'text' },
    minify: false,
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

async function build(outDir = path.join(ROOT, 'dist', 'pages'), { tape = defaultTape(ROOT), audio = audioSidecar(path.resolve(tape)) } = {}) {
  const template = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const assets = fs
    .readdirSync(PUBLIC)
    .filter((f) => f !== 'index.html' && !f.startsWith('.'))
    .sort();
  checkTemplate(template, assets);
  const tapeRel = path.relative(ROOT, path.resolve(tape)).split(path.sep).join('/');
  if (tapeRel.startsWith('..')) throw new Error(`the tape must live inside the entry: ${tape}`);

  const audioBytes = audio ? fs.readFileSync(audio) : null;
  const js = await bundle(tapeRel, audioBytes ? AUDIO : null);
  const assetText = assets.map((name) => [name, fs.readFileSync(path.join(PUBLIC, name))]);
  const hash = crypto.createHash('sha256');
  hash.update(template).update(js);
  for (const [name, bytes] of assetText) hash.update(name).update(bytes);
  if (audioBytes) hash.update(AUDIO).update(audioBytes);
  const version = hash.digest('hex').slice(0, 12);

  let html = template
    .replace(MARKER, `<script src="${BUNDLE}?v=${version}"></script>`)
    .replace('</head>', `<meta name="tailgate-build" content="${version}">\n</head>`);
  for (const asset of assets) html = html.replace(`src="${asset}"`, `src="${asset}?v=${version}"`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  fs.writeFileSync(path.join(outDir, BUNDLE), js);
  for (const [name, bytes] of assetText) fs.writeFileSync(path.join(outDir, name), bytes);
  if (audioBytes) fs.writeFileSync(path.join(outDir, AUDIO), audioBytes);
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  const files = ['index.html', BUNDLE, ...assets, ...(audioBytes ? [AUDIO] : []), '.nojekyll'];
  return { outDir, version, tape: tapeRel, audio: audioBytes ? AUDIO : null, files };
}

if (require.main === module) {
  const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'pages'));
  build(out)
    .then((r) => {
      console.log(`Static demo built into ${r.outDir} (build ${r.version}, tape ${r.tape}, ${r.audio ? "with the agent's recorded voice" : 'silent: the tape has no agent-voice sidecar'}):`);
      for (const f of r.files) console.log(`  ${f}`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
}

module.exports = { build, BUNDLE, MARKER, AUDIO };
