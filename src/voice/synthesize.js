'use strict';

// Speaks one scripted line in one of AssemblyAI's own voices: a throwaway Voice Agent session
// whose greeting is the line, keeping the greeting's reply.audio (PCM16 mono, 24 kHz) and
// checking that the agent's transcript of what it said is the line, word for word. The
// session is ended with session.end as soon as the greeting is done. Node only.

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function synthesizeLine({ provider, text, voice, timeoutMs = 30000, transcriptWaitMs = 1500, endWaitMs = 3000, timers = null }) {
  const t = timers || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };
  const chunks = [];
  let transcript = null;
  let error = null;
  let replyDone;
  const done = new Promise((resolve) => {
    replyDone = resolve;
  });
  let gotTranscript;
  const transcribed = new Promise((resolve) => {
    gotTranscript = resolve;
  });
  let sessionEnded;
  const ended = new Promise((resolve) => {
    sessionEnded = resolve;
  });
  const within = (promise, ms) => {
    let id;
    return Promise.race([promise, new Promise((resolve) => (id = t.setTimeout(() => resolve('timeout'), ms)))]).finally(() => t.clearTimeout(id));
  };

  provider.on('message', (ev) => {
    switch (ev.type) {
      case 'reply.audio':
        chunks.push(Buffer.from(ev.data || '', 'base64'));
        break;
      case 'transcript.agent':
        transcript = ev.text;
        gotTranscript();
        break;
      case 'reply.done':
        replyDone('done');
        break;
      case 'session.error':
        error = `${ev.code}: ${ev.message}`;
        replyDone('error');
        break;
      case 'session.ended':
        sessionEnded();
        break;
      default:
        break;
    }
  });
  provider.on('close', () => {
    replyDone('closed');
    gotTranscript();
    sessionEnded();
  });

  await provider.connect();
  provider.send({
    type: 'session.update',
    session: {
      system_prompt: 'You read one line aloud exactly as written, then stay silent.',
      greeting: text,
      output: { voice, format: { encoding: 'audio/pcm' } },
    },
  });
  const outcome = await within(done, timeoutMs);
  if (transcript === null && outcome === 'done') await within(transcribed, transcriptWaitMs);
  try {
    provider.send({ type: 'session.end' });
    await within(ended, endWaitMs);
  } catch {
    // the socket already closed: nothing left to end or bill
  }
  provider.close();
  const pcm = Buffer.concat(chunks);
  return { pcm, transcript, outcome, error, matches: outcome === 'done' && pcm.length > 0 && normalize(transcript) === normalize(text) };
}

module.exports = { synthesizeLine, normalize };
