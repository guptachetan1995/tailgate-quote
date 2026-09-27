// Browser audio for the local talk mode: the microphone as 24 kHz PCM16 mono frames (what the
// Voice Agent API takes), posted by the page to the local server, which relays them to the
// session it holds; and the agent's voice, which comes back as base64 PCM16 in server-sent
// events, scheduled gap-free on an AudioContext. The page never talks to AssemblyAI itself.
//
// The pure helpers (resampling, float to PCM16, base64 to samples, framing) are exported too,
// so the tests can check them without a browser.
(function (root) {
  'use strict';

  const RATE = 24000;
  const FRAME_SAMPLES = 2400; // 100 ms at 24 kHz

  // Linear-interpolating resampler that keeps its place across chunks, so frame boundaries
  // leave no clicks.
  function createResampler(fromRate, toRate) {
    const step = fromRate / toRate;
    let t = 0;
    let prev = 0;
    return {
      push(input) {
        const out = [];
        while (Math.floor(t) + 1 < input.length) {
          const i = Math.floor(t);
          const frac = t - i;
          const a = i < 0 ? prev : input[i];
          const b = input[i + 1];
          out.push(a + (b - a) * frac);
          t += step;
        }
        if (input.length > 0) {
          t -= input.length;
          prev = input[input.length - 1];
        }
        return Float32Array.from(out);
      },
    };
  }

  function floatTo16(samples) {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    }
    return out;
  }

  // Collects PCM16 samples and hands out whole frames of `size` samples as ArrayBuffers.
  function createFramer(size, onFrame) {
    let buffer = new Int16Array(size);
    let filled = 0;
    return {
      push(samples) {
        let i = 0;
        while (i < samples.length) {
          const n = Math.min(samples.length - i, size - filled);
          buffer.set(samples.subarray(i, i + n), filled);
          filled += n;
          i += n;
          if (filled === size) {
            onFrame(buffer.buffer);
            buffer = new Int16Array(size);
            filled = 0;
          }
        }
      },
    };
  }

  function base64ToFloat32(base64, decode = root.atob) {
    const binary = decode(String(base64 || ''));
    const count = Math.floor(binary.length / 2);
    const out = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      let v = binary.charCodeAt(2 * i) | (binary.charCodeAt(2 * i + 1) << 8);
      if (v >= 0x8000) v -= 0x10000;
      out[i] = v / 0x8000;
    }
    return out;
  }

  // Opens the microphone (the browser asks for permission) and calls onFrame(ArrayBuffer) with
  // 100 ms of 24 kHz PCM16 mono at a time. Echo cancellation is on; headphones still help.
  async function startMic({ onFrame, workletUrl = 'mic-worklet.js' }) {
    const stream = await root.navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const ctx = new root.AudioContext();
    try {
      await ctx.audioWorklet.addModule(workletUrl);
    } catch (err) {
      for (const track of stream.getTracks()) track.stop();
      ctx.close();
      throw err;
    }
    const source = ctx.createMediaStreamSource(stream);
    const node = new root.AudioWorkletNode(ctx, 'tailgate-mic');
    const mute = ctx.createGain();
    mute.gain.value = 0;
    const resampler = createResampler(ctx.sampleRate, RATE);
    const framer = createFramer(FRAME_SAMPLES, onFrame);
    node.port.onmessage = (e) => framer.push(floatTo16(resampler.push(e.data)));
    source.connect(node);
    // Connected through a muted gain so the browser keeps pulling audio through the worklet;
    // the owner never hears their own microphone.
    node.connect(mute).connect(ctx.destination);
    return {
      sampleRate: ctx.sampleRate,
      stop() {
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        for (const track of stream.getTracks()) track.stop();
        ctx.close();
      },
    };
  }

  // Plays the agent's voice chunks back to back. flush() stops it at once, for when the owner
  // talks over the agent.
  function createPlayer() {
    let ctx = null;
    let next = 0;
    const playing = new Set();
    const context = () => {
      if (!ctx) ctx = new root.AudioContext();
      return ctx;
    };
    return {
      // Call from a click so the browser lets the page make sound.
      unlock() {
        const c = context();
        if (c.state === 'suspended') c.resume();
      },
      play(base64) {
        const samples = base64ToFloat32(base64);
        if (samples.length === 0) return;
        const c = context();
        // Until a click lets the page make sound, chunks are dropped rather than piled up to
        // burst out all at once later.
        if (c.state !== 'running') return;
        const buffer = c.createBuffer(1, samples.length, RATE);
        buffer.copyToChannel(samples, 0);
        const src = c.createBufferSource();
        src.buffer = buffer;
        src.connect(c.destination);
        const at = Math.max(c.currentTime + 0.03, next);
        src.start(at);
        next = at + buffer.duration;
        playing.add(src);
        src.onended = () => playing.delete(src);
      },
      flush() {
        for (const src of playing) {
          try {
            src.stop();
          } catch {
            // already stopped
          }
        }
        playing.clear();
        next = 0;
      },
    };
  }

  root.TailgateAudio = { RATE, FRAME_SAMPLES, createResampler, floatTo16, createFramer, base64ToFloat32, startMic, createPlayer };
})(typeof window !== 'undefined' ? window : globalThis);
