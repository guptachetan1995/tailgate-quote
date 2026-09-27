'use strict';

const { parseWav, assertFormat, frames, silence, frameBytes, pace, encodeWav, durationMs } = require('../src/voice/wav');

// Builds a WAV the way macOS `say` does: an FLLR padding chunk between fmt and data.
function wav({ sampleRate = 24000, channels = 1, bits = 16, format = 1, pcm = new Uint8Array(4800).fill(7), fllr = true } = {}) {
  const chunks = [];
  const chunk = (id, body) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, 'ascii');
    head.writeUInt32LE(body.length, 4);
    chunks.push(head, Buffer.from(body));
    if (body.length % 2) chunks.push(Buffer.alloc(1));
  };
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(format, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE((sampleRate * channels * bits) / 8, 8);
  fmt.writeUInt16LE((channels * bits) / 8, 12);
  fmt.writeUInt16LE(bits, 14);
  chunk('fmt ', fmt);
  if (fllr) chunk('FLLR', Buffer.alloc(4043));
  chunk('data', pcm);
  const body = Buffer.concat(chunks);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length + 4, 4);
  riff.write('WAVE', 8, 'ascii');
  return Buffer.concat([riff, body]);
}

describe('parseWav', () => {
  test('walks RIFF chunks past an FLLR chunk (a fixed 44-byte header would be wrong)', () => {
    const pcm = new Uint8Array(4800).map((_, i) => i % 251);
    const file = wav({ pcm });
    expect(file.indexOf('data')).toBeGreaterThan(44);
    const parsed = parseWav(file);
    expect(parsed).toMatchObject({ sampleRate: 24000, channels: 1, bitsPerSample: 16 });
    expect(Buffer.from(parsed.data)).toEqual(Buffer.from(pcm));
  });

  test('rejects what it cannot stream', () => {
    expect(() => parseWav(Buffer.from('not a wav at all'))).toThrow(/RIFF/);
    expect(() => parseWav(wav({ bits: 8 }))).toThrow(/16-bit PCM/);
    expect(() => parseWav(wav({ format: 3 }))).toThrow(/16-bit PCM/);
  });

  test('a sample-rate or channel mismatch throws', () => {
    expect(() => assertFormat(parseWav(wav({ sampleRate: 16000 })), { sampleRate: 24000 })).toThrow(/16000 Hz; expected 24000/);
    expect(() => assertFormat(parseWav(wav({ channels: 2 })), { sampleRate: 24000 })).toThrow(/2 channels/);
    expect(() => assertFormat(parseWav(wav()), { sampleRate: 24000 })).not.toThrow();
  });
});

describe('frames', () => {
  test('50 ms at 24 kHz is 2,400 bytes; at 16 kHz 1,600', () => {
    expect(frameBytes(24000, 50)).toBe(2400);
    expect(frameBytes(16000, 50)).toBe(1600);
  });

  test('cuts PCM into equal frames and pads the last with silence', () => {
    const out = frames(new Uint8Array(5000).fill(1), { sampleRate: 24000 });
    expect(out.map((f) => f.length)).toEqual([2400, 2400, 2400]);
    expect(out[2].subarray(0, 200).every((b) => b === 1)).toBe(true);
    expect(out[2].subarray(200).every((b) => b === 0)).toBe(true);
    expect(silence({ sampleRate: 24000 }).length).toBe(2400);
  });
});

describe('pace', () => {
  test('never sends a frame ahead of real time, and does not drift', async () => {
    let clock = 1000;
    const timers = [];
    const later = (fn, ms) => timers.push({ fn, at: clock + ms });
    const sentAt = [];
    const done = pace(new Array(6).fill(new Uint8Array(1)), (_f, n) => sentAt.push([n, clock]), { frameMs: 50, now: () => clock, setTimeout: later });
    while (timers.length) {
      const next = timers.shift();
      clock = next.at + 3; // timers fire a little late, as real ones do
      next.fn();
    }
    await expect(done).resolves.toBe(6);
    for (const [n, at] of sentAt) expect(at).toBeGreaterThanOrEqual(1000 + n * 50);
    // Lateness does not accumulate: frame 5 is due at +250 ms and goes out at +253, not +265.
    expect(sentAt.at(-1)).toEqual([5, 1253]);
  });
});

test('encodeWav writes a WAV that parses back to the same PCM (the agent voice sidecar)', () => {
  const pcm = new Uint8Array(4800).map((_, i) => i % 256);
  const back = parseWav(encodeWav(pcm, { sampleRate: 24000 }));
  assertFormat(back, { sampleRate: 24000, channels: 1 });
  expect([...back.data]).toEqual([...pcm]);
  expect(durationMs(pcm, 24000)).toBe(100);
});
