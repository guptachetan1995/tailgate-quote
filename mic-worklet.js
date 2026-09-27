'use strict';

// Runs on the audio thread: hands the microphone's samples to the page in blocks of about
// 40 ms, which resamples them to 24 kHz PCM16 and posts them to the local server.
const BLOCK = 2048;

class TailgateMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(BLOCK);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      let i = 0;
      while (i < channel.length) {
        const n = Math.min(channel.length - i, BLOCK - this.filled);
        this.buffer.set(channel.subarray(i, i + n), this.filled);
        this.filled += n;
        i += n;
        if (this.filled === BLOCK) {
          this.port.postMessage(this.buffer.slice(0));
          this.filled = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('tailgate-mic', TailgateMic);
