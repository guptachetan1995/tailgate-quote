#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// Records one live AssemblyAI Voice Agent session to a tape (billed to the key's free credits,
// about $0.075 a minute):
//
//   npm run clips                                   once: the scripted lines as 24 kHz WAVs
//   npm run record-session -- --smoke               cheap first run: the lines as typed text
//   npm run record-session                          the real take: the clips as mic audio
//   npm run record-session -- --name take-2 --force
//
// The clips are streamed as a microphone would stream them (50 ms frames, wall-clock paced,
// silence in between) through the real bridge and invoke(); every event in both directions is
// written to tapes/<name>.jsonl (scrubbed of tokens as it is written), the agent's voice to
// tapes/raw/<name>.agent.pcm (and tapes/<name>.agent.m4a), and the session's own artifacts
// from GET /v1/sessions/{id} to docs/evidence/session-<name>.json. Replay the result with
// `npm run replay -- tapes/<name>.jsonl`.
//
// Refuses before contacting AssemblyAI when ASSEMBLYAI_API_KEY is not set. The key is read
// from .env on this machine and never printed; the session always ends with session.end.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const seed = require('../fake-data/seed.json');
const { requireKey, MissingKeyError } = require('../src/env');
const { createStore } = require('../src/store');
const { createInvoke } = require('../src/invoke');
const { AssemblyAIVoiceProvider } = require('../src/voice/assemblyai');
const { createRecorder } = require('../src/voice/recorder');
const { createTapeWriter, createTapeClock, tapeHeader, parseTape, scrub, fingerprint } = require('../src/voice/tape');
const { parseWav, assertFormat } = require('../src/voice/wav');
const { LINES } = require('../src/voice/scenario');
const { EVIDENCE_CHECKED } = require('../src/voice/bridge');
const { measureLatency, callOrder } = require('../src/voice/latency');
const { describe, red, green, dim, bold, who } = require('./print');

const ROOT = path.join(__dirname, '..');
const SAMPLE_RATE = 24000;
const COST_PER_MINUTE = 0.075;
// Did the agent's last line ask which valve size? Only then is the answer ("Three-quarter.") fed.
const ASKED_SIZE = /\b(half|three[- ]quarter|3\/4|1\/2|size|which)\b/i;

function parseArgs(argv) {
  const opts = { smoke: false, force: false, artifacts: true, name: null, clips: path.join(ROOT, 'clips'), maxSeconds: 240, bargeInMs: 1500, quietMs: 1500 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      i += 1;
      if (argv[i] === undefined) throw new Error(`${a} needs a value`);
      return argv[i];
    };
    if (a === '--smoke') opts.smoke = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--no-artifacts') opts.artifacts = false;
    else if (a === '--name') opts.name = next();
    else if (a === '--clips') opts.clips = path.resolve(next());
    else if (a === '--max-seconds') opts.maxSeconds = Number(next());
    else if (a === '--barge-in-ms') opts.bargeInMs = Number(next());
    else if (a === '--quiet-ms') opts.quietMs = Number(next());
    else throw new Error(`unknown option ${a}`);
  }
  opts.name = opts.name || (opts.smoke ? 'smoke-session' : 'demo-session');
  if (!/^[a-z0-9-]+$/.test(opts.name)) throw new Error('--name takes lower-case letters, digits and dashes');
  if (!(opts.maxSeconds >= 60 && opts.maxSeconds <= 900)) throw new Error('--max-seconds takes 60 to 900');
  return opts;
}

function loadClips(dir) {
  const manifestFile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error(`${path.relative(process.cwd(), manifestFile)} is missing; run npm run clips first.`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const clips = {};
  for (const entry of manifest.clips) {
    const wav = parseWav(fs.readFileSync(path.join(dir, entry.file)));
    assertFormat(wav, { sampleRate: SAMPLE_RATE, channels: 1 });
    clips[entry.id] = wav.data;
  }
  return clips;
}

function buildPlan({ smoke, clips, bargeInMs }) {
  const askedSize = ({ lastAgentText }) => ASKED_SIZE.test(lastAgentText || '');
  if (smoke) {
    return [
      { id: 'u1', text: LINES.U1 },
      { id: 'u1b', text: LINES.U1B, onlyIf: askedSize },
      { id: 'u2', text: LINES.U2 },
      { id: 'u3', text: LINES.U3 },
      { id: 'u4', text: LINES.U4 },
    ];
  }
  const need = (id) => {
    if (!clips[id]) throw new Error(`clip ${id} is missing from the clips manifest; run npm run clips`);
    return clips[id];
  };
  return [
    { id: 'u1', clip: need('u1') },
    { id: 'u1b', clip: need('u1b'), onlyIf: askedSize },
    { id: 'u2', clip: need('u2'), when: 'barge-in', afterTool: 'draft_quote', delayMs: bargeInMs },
    { id: 'u3', clip: need('u3') },
    { id: 'u4', clip: need('u4') },
  ];
}

// Session artifacts can take a moment to appear after the session ends.
async function fetchArtifacts(live, sessionId) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await live.fetchSession(sessionId);
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw last;
}

// Evidence keeps the timeline and metadata, never a link to the audio (signed or not).
function evidenceOf(value) {
  if (Array.isArray(value)) return value.map(evidenceOf);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !/url/i.test(k))
        .map(([k, v]) => [k, evidenceOf(v)]),
    );
  }
  return value;
}

async function main() {
  let opts;
  let key;
  try {
    opts = parseArgs(process.argv.slice(2));
    key = requireKey('record-session');
  } catch (err) {
    console.error(err.message);
    process.exitCode = err instanceof MissingKeyError ? 2 : 1;
    return;
  }

  const tapeFile = path.join(ROOT, 'tapes', `${opts.name}.jsonl`);
  const rawFile = path.join(ROOT, 'tapes', 'raw', `${opts.name}.agent.pcm`);
  const m4aFile = path.join(ROOT, 'tapes', `${opts.name}.agent.m4a`);
  const evidenceFile = path.join(ROOT, 'docs', 'evidence', `session-${opts.name}.json`);
  if (fs.existsSync(tapeFile) && !opts.force) {
    console.error(`${path.relative(process.cwd(), tapeFile)} exists; pass --force to replace it, or --name for a new take.`);
    process.exitCode = 1;
    return;
  }
  const clips = opts.smoke ? {} : loadClips(opts.clips);
  const plan = buildPlan({ smoke: opts.smoke, clips, bargeInMs: opts.bargeInMs });

  fs.mkdirSync(path.dirname(rawFile), { recursive: true });
  fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });
  const recordedAt = new Date().toISOString();
  const header = { recordedAt, seedHash: fingerprint(seed), sessionId: null, model: null, synthetic: false, label: null };
  const clock = createTapeClock(recordedAt);
  const store = createStore({ now: clock.now });
  const invoke = createInvoke(store);
  const lines = [];
  const raw = fs.openSync(rawFile, 'w');
  const writer = createTapeWriter({
    write: (line) => lines.push(line),
    writeAudio: (b64) => fs.writeSync(raw, Buffer.from(b64, 'base64')),
    header,
  });
  const t0 = performance.now();
  const elapsed = () => Math.round(performance.now() - t0);
  const live = new AssemblyAIVoiceProvider({ apiKey: key, maxSessionSeconds: opts.maxSeconds + 60 });

  const recorder = createRecorder({
    provider: live,
    store,
    invoke,
    writer,
    elapsed,
    clock,
    plan,
    sampleRate: SAMPLE_RATE,
    feeder: { quietMs: opts.quietMs },
    maxSessionMs: opts.maxSeconds * 1000,
    log: (e) => console.log(`${who('rec')} ${dim(JSON.stringify(e))}`),
  });
  store.subscribe((entry) => console.log(`${who(entry.actor)} ${describe(entry)}`));
  let lastPartial = '';
  recorder.bridge.on('partial', ({ text }) => {
    if (text !== lastPartial) console.log(`${who('heard')} ${dim(`... ${text}`)}`);
    lastPartial = text;
  });
  recorder.bridge.on('agent', ({ text, interrupted }) => console.log(`${who('says')} agent: "${text}"${interrupted ? red(' (interrupted)') : ''}`));
  recorder.bridge.on('result', (r) => {
    if (r.status !== 'sent') console.log(`${who('wire')} ${dim(`tool.result ${r.call_id} ${r.status}`)}`);
  });

  let interrupts = 0;
  process.on('SIGINT', () => {
    interrupts += 1;
    if (interrupts > 1) process.exit(130);
    console.log(red('\nStopping: ending the session (session.end) and writing the tape. Ctrl-C again to quit at once.'));
    recorder.stop();
  });

  console.log(bold(`Recording ${opts.smoke ? 'a text-only smoke session' : 'a live session from the clips'} as ${opts.name} (at most ${opts.maxSeconds} s)`));
  let result;
  try {
    result = await recorder.run();
  } finally {
    fs.closeSync(raw);
  }

  lines[0] = JSON.stringify(tapeHeader({ ...header, sessionId: result.sessionId, model: result.model }));
  fs.writeFileSync(tapeFile, `${lines.join('\n')}\n`);
  const tape = parseTape(fs.readFileSync(tapeFile, 'utf8'));
  if (fs.statSync(rawFile).size > 0) {
    try {
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', rawFile, '-c:a', 'aac', '-b:a', '64k', m4aFile]);
    } catch (err) {
      console.log(red(`could not encode the agent's voice to m4a: ${err.message}`));
    }
  }

  let artifactsAuth = null;
  if (opts.artifacts && result.sessionId) {
    try {
      const { auth, body } = await fetchArtifacts(live, result.sessionId);
      artifactsAuth = auth;
      const evidence = scrub(evidenceOf({ sessionId: result.sessionId, recordedAt, tape: path.relative(ROOT, tapeFile), sessionsAuth: auth, session: body }));
      fs.writeFileSync(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`);
    } catch (err) {
      console.log(red(`could not read the session artifacts: ${err.message}`));
    }
  }

  const seconds = result.ended ? result.ended.session_duration_seconds : Math.round(elapsed() / 1000);
  const latency = measureLatency(tape);
  const log = store.activityLog();
  const hold = [...EVIDENCE_CHECKED].map((n) => callOrder(tape, n)).find(Boolean);
  const interactive = ['search_catalog', 'get_board'].map((n) => callOrder(tape, n)).find(Boolean);

  console.log(`\n${bold('== session')}`);
  console.log(`  session_id: ${result.sessionId || 'none'}${result.model ? `, model: ${result.model}` : ''}`);
  console.log(`  ${result.ok ? green('ended cleanly with session.end') : red('did not end cleanly')}${result.errors.length ? red(`, ${result.errors.length} session error(s)`) : ''}`);
  console.log(`  duration: ${seconds} s, about $${((seconds / 60) * COST_PER_MINUTE).toFixed(2)} of Voice Agent time`);
  console.log(`  tape: ${path.relative(process.cwd(), tapeFile)} (${tape.lines.length} events), agent voice: ${path.relative(process.cwd(), rawFile)}`);
  console.log(`  artifacts: ${artifactsAuth ? `${path.relative(process.cwd(), evidenceFile)} (GET /v1/sessions/{id} worked with ${artifactsAuth})` : 'not saved'}`);
  console.log(`  tool calls: ${log.filter((e) => e.actor === 'agent').length} (${log.filter((e) => e.actor === 'agent' && e.outcome === 'refused').length} refused), turns heard: ${store.state.turns.length}`);
  console.log(`  drafts: ${store.state.drafts.map((d) => `${d.id} ${d.status}`).join(', ') || 'none'}; outbox: ${store.state.outbox.length}`);
  console.log(`  latency: end of speech to first agent audio ${JSON.stringify(latency.endOfSpeechToFirstAudio)}, to draft ${JSON.stringify(latency.endOfSpeechToDraft)}`);
  for (const o of [hold, interactive].filter(Boolean)) console.log(`  event order around ${o.name}: ${o.order.map((e) => `${e.dir === 'out' ? '>' : '<'}${e.type}${e.status ? `(${e.status})` : ''}@${e.ms}`).join(' ')}`);
  console.log(dim(`  replay it: npm run replay -- ${path.relative(process.cwd(), tapeFile)}`));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, buildPlan, evidenceOf, ASKED_SIZE };
