'use strict';

// The browser audio helpers in public/audio.js, loaded the way a page loads them (a plain
// script that sets a global) into a vm context with no browser around it.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const context = vm.createContext({ atob: (s) => Buffer.from(s, 'base64').toString('binary') });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'audio.js'), 'utf8'), context);
  return context.TailgateAudio;
}

const A = load();

test('loads without a browser and pins the Voice Agent API format: 24 kHz, 100 ms frames', () => {
  expect(A.RATE).toBe(24000);
  expect(A.FRAME_SAMPLES).toBe(2400);
});

test('float samples become clamped, rounded PCM16', () => {
  expect(Array.from(A.floatTo16(Float32Array.from([0, 1, -1, 0.5, -0.5, 2, -2])))).toEqual([0, 32767, -32768, 16384, -16384, 32767, -32768]);
});

test('resampling 48 kHz to 24 kHz halves the samples and keeps its place across chunks', () => {
  const r = A.createResampler(48000, 24000);
  const ramp = Float32Array.from({ length: 960 }, (_, i) => i / 960);
  const out = [...r.push(ramp.subarray(0, 333)), ...r.push(ramp.subarray(333, 700)), ...r.push(ramp.subarray(700))];
  expect(out.length).toBeGreaterThanOrEqual(479);
  expect(out.length).toBeLessThanOrEqual(480);
  out.forEach((v, i) => expect(v).toBeCloseTo((2 * i) / 960, 6));
});

test('resampling 44.1 kHz to 24 kHz interpolates between samples', () => {
  const r = A.createResampler(44100, 24000);
  const ramp = Float32Array.from({ length: 4410 }, (_, i) => i);
  const out = r.push(ramp);
  expect(out.length).toBeGreaterThanOrEqual(2399);
  expect(out.length).toBeLessThanOrEqual(2400);
  expect(out[1]).toBeCloseTo(44100 / 24000, 6);
});

test('the framer hands out whole 2,400-sample frames and keeps the remainder', () => {
  const frames = [];
  const f = A.createFramer(2400, (buffer) => frames.push(new Int16Array(buffer)));
  f.push(Int16Array.from({ length: 2000 }, (_, i) => i));
  expect(frames).toHaveLength(0);
  f.push(Int16Array.from({ length: 3000 }, (_, i) => 2000 + i));
  expect(frames).toHaveLength(2);
  expect(frames.map((fr) => [fr.byteLength, fr[0], fr[2399]])).toEqual([
    [4800, 0, 2399],
    [4800, 2400, 4799],
  ]);
});

test("the agent's voice decodes from base64 PCM16 little-endian", () => {
  const pcm = Buffer.alloc(8);
  [0, 16384, -16384, -32768].forEach((v, i) => pcm.writeInt16LE(v, i * 2));
  expect(Array.from(A.base64ToFloat32(pcm.toString('base64')))).toEqual([0, 0.5, -0.5, -1]);
  expect(Array.from(A.base64ToFloat32(''))).toEqual([]);
});
