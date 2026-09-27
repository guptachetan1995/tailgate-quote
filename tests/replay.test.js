'use strict';

// The replay provider: a tape played back through the real bridge and the real invoke()
// reproduces every recorded tool result (the drift check), on any day, at any speed, and a
// tape can draft but never send.

const fs = require('fs');
const path = require('path');
const seed = require('../fake-data/seed.json');
const { createStore } = require('../src/store');
const { createInvoke } = require('../src/invoke');
const { createBridge } = require('../src/voice/bridge');
const { ReplayVoiceProvider } = require('../src/voice/replay');
const { parseTape, tapeLabel, fingerprint } = require('../src/voice/tape');
const { OWNER_STEPS, AGENT_PANEL_STEPS, LINES } = require('../src/voice/scenario');
const { QUOTE_ARGS } = require('./helpers');
const { buildSampleTape, FIXTURE } = require('../scripts/make-sample-tape');

const SAMPLE = parseTape(fs.readFileSync(FIXTURE, 'utf8'));
const DAY = 24 * 60 * 60 * 1000;

async function replay(tape, opts = {}) {
  const provider = new ReplayVoiceProvider({ tape, speed: Infinity, ...opts });
  const store = createStore({ now: provider.now });
  const invoke = createInvoke(store);
  const bridge = createBridge({ provider, invoke, store, timers: provider.bridgeTimers });
  await bridge.start();
  await provider.done;
  const beforeStop = store.snapshot();
  await bridge.stop();
  return { provider, store, invoke, bridge, beforeStop };
}

const withLines = (tape, lines) => ({ header: tape.header, lines });

describe('the committed sample tape', () => {
  test('is labelled synthetic, recorded against the current seed, and current', async () => {
    expect(SAMPLE.header).toMatchObject({ synthetic: true, sessionId: 'sess_scripted_sample', seedHash: fingerprint(seed) });
    expect(tapeLabel(SAMPLE.header)).toBe('Scripted sample, not a recorded session');
    // If this fails, the scenario or the gate changed: run `npm run sample-tape`.
    expect(await buildSampleTape()).toBe(fs.readFileSync(FIXTURE, 'utf8'));
  });

  test('a recorded tape is labelled with its session id and date', () => {
    expect(tapeLabel({ synthetic: false, sessionId: 'sess_abc', recordedAt: '2026-09-28T07:00:00.000Z' })).toBe(
      'Replay of a real AssemblyAI Voice Agent session (sess_abc, recorded 2026-09-28)',
    );
  });
});

describe('replaying through the real gate', () => {
  test('every recorded tool result is reproduced (no drift)', async () => {
    const { provider } = await replay(SAMPLE);
    expect(provider.drift()).toEqual([]);
    expect(provider.replayed.size).toBe(7);
  });

  test('the tape drafts and revises but sends nothing; only the owner step sends', async () => {
    const { store, invoke, beforeStop } = await replay(SAMPLE);
    expect(beforeStop.drafts.map((d) => [d.id, d.kind, d.status])).toEqual([
      ['Q-1001', 'customer_quote', 'draft'],
      ['S-2001', 'supplier_request', 'draft'],
    ]);
    expect(beforeStop.drafts[0].total).toBe(2255);
    expect(beforeStop.outbox).toEqual([]);
    const spoken = beforeStop.turns.find((t) => t.text === LINES.U4);
    expect(spoken.spokenApproval).toBe(true);

    for (const step of AGENT_PANEL_STEPS.slice(0, 1)) expect(invoke(step.tool, step.args, 'agent').success).toBe(false);
    expect(store.snapshot().outbox).toEqual([]);
    for (const step of OWNER_STEPS) expect(invoke(step.tool, step.args, 'owner').success).toBe(true);
    expect(store.snapshot().drafts.map((d) => [d.id, d.status])).toEqual([
      ['Q-1001', 'sent'],
      ['S-2001', 'discarded'],
    ]);
  });

  test('timestamps come from the tape clock, so a replay three days later is identical', async () => {
    const first = await replay(SAMPLE);
    jest.useFakeTimers({ now: Date.parse(SAMPLE.header.recordedAt) + 3 * DAY });
    try {
      const later = await replay(SAMPLE);
      expect(later.provider.drift()).toEqual([]);
      expect(later.beforeStop).toEqual(first.beforeStop);
      const call = SAMPLE.lines.find((l) => l.dir === 'in' && l.event.type === 'tool.call' && l.event.name === 'draft_quote');
      expect(later.beforeStop.drafts[0].createdAt).toBe(new Date(Date.parse(SAMPLE.header.recordedAt) + call.t).toISOString());
      expect(later.beforeStop.leads[0].createdAt < SAMPLE.header.recordedAt).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a changed gate shows up as drift: changed, missing and unexpected results', async () => {
    const lines = SAMPLE.lines.map((l) => JSON.parse(JSON.stringify(l)));
    const recorded = lines.find((l) => l.dir === 'out' && l.event.type === 'tool.result' && l.event.call_id === 'call_4');
    recorded.event.result = recorded.event.result.replace(/"total":[0-9.]+/, '"total":1');
    const dropAt = lines.findIndex((l) => l.dir === 'in' && l.event.type === 'tool.call' && l.event.call_id === 'call_7');
    lines.splice(dropAt, 1);
    const extraAt = lines.findIndex((l) => l.dir === 'in' && l.event.type === 'tool.call' && l.event.call_id === 'call_1');
    lines.splice(extraAt, 0, { t: lines[extraAt].t, dir: 'in', event: { type: 'tool.call', call_id: 'call_extra', name: 'get_board', arguments: {} } });

    const { provider } = await replay(withLines(SAMPLE, lines));
    const drift = provider.drift();
    expect(drift.map((d) => [d.call_id, d.kind])).toEqual([
      ['call_4', 'changed'],
      ['call_7', 'missing'],
      ['call_extra', 'unexpected'],
    ]);
    expect(recorded.event.result).toContain('"total":1');
  });
});

describe('pacing', () => {
  const tape = {
    header: { type: 'tape.header', recordedAt: '2026-09-28T07:00:00.000Z', synthetic: true },
    lines: [
      { t: 100, dir: 'out', event: { type: 'session.update', session: {} } },
      { t: 400, dir: 'in', event: { type: 'session.ready', session_id: 'sess_p' } },
      { t: 1100, dir: 'in', event: { type: 'input.speech.started' } },
      { t: 2100, dir: 'in', event: { type: 'transcript.user.delta', item_id: 'i', text: 'Hello' } },
      { t: 4100, dir: 'in', event: { type: 'reply.audio', audio_offset: 0, audio_bytes: 4 } },
      { t: 4200, dir: 'out', event: { type: 'session.end' } },
      { t: 4300, dir: 'in', event: { type: 'session.ended', session_duration_seconds: 4, audio_duration_seconds: 4 } },
    ],
  };

  test('events arrive at their recorded offsets divided by the speed', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-10-05T10:00:00.000Z') });
    try {
      const provider = new ReplayVoiceProvider({ tape, speed: 2, readAudio: (offset, bytes) => `audio@${offset}+${bytes}` });
      const got = [];
      provider.on('message', (e) => got.push(e));
      await provider.connect();
      provider.send({ type: 'session.update', session: {} });
      expect(got.map((e) => e.type)).toEqual([]);
      jest.advanceTimersByTime(149);
      expect(got).toHaveLength(0);
      jest.advanceTimersByTime(1);
      expect(got.map((e) => e.type)).toEqual(['session.ready']);
      jest.advanceTimersByTime(350);
      expect(got.map((e) => e.type)).toEqual(['session.ready', 'input.speech.started']);
      jest.advanceTimersByTime(500);
      expect(got).toHaveLength(3);
      jest.advanceTimersByTime(1000);
      expect(got.at(-1)).toEqual({ type: 'reply.audio', data: 'audio@0+4', audio_offset: 0, audio_bytes: 4 });
      // The tape clock is recordedAt plus the latest delivered offset, whatever the wall clock says.
      expect(new Date(provider.now()).toISOString()).toBe('2026-09-28T07:00:04.100Z');
      // The playback runs to the recorded session.end (t 4200), not only to the last event.
      jest.advanceTimersByTime(49);
      let done = false;
      provider.done.then(() => {
        done = true;
      });
      await Promise.resolve();
      expect(done).toBe(false);
      jest.advanceTimersByTime(1);
      await provider.done;
      // session.ended waits for the client's session.end, as the service does.
      expect(got.map((e) => e.type)).not.toContain('session.ended');
      provider.send({ type: 'session.end' });
      expect(got.at(-1)).toEqual({ type: 'session.ended', session_duration_seconds: 4, audio_duration_seconds: 4 });
    } finally {
      jest.useRealTimers();
    }
  });

  test('stopping early skips the rest and still answers session.end', async () => {
    jest.useFakeTimers();
    try {
      const provider = new ReplayVoiceProvider({ tape });
      const got = [];
      provider.on('message', (e) => got.push(e.type));
      await provider.connect();
      provider.send({ type: 'session.update', session: {} });
      jest.advanceTimersByTime(1000);
      provider.send({ type: 'session.end' });
      jest.advanceTimersByTime(10000);
      expect(got).toEqual(['session.ready', 'input.speech.started', 'session.ended']);
    } finally {
      jest.useRealTimers();
    }
  });

  test('speed must be positive; nothing plays before the session.update', async () => {
    expect(() => new ReplayVoiceProvider({ tape, speed: 0 })).toThrow(/positive/);
    const provider = new ReplayVoiceProvider({ tape, speed: Infinity });
    const got = [];
    provider.on('message', (e) => got.push(e.type));
    expect(() => provider.send({ type: 'session.update' })).toThrow(/not connected/);
    await provider.connect();
    expect(got).toEqual([]);
    provider.send({ type: 'session.update', session: {} });
    expect(got).toEqual(['session.ready', 'input.speech.started', 'transcript.user.delta', 'reply.audio']);
    expect(provider.durationMs).toBe(4100);
    expect(provider.originMs).toBe(Date.parse('2026-09-28T07:00:00.100Z'));
  });
});

describe("the bridge's own waits run on the tape's timeline", () => {
  // A draft call that arrives while the next turn is still a partial waits (3 s of tape time)
  // for it; the turn comes too late, so the wait expires first, at t 5600, between two tape
  // events. Every speed must give that same order and those same timestamps.
  const tape = {
    header: { type: 'tape.header', recordedAt: '2026-09-28T07:00:00.000Z', synthetic: true },
    lines: [
      { t: 0, dir: 'out', event: { type: 'session.update', session: {} } },
      { t: 300, dir: 'in', event: { type: 'session.ready', session_id: 'sess_wait' } },
      { t: 2000, dir: 'in', event: { type: 'transcript.user', item_id: 'i1', text: LINES.U1 } },
      { t: 2300, dir: 'in', event: { type: 'transcript.user.delta', item_id: 'i2', text: 'Three' } },
      { t: 2600, dir: 'in', event: { type: 'tool.call', call_id: 'c1', name: 'draft_quote', arguments: QUOTE_ARGS } },
      { t: 3500, dir: 'in', event: { type: 'input.speech.started' } },
      { t: 6300, dir: 'in', event: { type: 'transcript.user', item_id: 'i2', text: LINES.U1B } },
      { t: 7000, dir: 'out', event: { type: 'session.end' } },
    ],
  };

  async function run(speed) {
    const provider = new ReplayVoiceProvider({ tape, speed });
    const store = createStore({ now: provider.now });
    const bridge = createBridge({ provider, invoke: createInvoke(store), store, timers: provider.bridgeTimers });
    await bridge.start();
    if (Number.isFinite(speed)) jest.advanceTimersByTime(8000 / speed);
    await provider.done;
    await bridge.stop();
    const snap = store.snapshot();
    return {
      order: store.activityLog().map((e) => e.tool),
      createdAt: snap.drafts[0].createdAt,
      refused: snap.drafts[0].refusals.map((r) => r.sku),
    };
  }

  test('speed Infinity, 1 and 4 all run the expired wait at the same tape moment', async () => {
    const instant = await run(Infinity);
    expect(instant).toEqual({ order: ['record_turn', 'draft_quote', 'record_turn'], createdAt: '2026-09-28T07:00:03.500Z', refused: ['BWK-BV34'] });
    jest.useFakeTimers();
    try {
      expect(await run(1)).toEqual(instant);
      expect(await run(4)).toEqual(instant);
    } finally {
      jest.useRealTimers();
    }
  });
});

test('typed turns from a text-only smoke tape are replayed as the turns they stood for', async () => {
  const tape = {
    header: { type: 'tape.header', recordedAt: '2026-09-28T07:00:00.000Z', synthetic: true },
    lines: [
      { t: 0, dir: 'out', event: { type: 'session.update', session: {} } },
      { t: 300, dir: 'in', event: { type: 'session.ready', session_id: 'sess_smoke' } },
      { t: 900, dir: 'out', event: { type: 'conversation.message', role: 'user', content: 'And a Panrite drain pan for Helen Marsh.' } },
      { t: 900, dir: 'out', event: { type: 'reply.create' } },
      { t: 1500, dir: 'in', event: { type: 'tool.call', call_id: 'c1', name: 'search_catalog', arguments: { query: 'Panrite' } } },
      { t: 1500, dir: 'out', event: { type: 'tool.result', call_id: 'c1', result: 'recorded', is_error: false } },
    ],
  };
  const { store } = await replay(tape);
  expect(store.state.turns).toEqual([expect.objectContaining({ itemId: 'text_1', text: 'And a Panrite drain pan for Helen Marsh.', at: '2026-09-28T07:00:00.300Z' })]);
});

test('the replay module stays browser-safe (no Node modules, no process)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'voice', 'replay.js'), 'utf8');
  const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  expect(requires.every((r) => r.startsWith('./'))).toBe(true);
  expect(src).not.toMatch(/process\.|__dirname|Buffer\./);
});
