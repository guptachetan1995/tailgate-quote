'use strict';

// WAV clips for the recording path: parse by walking RIFF chunks (macOS `say` writes an FLLR
// padding chunk before `data`, so a fixed 44-byte header is wrong), cut fixed-length frames, and
// pace them by the wall clock so audio never reaches the API faster than real time.

function fourcc(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

// Returns { sampleRate, channels, bitsPerSample, data } where data is a view of the PCM bytes.
function parseWav(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || fourcc(bytes, 0) !== 'RIFF' || fourcc(bytes, 8) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  let fmt = null;
  let data = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = fourcc(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      data = bytes.subarray(body, Math.min(body + size, bytes.length));
    }
    offset = body + size + (size % 2);
  }
  if (!fmt) throw new Error('WAV has no fmt chunk');
  if (!data) throw new Error('WAV has no data chunk');
  if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) throw new Error('WAV must be 16-bit PCM');
  return { sampleRate: fmt.sampleRate, channels: fmt.channels, bitsPerSample: fmt.bitsPerSample, data };
}

function assertFormat(wav, { sampleRate, channels = 1 }) {
  if (wav.sampleRate !== sampleRate) throw new Error(`WAV is ${wav.sampleRate} Hz; expected ${sampleRate} Hz`);
  if (wav.channels !== channels) throw new Error(`WAV has ${wav.channels} channels; expected ${channels}`);
}

function frameBytes(sampleRate, frameMs) {
  return (sampleRate * 2 * frameMs) / 1000;
}

// Cuts PCM16 mono into frames of frameMs; the last frame is padded with silence.
function frames(pcm, { sampleRate, frameMs = 50 }) {
  const size = frameBytes(sampleRate, frameMs);
  const out = [];
  for (let at = 0; at < pcm.length; at += size) {
    const frame = new Uint8Array(size);
    frame.set(pcm.subarray(at, Math.min(at + size, pcm.length)));
    out.push(frame);
  }
  return out;
}

function silence({ sampleRate, frameMs = 50 }) {
  return new Uint8Array(frameBytes(sampleRate, frameMs));
}

// Sends frames on a wall-clock schedule: frame n goes out no earlier than start + n * frameMs,
// computed from the start time rather than by sleeping a fixed amount, so timer drift never
// accumulates and the stream never runs ahead of real time.
function pace(frameList, send, { frameMs = 50, now = Date.now, setTimeout: later = setTimeout } = {}) {
  return new Promise((resolve) => {
    const start = now();
    let n = 0;
    const tick = () => {
      while (n < frameList.length) {
        const wait = start + n * frameMs - now();
        if (wait > 0) {
          later(tick, wait);
          return;
        }
        send(frameList[n], n);
        n += 1;
      }
      resolve(n);
    };
    tick();
  });
}

// A canonical 44-byte-header WAV around PCM16 mono bytes (for the agent's recorded voice).
function encodeWav(pcm, { sampleRate }) {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const ascii = (offset, s) => {
    for (let i = 0; i < 4; i += 1) out[offset + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

const durationMs = (pcm, sampleRate) => Math.round((pcm.length / 2 / sampleRate) * 1000);

module.exports = { parseWav, assertFormat, frames, silence, frameBytes, pace, encodeWav, durationMs };
