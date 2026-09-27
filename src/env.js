'use strict';

// The one place the API key is read, and only when an entrypoint (the server's start() or a
// recording script) asks for it. Nothing here runs at require time. The key's value is never
// printed: callers learn only whether it is set.

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');

// Loads .env when it exists (a variable already set in the environment wins, even when it is
// empty) and returns the key, or null.
function loadKey(envFile = ENV_FILE) {
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const key = process.env.ASSEMBLYAI_API_KEY;
  return typeof key === 'string' && key.trim() !== '' ? key.trim() : null;
}

class MissingKeyError extends Error {}

function requireKey(what, envFile = ENV_FILE) {
  const key = loadKey(envFile);
  if (!key) {
    throw new MissingKeyError(
      `${what} needs ASSEMBLYAI_API_KEY and it is not set. Copy .env.example to .env and put your AssemblyAI key there ` +
        '(it stays on this machine and is never printed). Nothing was sent to AssemblyAI.',
    );
  }
  return key;
}

module.exports = { loadKey, requireKey, MissingKeyError, ENV_FILE };
