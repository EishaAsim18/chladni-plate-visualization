/**
 * audioInput.js — Web Audio API: microphone capture and spectral analysis.
 *
 * AnalyserNode FFT → dominant frequency (parabolic bin refinement) and RMS amplitude.
 * Drives ω = 2πf and amplitude in the visualization (see main.js).
 */

const DEFAULT_FFT = 2048;
const SMOOTHING = 0.9;

export class AudioInput {
  constructor() {
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.stream = null;
    this.floatFreq = null;
    this.timeData = null;
    this.sensitivity = 1.2;
    this._smoothFreq = 120;
    this._smoothRms = 0;
  }

  async initMicrophone() {
    if (this.stream) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not expose microphone access (getUserMedia).");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = DEFAULT_FFT;
    this.analyser.smoothingTimeConstant = SMOOTHING;
    this.source.connect(this.analyser);

    this.floatFreq = new Float32Array(this.analyser.frequencyBinCount);
    this.timeData = new Uint8Array(this.analyser.fftSize);
    return true;
  }

  async resumeContext() {
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  isRunning() {
    return Boolean(this.stream && this.ctx && this.analyser && this.ctx.state === "running");
  }

  tryResume() {
    if (this.ctx?.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }
  }

  getDominantFrequency() {
    if (!this.analyser || !this.ctx || !this.floatFreq) return this._smoothFreq;

    this.analyser.getFloatFrequencyData(this.floatFreq);
    const sr = this.ctx.sampleRate;
    const binWidth = sr / this.analyser.fftSize;
    let max = -Infinity;
    let peakBin = 5;
    const hi = this.floatFreq.length - 2;
    for (let i = 5; i < hi; i++) {
      const v = this.floatFreq[i];
      if (v > max) {
        max = v;
        peakBin = i;
      }
    }
    if (!Number.isFinite(max) || max < -96) {
      return Math.max(20, Math.min(8000, this._smoothFreq));
    }
    const y0 = this.floatFreq[peakBin - 1];
    const y1 = this.floatFreq[peakBin];
    const y2 = this.floatFreq[peakBin + 1];
    const denom = y0 - 2 * y1 + y2;
    let delta = 0;
    if (Number.isFinite(denom) && Math.abs(denom) > 1e-4) {
      delta = 0.5 * (y0 - y2) / denom;
      delta = Math.max(-0.95, Math.min(0.95, delta));
    }
    const refinedBin = peakBin + delta;
    const raw = refinedBin * binWidth;
    this._smoothFreq += (raw - this._smoothFreq) * (1 - SMOOTHING);
    return Math.max(20, Math.min(8000, this._smoothFreq));
  }

  getAmplitude() {
    if (!this.analyser || !this.timeData) return this._smoothRms;

    this.analyser.getByteTimeDomainData(this.timeData);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const x = (this.timeData[i] - 128) / 128;
      sum += x * x;
    }
    const rms = Math.sqrt(sum / this.timeData.length);
    const scaled = Math.min(1, rms * this.sensitivity * 4);
    this._smoothRms += (scaled - this._smoothRms) * 0.15;
    return this._smoothRms;
  }

  setSensitivity(v) {
    this.sensitivity = Math.max(0.05, v);
  }

  dispose() {
    try {
      if (this.source) this.source.disconnect();
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
      }
      if (this.ctx) void this.ctx.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.stream = null;
    this.floatFreq = null;
    this.timeData = null;
  }
}
