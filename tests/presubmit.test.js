'use strict';

// The presubmit check: it passes only when everything the submission copy claims exists, and
// names every gap otherwise. Run here against temporary copies of the entry's files.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { check } = require('../scripts/presubmit');
const { FIXTURE } = require('../scripts/make-sample-tape');

const ROOT = path.join(__dirname, '..');
const SESSION = 'sess_presubmit_test';

function entry({ recorded = false, submission = fs.readFileSync(path.join(ROOT, 'docs', 'submission.md'), 'utf8') } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tailgate-presubmit-'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  write('README.md', recorded ? `Recorded as ${SESSION}.\n` : 'No session yet.\n');
  write('docs/submission.md', submission);
  if (recorded) {
    const [header, ...rest] = fs.readFileSync(FIXTURE, 'utf8').trim().split('\n');
    const h = { ...JSON.parse(header), synthetic: false, sessionId: SESSION, label: null };
    write('tapes/demo-session.jsonl', `${[JSON.stringify(h), ...rest].join('\n')}\n`);
    write('tapes/raw/demo-session.agent.pcm', Buffer.alloc(4096));
    write('docs/evidence/latency.json', JSON.stringify({ sessionId: SESSION, endOfSpeechToDraft: { n: 1, min: 900, median: 900, max: 900 } }));
    write('media/media.json', JSON.stringify({ final: true, sessionId: SESSION }));
  }
  return root;
}

test('before a session is recorded, it names the missing tape and nothing passes by accident', async () => {
  const root = entry();
  try {
    const { gaps, oks } = await check(root);
    expect(gaps).toEqual([expect.stringMatching(/tapes\/demo-session\.jsonl is missing/)]);
    expect(oks).toEqual(['docs/submission.md makes no retired claim']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('with a recorded tape, its voice, its latency, a final render and an updated README, it passes', async () => {
  const root = entry({ recorded: true });
  try {
    const { gaps } = await check(root);
    expect(gaps).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a copy that claims what was cut, or media rendered from another session, is a gap', async () => {
  const root = entry({ recorded: true, submission: 'Every line has a receipt: the owner\'s exact words, playable.\n' });
  fs.writeFileSync(path.join(root, 'media', 'media.json'), JSON.stringify({ final: false, sessionId: SESSION }));
  fs.rmSync(path.join(root, 'tapes', 'raw', 'demo-session.agent.pcm'));
  try {
    const { gaps } = await check(root);
    expect(gaps).toEqual([
      expect.stringMatching(/agent\.pcm is missing: the demo would be silent/),
      expect.stringMatching(/media\/ has no final render/),
      expect.stringMatching(/claims a playable receipt/),
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the current submission copy makes none of the retired claims', async () => {
  const { gaps } = await check(ROOT);
  expect(gaps.filter((g) => g.startsWith('docs/submission.md'))).toEqual([]);
});
