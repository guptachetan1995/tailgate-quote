'use strict';

// The recording path end to end on virtual time: the feeder streams clips as paced 50 ms
// frames with silence between them, each clip waits for its gate (the agent's answer, or the
// scheduled barge-in), the recorder writes every event to a tape, and replaying that tape
// through a fresh store reproduces the recording exactly. The "service" is the fake provider,
// answering each clip the way the live Voice Agent would.

const { createStore } = require('../src/store');
const { createInvoke } = require('../src/invoke');
const { FakeVoiceProvider } = require('../src/voice/fake');
const { createRecorder } = require('../src/voice/recorder');
const { ReplayVoiceProvider } = require('../src/voice/replay');
const { createBridge } = require('../src/voice/bridge');
const { createTapeWriter, createTapeClock, parseTape } = require('../src/voice/tape');
const { LINES } = require('../src/voice/scenario');
const { buildPlan, ASKED_SIZE, evidenceOf } = require('../scripts/record-session');
const { QUOTE_ARGS } = require('./helpers');
const { virtualTime } = require('./fakes');

const RECORDED_AT = '2026-09-28T09:15:00.000Z';
const clip = (ms) => new Uint8Array((24000 * 2 * ms) / 1000).fill(7);
const CLIPS = { u1: clip(3000), u1b: clip(500), u2: clip(1500), u3: clip(1500), u4: clip(1000) };

const reply = (id, text, { done = true } = {}) => [
  { type: 'reply.started', reply_id: id },
  { type: 'transcript.agent.delta', delta: text },
  { type: 'reply.audio', data: 'AAAA' },
  ...(done ? [{ type: 'reply.done', reply_id: id, status: 'completed' }, { type: 'transcript.agent', text, interrupted: false }] : []),
];
const call = (id, name, args) => ({ type: 'tool.call', call_id: id, name, arguments: args });

// What the fake service says after each step starts or ends: [delayMs, events] pairs.
function agentScript({ askSize = true } = {}) {
  return {
    greeting: [[400, reply('r0', "Tailgate's open, Dave. Tell me about the job.")]],
    'end:u1': [
      [300, [{ type: 'input.speech.stopped' }, { type: 'transcript.user', item_id: 'i_u1', text: LINES.U1 }]],
      [500, [call('c1', 'search_catalog', { query: 'Brasswick ball valve' })]],
      [600, reply('r1', askSize ? 'Half-inch or three-quarter-inch ball valves?' : 'Got it.', { done: false })],
      [1400, [{ type: 'reply.done', reply_id: 'r1', status: 'completed' }, { type: 'transcript.agent', text: askSize ? 'Half-inch or three-quarter-inch ball valves?' : 'Got it.', interrupted: false }]],
    ],
    'end:u1b': [
      [300, [{ type: 'transcript.user', item_id: 'i_u1b', text: LINES.U1B }]],
      [700, [call('c2', 'draft_quote', QUOTE_ARGS)]],
      [500, reply('r2', "That's a draft for Priya Shah at two thousand", { done: false })],
    ],
    'start:u2': [
      [300, [{ type: 'input.speech.started' }]],
      [150, [{ type: 'reply.done', reply_id: 'r2', status: 'interrupted' }, { type: 'transcript.agent', text: "That's a draft for Priya Shah at two thousand", interrupted: true }]],
    ],
    'end:u2': [
      [300, [{ type: 'transcript.user', item_id: 'i_u2', text: LINES.U2 }]],
      [500, [call('c3', 'search_catalog', { query: 'Panrite drain pan' })]],
      [
        400,
        [
          call('c4', 'revise_quote', {
            draft_id: 'Q-1001',
            changes: [
              { op: 'set_qty', sku: 'FLX-PA34', qty: 30, heard: 'make that thirty feet of PEX' },
              { op: 'add', sku: 'PNR-DP24', qty: 1, heard: 'add a Panrite drain pan' },
            ],
          }),
        ],
      ],
      [500, reply('r3', 'Done. The new total is two thousand two hundred fifty-five dollars.')],
    ],
    'end:u3': [
      [300, [{ type: 'transcript.user', item_id: 'i_u3', text: LINES.U3 }]],
      [600, [call('c5', 'draft_supplier_request', { supplier: 'Northgate', lines: [{ sku: 'AQN-TX199', qty: 1, heard: 'the TX-199' }], needed_by: 'Thursday', needed_by_heard: 'for Thursday' })]],
      [500, reply('r4', 'Drafted a stock check to Northgate.')],
    ],
    'end:u4': [
      [300, [{ type: 'transcript.user', item_id: 'i_u4', text: LINES.U4 }]],
      [500, reply('r5', "I heard that, but I can't send anything. The quote's on Dave's screen, and only his tap sends it.")],
    ],
  };
}

async function record({ plan, script, maxSessionMs, feeder, closeAfterMs = null }) {
  const vt = virtualTime();
  const startedAt = vt.now();
  const clock = createTapeClock(RECORDED_AT);
  const store = createStore({ now: clock.now });
  const invoke = createInvoke(store);
  const lines = [];
  const writer = createTapeWriter({ write: (l) => lines.push(l), header: { recordedAt: RECORDED_AT } });
  const fake = new FakeVoiceProvider({ sessionId: 'sess_rec_test' });
  const log = [];
  const at = {};
  const schedule = (key) => {
    let delay = 0;
    for (const [ms, events] of script[key] || []) {
      delay += ms;
      vt.timers.setTimeout(() => {
        for (const e of events) fake.emit(e);
      }, delay);
    }
  };
  const recorder = createRecorder({
    provider: fake,
    store,
    invoke,
    writer,
    elapsed: () => vt.now() - startedAt,
    clock,
    plan,
    maxSessionMs,
    feeder,
    now: vt.now,
    timers: vt.timers,
    log: (e) => {
      log.push({ ...e, at: vt.now() - startedAt });
      if (e.type === 'session.ready') {
        schedule('greeting');
        if (closeAfterMs !== null) vt.timers.setTimeout(() => fake.close(), closeAfterMs);
      }
      if (e.type === 'step.start') {
        at[`start:${e.step}`] = vt.now() - startedAt;
        schedule(`start:${e.step}`);
      }
      if (e.type === 'step.end') schedule(`end:${e.step}`);
    },
  });
  const audioAt = [];
  recorder.bridge.on('wire', ({ dir, event }) => {
    if (dir === 'in' && event.type === 'reply.audio') audioAt.push(vt.now() - startedAt);
  });
  const result = await vt.until(recorder.run());
  return { result, store, fake, log, at, audioAt, tapeText: lines.join('\n'), elapsed: vt.now() - startedAt };
}

describe('recording a scripted take', () => {
  let take;
  beforeAll(async () => {
    take = await record({ plan: buildPlan({ smoke: false, clips: CLIPS, bargeInMs: 1500 }), script: agentScript() });
  });

  test('the clips play in order, each after its gate', () => {
    expect(take.log.filter((e) => e.type === 'step.start').map((e) => e.step)).toEqual(['u1', 'u1b', 'u2', 'u3', 'u4']);
    expect(take.log.filter((e) => e.type === 'gate.forced')).toEqual([]);
    expect(take.result).toMatchObject({ ok: true, sessionId: 'sess_rec_test', errors: [] });
  });

  test('the owner barges in 1.5 s after the read-back starts, while the agent is still talking', () => {
    const readBack = take.audioAt.find((t) => t > take.at['start:u1b']);
    expect(take.at['start:u2'] - readBack).toBeGreaterThanOrEqual(1500);
    expect(take.at['start:u2'] - readBack).toBeLessThan(1550);
    expect(take.log.find((e) => e.type === 'barge-in.late')).toBeUndefined();
  });

  test('audio is continuous 50 ms frames from session.ready, never ahead of the wall clock', () => {
    const frames = take.fake.sentOfType('input.audio');
    expect(frames.length).toBe(take.result.framesSent);
    for (const f of frames) expect(Buffer.from(f.audio, 'base64').length).toBe(2400);
    const readyAt = take.log.find((e) => e.type === 'session.ready').at;
    const doneAt = take.log.find((e) => e.type === 'plan.done').at;
    expect(frames.length).toBeLessThanOrEqual(Math.floor((doneAt - readyAt) / 50) + 1);
    expect(frames.length).toBeGreaterThanOrEqual(Math.floor((doneAt - readyAt) / 50) - 1);
    expect(take.result.bridge.droppedAudio).toBe(0);
  });

  test('the session is drafted and revised, nothing is sent, and it ends with session.end', () => {
    const s = take.store.snapshot();
    expect(s.drafts.map((d) => [d.id, d.status])).toEqual([
      ['Q-1001', 'draft'],
      ['S-2001', 'draft'],
    ]);
    expect(s.drafts[0].total).toBe(2255);
    expect(s.outbox).toEqual([]);
    expect(take.fake.sent.at(-1).type).toBe('session.end');
    expect(take.result.ended).toEqual({ session_duration_seconds: 0, audio_duration_seconds: 0 });
  });

  test('the tape holds every event but no microphone audio, and replays with no drift', async () => {
    const tape = parseTape(take.tapeText);
    const types = tape.lines.map((l) => `${l.dir}:${l.event.type}`);
    expect(types[0]).toBe('out:session.update');
    expect(types).not.toContain('out:input.audio');
    expect(types.filter((t) => t === 'out:tool.result')).toHaveLength(5);
    expect(types.at(-2)).toBe('out:session.end');
    expect(take.tapeText).not.toMatch(/resume_token|fake-resume-token/);

    const provider = new ReplayVoiceProvider({ tape, speed: Infinity });
    const store = createStore({ now: provider.now });
    const bridge = createBridge({ provider, invoke: createInvoke(store), store, timers: provider.bridgeTimers });
    await bridge.start();
    await bridge.stop();
    expect(provider.drift()).toEqual([]);
    expect(store.snapshot()).toEqual(take.store.snapshot());
  });
});

test('the answer to the size question is fed only if the agent asked it', async () => {
  const plan = buildPlan({ smoke: false, clips: CLIPS, bargeInMs: 1500 }).filter((s) => ['u1', 'u1b', 'u3'].includes(s.id));
  const take = await record({ plan, script: agentScript({ askSize: false }) });
  expect(take.log.filter((e) => e.type === 'step.start').map((e) => e.step)).toEqual(['u1', 'u3']);
  expect(take.log.find((e) => e.type === 'step.skipped')).toMatchObject({ step: 'u1b', lastAgentText: 'Got it.' });
  expect(ASKED_SIZE.test('Half-inch or three-quarter-inch ball valves?')).toBe(true);
  expect(ASKED_SIZE.test('Got it.')).toBe(false);
});

test('a silent service cannot run up the bill: gates open after maxWait and the session cap ends it', async () => {
  const plan = [
    { id: 'u1', clip: CLIPS.u1 },
    { id: 'u3', clip: CLIPS.u3 },
  ];
  const take = await record({ plan, script: {}, maxSessionMs: 20000, feeder: { maxWaitMs: 8000 } });
  expect(take.log.filter((e) => e.type === 'gate.forced').map((e) => e.step)).toEqual(['u1', 'u3']);
  expect(take.log.some((e) => e.type === 'session.limit')).toBe(true);
  expect(take.fake.sent.at(-1).type).toBe('session.end');
  expect(take.elapsed).toBeLessThan(21000);
});

test('the text-only smoke plan types each line instead of streaming audio', async () => {
  const plan = buildPlan({ smoke: true, clips: {} }).slice(0, 2);
  const take = await record({ plan, script: agentScript() });
  const typed = take.fake.sentOfType('conversation.message').map((m) => m.content);
  expect(typed).toEqual([LINES.U1, LINES.U1B]);
  expect(take.store.state.turns.map((t) => t.itemId)).toEqual(['text_1', 'i_u1', 'text_2', 'i_u1b']);
});

test('the clip plan needs every clip; evidence files drop every URL', () => {
  expect(() => buildPlan({ smoke: false, clips: { u1: CLIPS.u1 } })).toThrow(/clip u1b is missing/);
  expect(evidenceOf({ id: 's', audio_url: 'https://x/a.ogg?sig=1', nested: [{ recordingUrl: 'u', ok: 1 }] })).toEqual({ id: 's', nested: [{ ok: 1 }] });
});

test('a socket the service closes mid-take ends the take: not ok, no session.end after the close', async () => {
  const script = {
    greeting: [
      [400, reply('r0', "Tailgate's open, Dave. Tell me about the job.")],
      [2000, [{ type: 'session.error', code: 'internal_error', message: 'boom' }]],
    ],
  };
  const take = await record({ plan: buildPlan({ smoke: false, clips: CLIPS, bargeInMs: 1500 }), script, closeAfterMs: 3000 });
  expect(take.result).toMatchObject({ ok: false, errors: [{ code: 'internal_error', message: 'boom' }], closed: { code: 1000 } });
  expect(take.fake.sentOfType('session.end')).toEqual([]);
  expect(parseTape(take.tapeText).lines.some((l) => l.event.type === 'session.error')).toBe(true);
});
