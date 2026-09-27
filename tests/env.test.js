'use strict';

// The key is read only when an entrypoint asks, from .env or the environment (the environment
// wins, even when empty), and a missing key is a clear refusal. Uses a temporary .env only.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadKey, requireKey, MissingKeyError, ENV_FILE } = require('../src/env');

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tailgate-env-'));
  delete process.env.ASSEMBLYAI_API_KEY;
});
afterEach(() => {
  delete process.env.ASSEMBLYAI_API_KEY;
  fs.rmSync(dir, { recursive: true, force: true });
});

// process.loadEnvFile writes to the real process.env, which Jest's sandbox does not mirror,
// so the file-loading behaviour is checked in a child process, with a dummy key.
function loadInChild(file, env) {
  const code = `process.stdout.write(JSON.stringify(require(${JSON.stringify(path.join(__dirname, '..', 'src', 'env.js'))}).loadKey(${JSON.stringify(file)})))`;
  const res = spawnSync(process.execPath, ['-e', code], { env, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(res.stderr);
  return JSON.parse(res.stdout);
}

test('reads the key from a .env file when the environment has none', () => {
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'ASSEMBLYAI_API_KEY=dummy-from-file-123\n');
  const env = { ...process.env };
  delete env.ASSEMBLYAI_API_KEY;
  expect(loadInChild(file, env)).toBe('dummy-from-file-123');
});

test('a variable set in the environment wins over the file, even when it is empty', () => {
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'ASSEMBLYAI_API_KEY=dummy-from-file-123\n');
  expect(loadInChild(file, { ...process.env, ASSEMBLYAI_API_KEY: '' })).toBeNull();
  expect(loadInChild(file, { ...process.env, ASSEMBLYAI_API_KEY: 'dummy-from-env' })).toBe('dummy-from-env');
});

test('no file and no variable: requireKey refuses and says nothing was sent', () => {
  const missing = path.join(dir, 'nope.env');
  expect(loadKey(missing)).toBeNull();
  let err;
  try {
    requireKey('record-session', missing);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(MissingKeyError);
  expect(err.message).toMatch(/record-session needs ASSEMBLYAI_API_KEY.*Nothing was sent to AssemblyAI/);
});

test('the default .env is the entry root one, and requiring env.js reads nothing', () => {
  expect(ENV_FILE).toBe(path.join(__dirname, '..', '.env'));
  const real = process.loadEnvFile;
  process.loadEnvFile = () => {
    throw new Error('read at require time');
  };
  try {
    jest.isolateModules(() => require('../src/env'));
  } finally {
    process.loadEnvFile = real;
  }
});
