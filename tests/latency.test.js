'use strict';

// Latencies and protocol order are measured from tapes, never assumed.

const fs = require('fs');
const { parseTape } = require('../src/voice/tape');
const { measureLatency, callOrder } = require('../src/voice/latency');
const { FIXTURE } = require('../scripts/make-sample-tape');

const tape = (lines) => ({ header: { type: 'tape.header', recordedAt: '2026-09-28T07:00:00.000Z', sessionId: 'sess_l', synthetic: false }, lines });

test('end of speech to first agent audio, and to the draft running in the gate', () => {
  const result = measureLatency(
    tape([
      { t: 1000, dir: 'in', event: { type: 'input.speech.stopped' } },
      { t: 1400, dir: 'in', event: { type: 'transcript.user', item_id: 'i1', text: 'two valves' } },
      { t: 1900, dir: 'in', event: { type: 'tool.call', call_id: 'c1', name: 'draft_quote', arguments: {} } },
      { t: 1900, dir: 'out', event: { type: 'tool.result', call_id: 'c1', result: '{}', is_error: false } },
      { t: 2600, dir: 'in', event: { type: 'reply.audio', audio_offset: 0, audio_bytes: 10 } },
      { t: 5000, dir: 'in', event: { type: 'input.speech.stopped' } },
      { t: 5100, dir: 'in', event: { type: 'tool.call', call_id: 'c2', name: 'draft_quote', arguments: {} } },
      { t: 5300, dir: 'in', event: { type: 'transcript.user', item_id: 'i2', text: 'three valves' } },
      { t: 5300, dir: 'out', event: { type: 'tool.result', call_id: 'c2', result: '{}', is_error: false } },
      { t: 5400, dir: 'in', event: { type: 'tool.call', call_id: 'c3', name: 'draft_quote', arguments: {} } },
      { t: 5400, dir: 'out', event: { type: 'tool.result', call_id: 'c3', result: '{"error":"x"}', is_error: true } },
      { t: 6000, dir: 'in', event: { type: 'reply.audio', audio_offset: 10, audio_bytes: 10 } },
    ]),
  );
  expect(result.turns.map((t) => [t.item_id, t.firstAudioMs, t.drafts.map((d) => d.draftMs)])).toEqual([
    ['i1', 1600, [900]],
    ['i2', 1000, [300]],
  ]);
  expect(result.endOfSpeechToFirstAudio).toEqual({ n: 2, min: 1000, median: 1300, max: 1600 });
  expect(result.endOfSpeechToDraft).toEqual({ n: 2, min: 300, median: 600, max: 900 });
  expect(result.synthetic).toBe(false);
});

test('a draft whose evidence wait ran out is timed to when it actually ran, not to its tool.call', () => {
  const result = measureLatency(
    tape([
      { t: 1000, dir: 'in', event: { type: 'input.speech.stopped' } },
      { t: 1400, dir: 'in', event: { type: 'transcript.user', item_id: 'i1', text: 'two valves' } },
      { t: 1900, dir: 'in', event: { type: 'tool.call', call_id: 'c1', name: 'draft_quote', arguments: {} } },
      { t: 4900, dir: 'out', event: { type: 'tool.result', call_id: 'c1', result: '{}', is_error: false } },
    ]),
  );
  expect(result.endOfSpeechToDraft).toEqual({ n: 1, min: 3900, median: 3900, max: 3900 });
});

test('the sample tape measures, and says it is synthetic', () => {
  const result = measureLatency(parseTape(fs.readFileSync(FIXTURE, 'utf8')));
  expect(result.synthetic).toBe(true);
  expect(result.endOfSpeechToFirstAudio.n).toBe(5);
  expect(result.endOfSpeechToDraft.n).toBe(3);
});

test('the event order around a hold call and an interactive call', () => {
  const sample = parseTape(fs.readFileSync(FIXTURE, 'utf8'));
  const hold = callOrder(sample, 'draft_quote');
  expect(hold.call_id).toBe('call_4');
  expect(hold.order.map((e) => `${e.dir}:${e.type}${e.status ? `(${e.status})` : ''}`)).toEqual([
    'in:tool.call',
    'out:tool.result',
    'in:reply.started',
    'in:input.speech.started',
    'in:reply.done(interrupted)',
  ]);
  expect(callOrder(sample, 'search_catalog').order[0]).toMatchObject({ ms: 0, type: 'tool.call', call_id: 'call_1' });
  expect(callOrder(sample, 'get_board')).toBeNull();
});
