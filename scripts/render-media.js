#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// Renders the submission's two still media from the real app, never from a mock-up:
//
//   media/cover.png   1600 × 900: the static demo in ?layout=tailgate, paused just after the
//                     customer's spoken "send it over" was heard and refused;
//   media/deck.pdf    docs/deck/deck.html, ten 1600 × 900 pages, with three real screenshots
//                     (media/shots/), the measured latencies from docs/evidence/latency.json
//                     and the repository and demo links from docs/submission.md;
//   media/media.json  what was rendered from which session, and whether it was --final.
//
//   npm run media -- --playwright <path to an installed "playwright" package>
//   npm run media -- --playwright <path> --final
//   (--tape <file> renders from another tape inside this repository; --out <dir> writes elsewhere)
//
// Playwright is not a dependency of this repository (it downloads its own browser), so the
// path of any installed copy is passed in. Without --final the deck is a draft, marked DRAFT
// on every page, and may be made from the scripted sample. --final refuses unless the demo
// tape is a real recorded session and its latencies were measured from that same session.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { build } = require('./build-pages');
const { defaultTape } = require('../src/server');
const { parseTape, tapeLabel } = require('../src/voice/tape');
const { detectSpokenApproval } = require('../src/spoken');

const ROOT = path.join(__dirname, '..');
const DRAFT_VERBS = new Set(['draft_quote', 'revise_quote']);

function parseArgs(argv) {
  const opts = { playwright: null, final: false, out: path.join(ROOT, 'media'), tape: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      i += 1;
      if (argv[i] === undefined) throw new Error(`${a} needs a value`);
      return argv[i];
    };
    if (a === '--playwright') opts.playwright = path.resolve(next());
    else if (a === '--final') opts.final = true;
    else if (a === '--out') opts.out = path.resolve(next());
    else if (a === '--tape') opts.tape = path.resolve(next());
    else throw new Error(`unknown option ${a}`);
  }
  return opts;
}

// The tape moments the stills are taken at, as tape `t` values (the page's ?t=):
//   receipts  just after the last successful draft or revision of a quote;
//   spoken    just after the agent answered the spoken "send it" (the banner is up);
//   end       past the last event, so the session has ended and the owner may tap (the
//             receipts close-up is taken here, with the owner's buttons live).
function moments(tape) {
  const names = new Map();
  let receipts = null;
  let spokenAt = null;
  let spoken = null;
  for (const { t, dir, event } of tape.lines) {
    if (dir === 'in' && event.type === 'tool.call') names.set(event.call_id, event.name);
    if (dir === 'out' && event.type === 'tool.result' && DRAFT_VERBS.has(names.get(event.call_id)) && !event.is_error) receipts = t + 500;
    if (dir === 'in' && event.type === 'transcript.user' && detectSpokenApproval(event.text).approval) {
      spokenAt = t;
      spoken = null;
    }
    if (dir === 'in' && event.type === 'transcript.agent' && spokenAt !== null && spoken === null) spoken = t + 200;
  }
  const last = tape.lines[tape.lines.length - 1];
  if (receipts === null) throw new Error('the tape drafts no quote, so there is nothing to show on the receipts slide');
  if (spokenAt === null) throw new Error('the tape has no spoken "send it", so there is nothing to show on the cover');
  return { receipts, spoken: spoken === null ? spokenAt + 3000 : spoken, end: last.t + 1000 };
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

// One line for the "how it works" slide, from docs/evidence/latency.json; null if unmeasured.
function latencyText(latency) {
  if (!latency || !latency.endOfSpeechToDraft) return null;
  const draft = latency.endOfSpeechToDraft;
  const parts = [`the draft on screen ${seconds(draft.median)} after the owner stopped talking (median of ${draft.n})`];
  if (latency.endOfSpeechToFirstAudio) parts.push(`the agent's voice back in ${seconds(latency.endOfSpeechToFirstAudio.median)} (median)`);
  return `${parts.join('; ')}, session ${latency.sessionId}.`;
}

// The repository and demo links as the submission form will carry them.
function submissionLinks(markdown) {
  const field = (heading) => {
    const at = markdown.indexOf(`### ${heading}\n`);
    if (at < 0) return null;
    const m = markdown.slice(at).match(/```\n([^\n]+)\n```/);
    return m ? m[1].trim() : null;
  };
  return { repo: field('GitHub Repository'), demo: field('Demo Application URL') };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.pcm': 'application/octet-stream' };

function serve(root) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    const file = path.join(root, rel.endsWith('/') || rel === '' ? `${rel}index.html` : rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function loadPlaywright(dir) {
  const tries = dir ? [dir] : ['playwright'];
  for (const t of tries) {
    try {
      return require(t);
    } catch {
      // tried next, or reported below
    }
  }
  throw new Error('Playwright is not a dependency of this repository. Pass --playwright <path to an installed "playwright" package>.');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tapeFile = opts.tape || defaultTape();
  const tape = parseTape(fs.readFileSync(tapeFile, 'utf8'));
  const latencyFile = path.join(ROOT, 'docs', 'evidence', 'latency.json');
  const latency = fs.existsSync(latencyFile) ? JSON.parse(fs.readFileSync(latencyFile, 'utf8')) : null;
  const links = submissionLinks(fs.readFileSync(path.join(ROOT, 'docs', 'submission.md'), 'utf8'));
  if (opts.final) {
    const problems = [];
    if (tape.header.synthetic) problems.push(`the demo tape is the scripted sample (${path.relative(ROOT, tapeFile)}); record tapes/demo-session.jsonl first`);
    if (!latency) problems.push('docs/evidence/latency.json is missing; run npm run latency on the recorded tape');
    else if (latency.sessionId !== tape.header.sessionId) problems.push(`docs/evidence/latency.json is from ${latency.sessionId}, not from the demo tape's ${tape.header.sessionId}`);
    if (problems.length) throw new Error(`Not rendering final media:\n  - ${problems.join('\n  - ')}`);
  }
  const { chromium } = loadPlaywright(opts.playwright);
  const at = moments(tape);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tailgate-media-'));
  const shots = path.join(opts.out, 'shots');
  fs.mkdirSync(shots, { recursive: true });
  const built = await build(path.join(tmp, 'site'), { tape: tapeFile });
  fs.mkdirSync(path.join(tmp, 'deck', 'shots'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'docs', 'deck', 'deck.html'), path.join(tmp, 'deck', 'deck.html'));
  const server = await serve(tmp);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: 'light' });
    const open = async (query) => {
      await page.goto(`${base}/site/?${query}`);
      await page.waitForFunction(() => document.getElementById('session-label').textContent !== 'Loading…');
      await page.waitForTimeout(400);
    };

    await open(`layout=tailgate&t=${at.spoken}`);
    await page.waitForSelector('#banner:not([hidden])');
    await page.screenshot({ path: path.join(opts.out, 'cover.png') });

    // The slide's close-ups need whole cards, taller than one 900 px screen.
    await page.setViewportSize({ width: 1600, height: 1800 });
    await open(`t=${at.spoken}`);
    // The customer's words, flagged, and the agent's answer right after them.
    const box = await page.evaluate(() => {
      const turn = document.querySelector('#transcript .turn.spoken');
      const rects = [turn, turn.nextElementSibling].filter(Boolean).map((el) => el.getBoundingClientRect());
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      return { x: rects[0].left - 12, y: top - 12, width: rects[0].width + 24, height: bottom - top + 24 };
    });
    await page.screenshot({ path: path.join(shots, 'spoken.png'), clip: box });

    // The receipts and the customer's copy after the session, when the owner may tap.
    await open(`t=${at.end}`);
    await page.locator('#cards article').first().screenshot({ path: path.join(shots, 'receipts.png') });
    await page.locator('button[data-act="send"][data-kind="customer_quote"]').first().click();
    await page.waitForSelector('.copy');
    await page.locator('.copy').first().screenshot({ path: path.join(shots, 'copy.png') });

    for (const name of ['receipts.png', 'spoken.png', 'copy.png']) fs.copyFileSync(path.join(shots, name), path.join(tmp, 'deck', 'shots', name));
    await page.goto(`${base}/deck/deck.html`);
    await page.evaluate(
      ({ fill, draft }) => {
        for (const [key, value] of Object.entries(fill)) for (const el of document.querySelectorAll(`[data-fill="${key}"]`)) if (value) el.textContent = value;
        // The deck source names its screenshots by data-shot, so the published repo holds no link to an unrendered file.
        for (const img of document.querySelectorAll('img[data-shot]')) img.src = `shots/${img.dataset.shot}`;
        document.body.classList.toggle('draft', draft);
      },
      {
        fill: { latency: latencyText(latency), session: tapeLabel(tape.header), repo: links.repo, demo: links.demo },
        draft: !opts.final,
      },
    );
    await page.evaluate(() => Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => img.addEventListener('load', r))))));
    await page.pdf({ path: path.join(opts.out, 'deck.pdf'), width: '1600px', height: '900px', printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // What was rendered from what, for the presubmit check.
  const record = { final: opts.final, sessionId: tape.header.sessionId, synthetic: Boolean(tape.header.synthetic), tape: path.relative(ROOT, tapeFile), build: built.version };
  fs.writeFileSync(path.join(opts.out, 'media.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`${opts.final ? 'Final' : 'Draft'} media from ${tapeLabel(tape.header)} (static build ${built.version}):`);
  for (const f of ['cover.png', 'deck.pdf', 'shots/receipts.png', 'shots/spoken.png', 'shots/copy.png']) {
    const file = path.join(opts.out, f);
    console.log(`  ${path.relative(process.cwd(), file)} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
  }
  if (!opts.final) console.log('  every deck page is marked DRAFT; render with --final for the submission');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, moments, latencyText, submissionLinks };
