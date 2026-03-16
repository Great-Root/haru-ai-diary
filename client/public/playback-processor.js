// Playback AudioWorklet — based on Google's gemini-live-api-examples
// Runs in audio thread for glitch-free playback
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.audioQueue = [];
    this.wasPlaying = false;
    this.port.onmessage = (e) => {
      if (e.data === "interrupt") {
        this.audioQueue = [];
        this.wasPlaying = false;
      } else if (e.data instanceof Float32Array) {
        this.audioQueue.push(e.data);
        this.wasPlaying = true;
      }
    };
  }

  process(inputs, outputs) {
    const channel = outputs[0][0];
    let outputIndex = 0;

    while (outputIndex < channel.length && this.audioQueue.length > 0) {
      const currentBuffer = this.audioQueue[0];
      const copyLength = Math.min(channel.length - outputIndex, currentBuffer.length);
      for (let i = 0; i < copyLength; i++) {
        channel[outputIndex++] = currentBuffer[i];
      }
      if (copyLength < currentBuffer.length) {
        this.audioQueue[0] = currentBuffer.slice(copyLength);
      } else {
        this.audioQueue.shift();
      }
    }

    // Fill remaining with silence
    while (outputIndex < channel.length) {
      channel[outputIndex++] = 0;
    }

    // Track playback end: count frames where queue is empty after audio was playing
    if (this.wasPlaying && this.audioQueue.length === 0) {
      if (!this.emptyFrames) this.emptyFrames = 0;
      this.emptyFrames++;
      // 24kHz / 128 samples ≈ 187 frames/sec → 37 frames ≈ 200ms
      if (this.emptyFrames > 37) {
        this.wasPlaying = false;
        this.emptyFrames = 0;
        this.port.postMessage("playbackEnd");
      }
    } else {
      this.emptyFrames = 0;
    }

    return true;
  }
}

registerProcessor("playback-processor", PlaybackProcessor);
