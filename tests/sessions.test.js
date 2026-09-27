'use strict';

// The session hub shared by the server and the static demo, and the virtual clock the static
// demo plays tapes on.

const fs = require('fs');
const { createStore } = require('../src/store');
const { createInvoke } = require('../src/invoke');
const { createSessions } = require('../src/voice/sessions');
const { createVirtualTime } = require('../src/voice/virtual-time');
const { FakeVoiceProvider } = require('../src/voice/fake');
const { ReplayVoiceProvider } = require('../src/voice/replay');
const { parseTape } = require('../src/voice/tape');
const { LINES } = require('../src/voice/scenario');
const { FIXTURE } = require('../scripts/make-sample-tape');
const { T0, QUOTE_ARGS } = require('./helpers');

const SAMPLE = parseTape(fs.readFileSync(FIXTURE, 'utf8'));
const flush = () => new Promise((resolve) => setImmediate(resolve));

function hub(voices, { now = () => T0 } = {}) {
  const store = createStore({ now });
  const invoke = createInvoke(store);
  const events = [];
  const sessions = createSessions({ store, invoke, voices, broadcast: (type, data) => events.push({ type, data }) });
  return { store, invoke, sessions, events };
}

describe('virtual time', () => {
  test('runs timers in time order, only when advanced, with now() at each timer', () => {
    const time = createVirtualTime();
    const ran = [];
    time.setTimeout(() => ran.push(['b', time.now()]), 200);
    time.setTimeout(() => ran.push(['a', time.now()]), 100);
    const c = time.setTimeout(() => ran.push(['c', time.now()]), 150);
    time.setTimeout(() => ran.push(['a2', time.now()]), 100);
    time.clearTimeout(c);
    expect(ran).toEqual([]);
    time.advance(99);
    expect(ran).toEqual([]);
    time.advance(1);
    expect(ran).toEqual([
      ['a', 100],
      ['a2', 100],
    ]);
    time.advanceTo(1000);
    expect(ran.at(-1)).toEqual(['b', 200]);
    expect(time.now()).toBe(1000);
    expect(time.pending()).toBe(0);
  });

  test('a timer set by a timer runs in the same advance when due; runAll stops a runaway', () => {
    const time = createVirtualTime();
    const ran = [];
    time.setTimeout(() => {
      ran.push(time.now());
      time.setTimeout(() => ran.push(time.now()), 50);
    }, 10);
    time.advance(100);
    expect(ran).toEqual([10, 60]);
    const again = () => time.setTimeout(again, 1);
    again();
    expect(() => time.runAll(500)).toThrow(/reschedules forever/);
  });

  test('a tape replayed on it can be paused, resumed and skipped to its end', async () => {
    const time = createVirtualTime();
    const { sessions, store } = hub([{ mode: 'replay', timers: time, create: () => new ReplayVoiceProvider({ tape: SAMPLE, now: time.now, timers: time }) }]);
    await sessions.start({ mode: 'replay' });
    time.advance(25000);
    expect(store.snapshot().drafts).toEqual([]);
    time.advance(1000);
    expect(store.snapshot().drafts.map((d) => d.id)).toEqual(['Q-1001']);
    time.runAll();
    await flush();
    expect(store.snapshot().drafts.map((d) => d.id)).toEqual(['Q-1001', 'S-2001']);
    expect(sessions.describe().active).toBe(false);
  });
});

describe('the session hub', () => {
  test('with no voice configured, start is a 404; describe lists no modes', async () => {
    const { sessions } = hub([]);
    expect(sessions.describe()).toEqual({ modes: [], active: false, mode: null, label: null, status: null });
    expect(await sessions.start({})).toMatchObject({ status: 404 });
    expect(await sessions.stop()).toMatchObject({ status: 409 });
    expect(sessions.sendAudio('AAAA')).toMatchObject({ status: 409 });
  });

  test('the first mode is the default; an unknown mode or field is a 400 that names what is offered', async () => {
    const made = [];
    const voice = (mode) => ({ mode, label: `the ${mode} one`, create: () => made[made.push(new FakeVoiceProvider()) - 1] });
    const { sessions } = hub([voice('replay'), voice('other')]);
    expect(await sessions.start({ mode: 'live' })).toMatchObject({ status: 400, body: { error: expect.stringMatching(/"replay" or "other"; "live" is not offered here\. Live mode needs/) } });
    expect(await sessions.start({ mode: 'replay', extra: 1 })).toMatchObject({ status: 400, body: { error: expect.stringMatching(/Unexpected field\(s\): extra/) } });
    expect(await sessions.start('replay')).toMatchObject({ status: 400 });
    expect(made).toHaveLength(0);
    expect(await sessions.start(undefined)).toMatchObject({ status: 200, body: { active: true, mode: 'replay', label: 'the replay one' } });
    expect(await sessions.start({ mode: 'other' })).toMatchObject({ status: 409 });
    expect(await sessions.stop()).toMatchObject({ status: 200, body: { active: false, status: { ended: true } } });
    expect(await sessions.start({ mode: 'other' })).toMatchObject({ status: 200, body: { mode: 'other' } });
    expect(made).toHaveLength(2);
  });

  test("forwards the session's events as voice.*, stamped with ms on the store's clock", async () => {
    let now = T0;
    const provider = new FakeVoiceProvider();
    const { sessions, events } = hub([{ mode: 'fake', create: () => provider }], { now: () => now });
    await sessions.start({});
    now += 1500;
    provider.emit({ type: 'transcript.user.delta', item_id: 'item_u1', text: 'New job' });
    now += 500;
    provider.emit({ type: 'transcript.agent.delta', delta: 'Got it' });
    provider.emit({ type: 'reply.audio', data: 'AAAA' });
    provider.emit({ type: 'reply.audio', data: '' });
    const voice = events.filter((e) => e.type !== 'activity');
    expect(voice.find((e) => e.type === 'voice.start').data).toMatchObject({ mode: 'fake', ms: 0 });
    expect(voice.find((e) => e.type === 'voice.ready').data).toEqual({ session_id: 'sess_fake_0001', ms: 0 });
    expect(voice.find((e) => e.type === 'voice.partial').data).toEqual({ item_id: 'item_u1', text: 'New job', ms: 1500 });
    expect(voice.find((e) => e.type === 'voice.agentDelta').data).toEqual({ delta: 'Got it', ms: 2000 });
    expect(voice.filter((e) => e.type === 'voice.audio').map((e) => e.data)).toEqual([{ data: 'AAAA', ms: 2000 }]);
  });

  test('the bridge runs on the voice\'s own timers: an evidence wait on virtual time waits for virtual time', async () => {
    const time = createVirtualTime();
    const provider = new FakeVoiceProvider();
    const { sessions, store } = hub([{ mode: 'fake', timers: time, create: () => provider }]);
    await sessions.start({});
    provider.emit({ type: 'transcript.user', item_id: 'item_u1', text: LINES.U1 });
    provider.emit({ type: 'transcript.user', item_id: 'item_u1b', text: LINES.U1B });
    provider.emit({ type: 'transcript.user.delta', item_id: 'item_u2', text: 'Actually, make' });
    provider.emit({ type: 'tool.call', call_id: 'call_q', name: 'draft_quote', arguments: QUOTE_ARGS });
    expect(store.snapshot().drafts).toEqual([]);
    time.advance(2999);
    expect(store.snapshot().drafts).toEqual([]);
    time.advance(1);
    expect(store.snapshot().drafts.map((d) => d.id)).toEqual(['Q-1001']);
    expect(provider.sentOfType('tool.result')).toHaveLength(1);
  });

  test('a stop that arrives while the session is still starting ends that session once it opens', async () => {
    const provider = new FakeVoiceProvider();
    let open;
    provider.connect = () =>
      new Promise((resolve) => {
        open = () => {
          provider.connected = true;
          resolve();
        };
      });
    const { sessions } = hub([{ mode: 'live', create: () => provider }]);
    const starting = sessions.start({ mode: 'live' });
    const stopping = sessions.stop();
    expect(sessions.active()).toBe(false);
    open();
    expect(await starting).toMatchObject({ status: 409, body: { error: expect.stringMatching(/stopped before it finished starting/) } });
    expect(await stopping).toMatchObject({ status: 200 });
    expect(provider.sent.map((e) => e.type)).toEqual(['session.update', 'session.end']);
    expect(provider.closed).toBe(true);
  });

  test("a tape's session times count from its session.update, the zero its duration counts from", async () => {
    const tape = {
      header: { type: 'tape.header', recordedAt: '2026-09-28T07:00:00.000Z', synthetic: true },
      lines: [
        { t: 1000, dir: 'out', event: { type: 'session.update', session: {} } },
        { t: 1400, dir: 'in', event: { type: 'session.ready', session_id: 'sess_late' } },
        { t: 3000, dir: 'in', event: { type: 'transcript.user.delta', item_id: 'i', text: 'New job' } },
        { t: 5000, dir: 'out', event: { type: 'session.end' } },
        { t: 5100, dir: 'in', event: { type: 'session.ended', session_duration_seconds: 4, audio_duration_seconds: 4 } },
      ],
    };
    let provider = null;
    const create = () => {
      provider = new ReplayVoiceProvider({ tape, speed: Infinity });
      return provider;
    };
    const { sessions, events } = hub([{ mode: 'replay', create }], { now: () => (provider ? provider.now() : T0) });
    await sessions.start({ mode: 'replay' });
    await flush();
    const of = (type) => events.find((e) => e.type === type).data;
    expect(of('voice.start')).toMatchObject({ durationMs: 4000, ms: 0 });
    expect(of('voice.partial').ms).toBe(2000);
    expect(events.filter((e) => e.type === 'voice.progress').at(-1).data.durationMs).toBe(4000);
    expect(of('voice.close').ms).toBeGreaterThanOrEqual(4000);
  });

  test('a provider that cannot connect is a 502 and leaves no session behind', async () => {
    const provider = new FakeVoiceProvider();
    provider.connect = () => Promise.reject(new Error('AssemblyAI refused the session token request (HTTP 404): [redacted]'));
    const { sessions } = hub([{ mode: 'live', create: () => provider }]);
    expect(await sessions.start({ mode: 'live' })).toEqual({ status: 502, body: { error: 'AssemblyAI refused the session token request (HTTP 404): [redacted]' } });
    expect(sessions.active()).toBe(false);
  });

  test('a tape that plays to its end ends its session with session.end; a live provider (no done) does not', async () => {
    const replayed = [];
    const { sessions, events } = hub([
      {
        mode: 'replay',
        create: () => {
          const p = new ReplayVoiceProvider({ tape: SAMPLE, speed: Infinity });
          const send = p.send.bind(p);
          p.send = (e) => {
            replayed.push(e.type);
            send(e);
          };
          return p;
        },
      },
      { mode: 'fake', create: () => new FakeVoiceProvider() },
    ]);
    await sessions.start({ mode: 'replay' });
    await flush();
    expect(sessions.active()).toBe(false);
    expect(replayed.at(-1)).toBe('session.end');
    expect(events.at(-1)).toMatchObject({ type: 'voice.close' });
    expect(events.filter((e) => e.type === 'voice.progress').at(-1).data).toMatchObject({ index: 64, total: 64, durationMs: 67910 });

    await sessions.start({ mode: 'fake' });
    await flush();
    expect(sessions.active()).toBe(true);
    await sessions.stop();
  });
});
