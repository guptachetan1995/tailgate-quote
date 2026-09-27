'use strict';

// The media renderer's pure parts: which moments of a tape the stills are taken at, the
// measured-latency line, the links, and the --final refusal. Rendering itself needs a browser
// (Playwright, passed in by path) and is run by hand, never by the test suite.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { moments, latencyText, submissionLinks, parseArgs } = require('../scripts/render-media');
const { parseTape } = require('../src/voice/tape');
const { FIXTURE } = require('../scripts/make-sample-tape');

const ROOT = path.join(__dirname, '..');
const SAMPLE = parseTape(fs.readFileSync(FIXTURE, 'utf8'));
const lineOf = (pred) => SAMPLE.lines.find(pred);

test('the stills are taken after the last revision, after the answer to the spoken send, and after the session', () => {
  const revise = lineOf((l) => l.dir === 'out' && l.event.type === 'tool.result' && l.event.call_id === 'call_6');
  const at = moments(SAMPLE);
  expect(at.receipts).toBe(revise.t + 500);
  const answer = SAMPLE.lines.filter((l) => l.event.type === 'transcript.agent').at(-1);
  expect(at.spoken).toBe(answer.t + 200);
  expect(at.end).toBe(SAMPLE.lines.at(-1).t + 1000);
});

test('a tape with no drafted quote or no spoken send is refused, not rendered half-empty', () => {
  const noSend = { ...SAMPLE, lines: SAMPLE.lines.filter((l) => !(l.event.type === 'transcript.user' && /send it over/.test(l.event.text))) };
  expect(() => moments(noSend)).toThrow(/no spoken "send it"/);
  const noDraft = { ...SAMPLE, lines: SAMPLE.lines.filter((l) => l.event.type !== 'tool.result') };
  expect(() => moments(noDraft)).toThrow(/drafts no quote/);
});

test('the latency line comes from the evidence file, and is null when nothing was measured', () => {
  expect(latencyText(null)).toBeNull();
  expect(latencyText({ sessionId: 'sess_x', endOfSpeechToDraft: null })).toBeNull();
  expect(
    latencyText({ sessionId: 'sess_x', endOfSpeechToDraft: { n: 3, median: 1240 }, endOfSpeechToFirstAudio: { n: 5, median: 870 } }),
  ).toBe("the draft on screen 1.2 s after the owner stopped talking (median of 3); the agent's voice back in 0.9 s (median), session sess_x.");
});

test('the deck links are the ones the submission form carries', () => {
  const links = submissionLinks(fs.readFileSync(path.join(ROOT, 'docs', 'submission.md'), 'utf8'));
  expect(links.repo).toMatch(/^https:\/\/github\.com\/.+/);
  expect(links.demo).toMatch(/^https:\/\/.+/);
  expect(parseArgs(['--final', '--out', 'x', '--tape', 't.jsonl'])).toMatchObject({ final: true, out: path.resolve('x'), tape: path.resolve('t.jsonl'), playwright: null });
  expect(() => parseArgs(['--speed'])).toThrow(/unknown option/);
});

test('--final refuses to render from the scripted sample, before loading any browser', () => {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'render-media.js'), '--final', '--tape', FIXTURE, '--out', path.join(ROOT, 'dist', 'never')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20000,
  });
  expect(res.status).toBe(1);
  expect(res.stderr).toMatch(/Not rendering final media/);
  expect(res.stderr).toMatch(/the demo tape is the scripted sample/);
  expect(fs.existsSync(path.join(ROOT, 'dist', 'never'))).toBe(false);
});
