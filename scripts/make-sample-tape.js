#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// Writes tests/fixtures/sample-session.jsonl: a SYNTHETIC tape of the demo scenario, marked
// `synthetic: true` in its header, for tests and for the demo until a real AssemblyAI session
// has been recorded. It is produced by the same path a real recording takes (the scripted
// events go through the fake provider, the real bridge, the real invoke() and the same tape
// writer), with invented but plausible timings. Nothing in it came from AssemblyAI.
//
//   npm run sample-tape            rewrite the fixture
//   npm run sample-tape -- --check exit 1 if the committed fixture is stale

const fs = require('fs');
const path = require('path');
const seed = require('../fake-data/seed.json');
const { createStore } = require('../src/store');
const { createInvoke } = require('../src/invoke');
const { createBridge } = require('../src/voice/bridge');
const { FakeVoiceProvider } = require('../src/voice/fake');
const { VOICE_BEATS } = require('../src/voice/scenario');
const { createTapeWriter, createTapeClock, recordingProvider, fingerprint } = require('../src/voice/tape');

const FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'sample-session.jsonl');
const RECORDED_AT = '2026-09-28T07:00:00.000Z';
const SESSION_ID = 'sess_scripted_sample';
const LABEL = 'Scripted sample, not a recorded session';

const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
const SPEECH_MS_PER_WORD = 330;

// Invented gaps, in milliseconds, before each event: roughly how a live session paces them.
// finalText maps each user item to its finished transcript, so the words not yet in a partial
// are "spoken" before input.speech.stopped rather than after it.
function pacer(finalText) {
  const partialWords = new Map();
  let agentText = '';
  let replyInFlight = false;
  let item = null;
  return (event) => {
    switch (event.type) {
      case 'session.ready':
        return 420;
      case 'reply.started':
        replyInFlight = true;
        agentText = '';
        return 650;
      case 'transcript.agent.delta':
        agentText = event.delta;
        return 180;
      case 'reply.audio':
        return 120;
      case 'reply.done':
        replyInFlight = false;
        return event.status === 'interrupted' ? 260 : Math.max(600, words(agentText) * SPEECH_MS_PER_WORD);
      case 'transcript.agent':
        return 40;
      case 'input.speech.started':
        return replyInFlight ? 1500 : 900;
      case 'transcript.user.delta': {
        const before = partialWords.get(event.item_id) || 0;
        item = event.item_id;
        partialWords.set(item, words(event.text));
        return Math.max(250, (words(event.text) - before) * SPEECH_MS_PER_WORD);
      }
      case 'input.speech.stopped': {
        const left = words(finalText.get(item)) - (partialWords.get(item) || 0);
        return 300 + Math.max(0, left) * SPEECH_MS_PER_WORD;
      }
      case 'transcript.user':
        return 380;
      case 'tool.call':
        return 700;
      default:
        return 100;
    }
  };
}

async function buildSampleTape() {
  const clock = createTapeClock(RECORDED_AT);
  const store = createStore({ now: clock.now });
  const invoke = createInvoke(store);
  const lines = [];
  const writer = createTapeWriter({
    write: (line) => lines.push(line),
    header: { recordedAt: RECORDED_AT, seedHash: fingerprint(seed), sessionId: SESSION_ID, model: null, synthetic: true, label: LABEL },
  });
  let t = 0;
  const fake = new FakeVoiceProvider({ sessionId: SESSION_ID, autoReady: false });
  const provider = recordingProvider(fake, { writer, elapsed: () => t, clock });
  const bridge = createBridge({ provider, invoke, store });
  const events = VOICE_BEATS.flatMap((beat) => beat.events);
  const gap = pacer(new Map(events.filter((e) => e.type === 'transcript.user').map((e) => [e.item_id, e.text])));
  const emit = (event) => {
    t += gap(event);
    fake.emit(event);
  };

  await bridge.start();
  emit({ type: 'session.ready', session_id: SESSION_ID, expires_at: Math.floor(Date.parse(RECORDED_AT) / 1000) + 600, config: { voice: 'anna' } });
  for (const event of events) emit(event);
  t += 1500;
  await bridge.stop();
  return `${lines.join('\n')}\n`;
}

async function main() {
  const text = await buildSampleTape();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(FIXTURE) ? fs.readFileSync(FIXTURE, 'utf8') : '';
    if (current !== text) {
      console.error(`${path.relative(process.cwd(), FIXTURE)} is stale; run npm run sample-tape`);
      process.exitCode = 1;
      return;
    }
    console.log('sample tape is current');
    return;
  }
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, text);
  console.log(`wrote ${path.relative(process.cwd(), FIXTURE)} (${text.split('\n').length - 2} events, synthetic)`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { buildSampleTape, FIXTURE, RECORDED_AT, SESSION_ID };
