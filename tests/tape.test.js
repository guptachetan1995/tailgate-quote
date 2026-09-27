'use strict';

const fs = require('fs');
const path = require('path');
const { createTapeWriter, parseTape, scrub, fingerprint, createTapeClock, recordingProvider, tapeHeader } = require('../src/voice/tape');
const { FakeVoiceProvider } = require('../src/voice/fake');

function record(events) {
  const lines = [];
  const audio = [];
  const writer = createTapeWriter({
    write: (l) => lines.push(l),
    writeAudio: (b64) => audio.push(b64),
    header: { recordedAt: '2026-09-28T07:00:00.000Z', seedHash: 'abc123', sessionId: 'sess_1', model: 'test-model' },
  });
  events.forEach(([dir, event], i) => writer.record(dir, event, i * 100));
  return { lines, audio, text: lines.join('\n') };
}

describe('tape writer scrubs at write time', () => {
  test('drops resume_token and every key containing "token", at any depth', () => {
    const { text } = record([
      ['in', { type: 'session.ready', session_id: 'sess_1', expires_at: 1, resume_token: 'SECRET-RESUME', config: { temp_token: 'SECRET-T', nested: { Token: 'SECRET-N' }, voice: 'anna' } }],
      ['in', { type: 'tool.call', call_id: 'c1', name: 'get_board', arguments: { access_token: 'SECRET-A' } }],
    ]);
    expect(text).not.toMatch(/SECRET/);
    expect(text).not.toMatch(/token/i);
    const { lines } = parseTape(text);
    expect(lines[0].event).toEqual({ type: 'session.ready', session_id: 'sess_1', expires_at: 1, config: { nested: {}, voice: 'anna' } });
  });

  test('strips query strings and fragments from URLs (signed URLs)', () => {
    expect(scrub({ audio_url: 'https://files.example.com/s/a.ogg?X-Amz-Signature=abc&X-Amz-Credential=def#t=1' })).toEqual({
      audio_url: 'https://files.example.com/s/a.ogg',
    });
    expect(scrub('wss://agents.example.com/v1/ws?token=abc')).toBe('wss://agents.example.com/v1/ws');
    expect(scrub('plain words? yes')).toBe('plain words? yes');
  });

  test('keeps only allowlisted fields per event type; unknown types keep only their type', () => {
    const { text } = record([
      ['in', { type: 'transcript.user', item_id: 'i1', text: 'hello', internal_debug: 'x' }],
      ['in', { type: 'brand.new.event', anything: 'at all' }],
      ['out', { type: 'tool.result', call_id: 'c1', result: '{"ok":true}', is_error: false }],
    ]);
    expect(parseTape(text).lines.map((l) => l.event)).toEqual([
      { type: 'transcript.user', item_id: 'i1', text: 'hello' },
      { type: 'brand.new.event' },
      { type: 'tool.result', call_id: 'c1', result: '{"ok":true}', is_error: false },
    ]);
  });

  test("a partial transcript keeps whichever documented shape it came in: { item_id, text }, { text } or { delta }", () => {
    const { text } = record([
      ['in', { type: 'transcript.user.delta', item_id: 'i1', text: 'New job' }],
      ['in', { type: 'transcript.user.delta', text: 'New job for' }],
      ['in', { type: 'transcript.user.delta', delta: 'hey there' }],
    ]);
    expect(parseTape(text).lines.map((l) => l.event)).toEqual([
      { type: 'transcript.user.delta', item_id: 'i1', text: 'New job' },
      { type: 'transcript.user.delta', text: 'New job for' },
      { type: 'transcript.user.delta', delta: 'hey there' },
    ]);
  });

  test('agent audio goes to the sidecar; microphone audio is never written', () => {
    const { lines, audio } = record([
      ['out', { type: 'input.audio', audio: 'TUlDLUFVRElP' }],
      ['in', { type: 'reply.audio', data: 'QUJDRA==' }],
      ['in', { type: 'reply.audio', data: 'RUZH' }],
    ]);
    expect(audio).toEqual(['QUJDRA==', 'RUZH']);
    const events = parseTape(lines.join('\n')).lines.map((l) => l.event);
    expect(events).toEqual([
      { type: 'reply.audio', audio_offset: 0, audio_bytes: 4 },
      { type: 'reply.audio', audio_offset: 4, audio_bytes: 3 },
    ]);
    expect(lines.join('\n')).not.toMatch(/TUlDLUFVRElP|QUJDRA/);
  });

  test('parseTape round-trips and rejects a tape without a header', () => {
    const { text } = record([['in', { type: 'input.speech.started' }]]);
    const tape = parseTape(text);
    expect(tape.header).toEqual({
      type: 'tape.header',
      recordedAt: '2026-09-28T07:00:00.000Z',
      seedHash: 'abc123',
      sessionId: 'sess_1',
      model: 'test-model',
      synthetic: false,
      label: null,
    });
    expect(tape.lines).toEqual([{ t: 0, dir: 'in', event: { type: 'input.speech.started' } }]);
    expect(() => parseTape('{"t":0,"dir":"in","event":{"type":"x"}}')).toThrow(/tape.header/);
    expect(() => parseTape(`${text}\n{"dir":"in"}`)).toThrow(/line 3/);
  });
});

describe('committed tapes and evidence carry no credentials', () => {
  const ROOT = path.join(__dirname, '..');
  const DIRS = ['tapes', 'docs/evidence', 'tests/fixtures'];

  function files(dir) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) return rel === path.join('tapes', 'raw') ? [] : files(rel);
      return /\.(jsonl?|txt|md)$/.test(e.name) ? [rel] : [];
    });
  }

  function keysOf(value, out = []) {
    if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        out.push(k);
        keysOf(v, out);
      }
    }
    return out;
  }

  test('no JSON key containing "token", no signed-URL parameters', () => {
    for (const rel of DIRS.flatMap(files)) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(text).not.toMatch(/X-Amz-|Signature=/);
      const docs = rel.endsWith('.jsonl') ? text.split('\n').filter(Boolean).map((l) => JSON.parse(l)) : rel.endsWith('.json') ? [JSON.parse(text)] : [];
      for (const doc of docs) for (const key of keysOf(doc)) expect(key).not.toMatch(/token/i);
    }
  });
});

describe('recording helpers', () => {
  test('the tape clock is recordedAt plus the latest offset, and never runs backwards', () => {
    const clock = createTapeClock('2026-09-28T07:00:00.000Z');
    expect(new Date(clock.now()).toISOString()).toBe('2026-09-28T07:00:00.000Z');
    clock.advance(1500);
    clock.advance(900);
    expect(new Date(clock.now()).toISOString()).toBe('2026-09-28T07:00:01.500Z');
    expect(() => createTapeClock('yesterday-ish')).toThrow(/not a date/);
  });

  test('fingerprint is stable and changes with the data', () => {
    expect(fingerprint({ a: 1 })).toBe(fingerprint({ a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
    expect(fingerprint({ a: 1 })).toMatch(/^[0-9a-f]{8}$/);
  });

  test('a recording provider writes each outgoing event before the answer it provokes', async () => {
    const lines = [];
    let t = 0;
    const clock = createTapeClock('2026-09-28T07:00:00.000Z');
    const writer = createTapeWriter({ write: (l) => lines.push(l), header: { recordedAt: '2026-09-28T07:00:00.000Z' } });
    const fake = new FakeVoiceProvider({ sessionId: 'sess_r' });
    const provider = recordingProvider(fake, { writer, elapsed: () => t, clock });
    const seen = [];
    provider.on('message', (e) => seen.push([e.type, clock.t]));
    await provider.connect();
    t = 250;
    provider.send({ type: 'session.update', session: { output: { voice: 'anna' } } });
    t = 400;
    fake.emit({ type: 'input.speech.started' });
    const tape = parseTape(lines.join('\n'));
    expect(tape.header).toEqual(tapeHeader({ recordedAt: '2026-09-28T07:00:00.000Z' }));
    expect(tape.lines.map((l) => [l.t, l.dir, l.event.type])).toEqual([
      [250, 'out', 'session.update'],
      [250, 'in', 'session.ready'],
      [400, 'in', 'input.speech.started'],
    ]);
    expect(seen).toEqual([
      ['session.ready', 250],
      ['input.speech.started', 400],
    ]);
  });
});
