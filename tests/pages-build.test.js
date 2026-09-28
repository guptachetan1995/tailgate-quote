'use strict';

// The static live demo: built into temp directories, and its bundle run in a bare vm context
// with no window, no timers, no fetch and no WebSocket, so it can only work if nothing in it
// touches the network.

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { build, BUNDLE, MARKER, AUDIO } = require('../scripts/build-pages');
const { FIXTURE } = require('../scripts/make-sample-tape');
const { createStore } = require('../src/store');
const { createInvoke } = require('../src/invoke');
const { createApi } = require('../src/api');
const { parseTape, tapeLabel } = require('../src/voice/tape');
const { defaultTape } = require('../src/server');
const { AGENT_PANEL_STEPS, OWNER_STEPS, LINES } = require('../src/voice/scenario');
const { OWNER_VERB_NAMES } = require('../src/invoke');

jest.setTimeout(30000);

const DUMMY_KEY = 'aai-dummy-key-for-the-pages-build-0123456789';
const plain = (v) => JSON.parse(JSON.stringify(v));
const flush = () => new Promise((resolve) => setImmediate(resolve));
// Built from the committed synthetic sample, so these expectations hold whether or not a real
// session has been recorded into tapes/demo-session.jsonl on this machine.
const HEADER = parseTape(fs.readFileSync(FIXTURE, 'utf8')).header;

let dirs;
let first;

beforeAll(async () => {
  process.env.ASSEMBLYAI_API_KEY = DUMMY_KEY;
  dirs = [fs.mkdtempSync(path.join(os.tmpdir(), 'tailgate-pages-')), fs.mkdtempSync(path.join(os.tmpdir(), 'tailgate-pages-'))];
  first = await build(dirs[0], { tape: FIXTURE });
  await build(dirs[1], { tape: FIXTURE });
});

afterAll(() => {
  delete process.env.ASSEMBLYAI_API_KEY;
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

const read = (name, dir = dirs[0]) => fs.readFileSync(path.join(dir, name), 'utf8');

function backend() {
  const context = vm.createContext({});
  vm.runInContext(read(BUNDLE), context, { filename: BUNDLE });
  const b = context.TailgateStatic.createBackend();
  const events = [];
  const raw = [];
  b.on((e) => {
    raw.push(e);
    events.push(plain(e));
  });
  return { b, events, raw, context };
}

async function playToEnd(b) {
  const res = await b.post('api/voice/start', { mode: 'replay' });
  expect(res.status).toBe(200);
  b.clock.runAll();
  await flush();
}

describe('the build', () => {
  test('writes the page, the bundle and the page scripts, and nothing else', () => {
    expect(fs.readdirSync(dirs[0]).sort()).toEqual(['.nojekyll', 'app.js', 'audio.js', 'index.html', 'mic-worklet.js', BUNDLE].sort());
    expect(first.tape).toBe(path.relative(path.join(__dirname, '..'), FIXTURE).split(path.sep).join('/'));
  });

  test('the default tape is the recorded session when one exists, otherwise the synthetic sample', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tailgate-root-'));
    try {
      expect(defaultTape(root)).toBe(path.join(root, 'tests', 'fixtures', 'sample-session.jsonl'));
      fs.mkdirSync(path.join(root, 'tapes'));
      fs.writeFileSync(path.join(root, 'tapes', 'demo-session.jsonl'), '');
      expect(defaultTape(root)).toBe(path.join(root, 'tapes', 'demo-session.jsonl'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('index.html loads the bundle where the marker was, versions every script, and links only relatively', () => {
    const html = read('index.html');
    expect(html).not.toContain(MARKER);
    expect(html).toContain(`<meta name="tailgate-build" content="${first.version}">`);
    for (const src of [BUNDLE, 'audio.js', 'app.js']) expect(html).toContain(`src="${src}?v=${first.version}"`);
    expect(html.indexOf(BUNDLE)).toBeLessThan(html.indexOf('src="app.js'));
    expect(html).not.toMatch(/\s(src|href)="\//);
  });

  test('is byte-identical when built twice', () => {
    for (const name of fs.readdirSync(dirs[0])) expect(read(name, dirs[1])).toBe(read(name));
  });

  test('the bundle holds no Node globals, no network code and no key', () => {
    const js = read(BUNDLE);
    for (const banned of ['process.', '__dirname', '__filename', 'fetch(', 'new WebSocket', 'XMLHttpRequest', 'loadEnvFile', 'agents.assemblyai.com']) {
      expect(js).not.toContain(banned);
    }
    for (const name of fs.readdirSync(dirs[0])) expect(read(name)).not.toContain(DUMMY_KEY);
  });

  test('refuses a template without exactly one marker, before writing anything', async () => {
    const real = fs.readFileSync;
    const spy = jest.spyOn(fs, 'readFileSync').mockImplementation((p, ...rest) => {
      const text = real(p, ...rest);
      return String(p).endsWith(path.join('public', 'index.html')) ? String(text).replace(MARKER, '') : text;
    });
    const out = path.join(os.tmpdir(), `tailgate-pages-never-${process.pid}`);
    try {
      await expect(build(out)).rejects.toThrow(/exactly one <!-- pages:bundle --> marker/);
      expect(fs.existsSync(out)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('the static demo, run with no network', () => {
  test('starts in a bare context and labels the tape honestly', async () => {
    const { b, context } = backend();
    expect(context.setTimeout).toBeUndefined();
    expect(context.fetch).toBeUndefined();
    const voice = plain((await b.get('api/voice')).body);
    expect(voice).toMatchObject({ active: false, modes: [{ mode: 'replay', label: tapeLabel(HEADER), synthetic: Boolean(HEADER.synthetic) }] });
    expect(voice.modes.map((m) => m.mode)).not.toContain('live');
    expect(voice.modes[0].label).toMatch(HEADER.synthetic ? /^Scripted sample, not a recorded session$/ : /^Replay of a real AssemblyAI Voice Agent session \(sess_/);
    const state = plain((await b.get('/api/state')).body);
    expect(state.leads.map((l) => l.name)).toEqual(['Priya Shah', 'Daniel Okafor', 'Helen Marsh']);
    expect(state.drafts).toEqual([]);
  });

  test('the replay moves only when the page advances its clock', async () => {
    const { b } = backend();
    await b.post('api/voice/start', { mode: 'replay' });
    const drafts = async () => plain((await b.get('api/state')).body).drafts.length;
    b.clock.advance(20000);
    await flush();
    expect(await drafts()).toBe(0);
    expect(plain((await b.get('api/state')).body).turns).toHaveLength(1);
    await flush();
    expect(await drafts()).toBe(0);
    b.clock.advance(6000);
    expect(await drafts()).toBe(1);
  });

  test('plays the session through the real gate; the tape drafts, only the owner sends, and the agent is refused', async () => {
    const { b, events } = backend();
    await playToEnd(b);
    const types = new Set(events.map((e) => e.type));
    for (const t of ['voice.start', 'voice.ready', 'voice.partial', 'voice.agentDelta', 'voice.agent', 'voice.wire', 'voice.progress', 'voice.close', 'activity']) expect(types).toContain(t);
    expect(events.filter((e) => e.type.startsWith('voice.')).every((e) => typeof e.data.ms === 'number')).toBe(true);
    expect(plain((await b.get('api/voice')).body).active).toBe(false);

    let state = plain((await b.get('api/state')).body);
    expect(state.drafts.map((d) => [d.id, d.status])).toEqual([
      ['Q-1001', 'draft'],
      ['S-2001', 'draft'],
    ]);
    expect(state.drafts[0].total).toBe(2255);
    expect(state.outbox).toEqual([]);
    expect(state.turns.find((t) => t.text === LINES.U4).spokenApproval).toBe(true);
    const spoken = events.find((e) => e.type === 'activity' && e.data.outcome === 'refused_as_approval');
    expect(spoken.data).toMatchObject({ actor: 'voice', tool: 'record_turn' });

    for (const step of AGENT_PANEL_STEPS.slice(0, 3)) {
      const res = plain(await b.post('api/invoke', { tool: step.tool, args: step.args, actor: 'agent' }));
      expect(res).toMatchObject({ status: 200, body: { success: false } });
    }
    for (const tool of OWNER_VERB_NAMES) {
      const args = tool === 'discard_draft' ? { draft_id: 'Q-1001', reason: 'agent' } : { draft_id: tool === 'send_quote' ? 'Q-1001' : 'S-2001' };
      expect(plain(await b.post('api/invoke', { tool, args, actor: 'agent' })).body.error).toMatch(/owner-only/);
    }
    expect(plain((await b.get('api/state')).body)).toEqual(state);

    for (const step of OWNER_STEPS) expect(plain(await b.post('api/invoke', { tool: step.tool, args: step.args, actor: 'owner' })).body.success).toBe(true);
    state = plain((await b.get('api/state')).body);
    expect(state.drafts.map((d) => [d.id, d.status, d.sentBy || d.discardedBy])).toEqual([
      ['Q-1001', 'sent', 'owner'],
      ['S-2001', 'discarded', 'owner'],
    ]);
    expect(state.outbox[0].copy).toMatchObject({ total: 2255, taxNote: 'Tax calculated at invoicing' });

    const revise = plain(await b.post('api/invoke', { tool: AGENT_PANEL_STEPS[3].tool, args: AGENT_PANEL_STEPS[3].args, actor: 'agent' }));
    expect(revise.body).toMatchObject({ success: false, error: expect.stringMatching(/frozen/) });

    const names = plain((await b.get('api/tools')).body).map((t) => t.name);
    expect(names.sort()).toEqual(['draft_quote', 'draft_supplier_request', 'get_board', 'revise_quote', 'search_catalog']);
    const log = plain((await b.get('api/activity')).body);
    expect(log.filter((e) => e.tool === 'send_quote').map((e) => [e.actor, e.outcome])).toEqual([
      ['agent', 'refused'],
      ['agent', 'refused'],
      ['owner', 'ok'],
    ]);
  });

  test('a request the server would answer 400 gets the same 400 here', async () => {
    const { b } = backend();
    const store = createStore();
    const api = createApi({ store, invoke: createInvoke(store) });
    for (const body of [
      undefined,
      { tool: 'send_quote', args: { draft_id: 'Q-1001' } },
      { tool: 'send_quote', args: { draft_id: 'Q-1001' }, actor: 'voice' },
      { tool: 'send_quote', args: { draft_id: 'Q-1001' }, actor: 'human' },
      { args: {}, actor: 'owner' },
      { tool: 'send_quote', args: {}, actor: 'owner', as: 'owner' },
    ]) {
      const expected = api.postInvoke(body);
      expect(expected.status).toBe(400);
      expect(plain(await b.post('api/invoke', body))).toEqual(plain(expected));
    }
    expect(plain(await b.post('api/voice/start', { mode: 'live' }))).toMatchObject({ status: 400, body: { error: expect.stringMatching(/"live" is not offered here/) } });
  });

  test('responses and events are fresh JSON copies, never live references into the store', async () => {
    const { b, raw } = backend();
    await playToEnd(b);
    const one = (await b.get('api/state')).body;
    one.drafts[0].status = 'sent';
    one.drafts[0].lines[0].unitPrice = 0;
    const two = plain((await b.get('api/state')).body);
    expect([two.drafts[0].status, two.drafts[0].lines[0].unitPrice]).toEqual(['draft', 1475]);
    const drafted = raw.find((e) => e.type === 'activity' && e.data.tool === 'draft_quote');
    const total = drafted.data.result.draft.total;
    drafted.data.result.draft.total = 1;
    drafted.data.actor = 'owner';
    const logged = plain((await b.get('api/activity')).body).find((e) => e.tool === 'draft_quote');
    expect([logged.actor, logged.result.draft.total]).toEqual(['agent', total]);
    expect(total).toBe(2212.5);
  });

  test("a tape with an agent-voice sidecar ships it, and the replay carries the agent's recorded voice", async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tailgate-pages-audio-'));
    const pcm = path.join(out, 'voice.pcm');
    fs.writeFileSync(pcm, Buffer.from(Array.from({ length: 64 }, (_, i) => i)));
    try {
      const built = await build(path.join(out, 'site'), { tape: FIXTURE, audio: pcm });
      expect(built.audio).toBe(AUDIO);
      expect(built.files).toContain(AUDIO);
      expect(fs.readFileSync(path.join(out, 'site', AUDIO))).toEqual(fs.readFileSync(pcm));
      const context = vm.createContext({ btoa });
      vm.runInContext(fs.readFileSync(path.join(out, 'site', BUNDLE), 'utf8'), context);
      expect(context.TailgateStatic.audioFile).toBe(AUDIO);
      const b = context.TailgateStatic.createBackend();
      expect(b.hasAudio).toBe(true);
      const voice = [];
      b.on((e) => {
        if (e.type === 'voice.audio') voice.push(e.data.data);
      });
      b.setAgentAudio(new Uint8Array(fs.readFileSync(pcm)).buffer);
      await playToEnd(b);
      expect(voice.length).toBeGreaterThan(0);
      expect([...Buffer.from(voice[0], 'base64')]).toEqual([0, 1, 2, 3, 4, 5]);
      expect([...Buffer.from(voice[1], 'base64')]).toEqual([6, 7, 8, 9, 10, 11]);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  test('without a sidecar the static replay is silent: no voice.audio events, and hasAudio says so', async () => {
    const { b, events } = backend();
    expect(b.hasAudio).toBe(false);
    await playToEnd(b);
    expect(events.filter((e) => e.type === 'voice.audio')).toEqual([]);
  });

  test('an unknown route throws instead of answering', async () => {
    const { b } = backend();
    await expect(b.get('api/events')).rejects.toThrow(/no route GET api\/events/);
    await expect(b.post('api/audio', {})).rejects.toThrow(/no route POST api\/audio/);
  });
});
