'use strict';

// The scripts that talk to AssemblyAI refuse, before any network call, when no key is set.
// Each child gets ASSEMBLYAI_API_KEY set to empty, which also wins over any .env file, so these
// tests can never start a billed session.

const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const run = (script, args = []) =>
  spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    env: { ...process.env, ASSEMBLYAI_API_KEY: '', NO_COLOR: '1' },
    encoding: 'utf8',
    timeout: 20000,
  });

test.each([
  ['record-session.js', []],
  ['record-session.js', ['--smoke']],
  ['keyterms-ab.js', []],
  ['make-clips.js', ['--voices', 'assemblyai', '--out', path.join(os.tmpdir(), 'tailgate-never-written')]],
])('%s %s refuses clearly without a key (exit 2)', (script, args) => {
  const res = run(script, args);
  expect(res.status).toBe(2);
  expect(res.stderr).toMatch(/needs ASSEMBLYAI_API_KEY and it is not set/);
  expect(res.stderr).toMatch(/Nothing was sent to AssemblyAI/);
});

test('the replay script replays the sample tape offline with no drift', () => {
  const res = run('replay.js', [path.join(ROOT, 'tests', 'fixtures', 'sample-session.jsonl'), '--speed', 'Infinity']);
  expect(res.status).toBe(0);
  expect(res.stdout).toMatch(/Scripted sample, not a recorded session/);
  expect(res.stdout).toMatch(/drift: none/);
  expect(res.stdout).toMatch(/refused as approval/);
});

test('the latency script never writes evidence from a synthetic tape', () => {
  const res = run('latency.js', [path.join(ROOT, 'tests', 'fixtures', 'sample-session.jsonl')]);
  expect(res.status).toBe(0);
  expect(res.stdout).toMatch(/Synthetic tape: these timings are invented, so nothing was written/);
});
