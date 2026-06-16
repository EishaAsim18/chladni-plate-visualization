/**
 * builtInTone.js — Web Audio sine oscillator for stable demo pitches.
 *
 * Frequencies sit near the midpoints of MODE_BANDS in main.js so Audio-driven (m, n)
 * matches the same mapping as a clean microphone tone — without room noise.
 */

/** Midpoints of main.js MODE_BANDS for each (m, n) offered in the UI. */
export const BUILTIN_PRESETS = [
  { value: "1,1", m: 1, n: 1, hz: 75, label: "(1, 1) — fundamental · ~75 Hz" },
  { value: "2,1", m: 2, n: 1, hz: 112.5, label: "(2, 1) · ~113 Hz" },
  { value: "1,2", m: 1, n: 2, hz: 142.5, label: "(1, 2) · ~143 Hz" },
  { value: "2,2", m: 2, n: 2, hz: 177.5, label: "(2, 2) · ~178 Hz" },
  { value: "3,2", m: 3, n: 2, hz: 225, label: "(3, 2) · ~225 Hz" },
  { value: "3,3", m: 3, n: 3, hz: 340, label: "(3, 3) · ~340 Hz" },
  { value: "4,3", m: 4, n: 3, hz: 425, label: "(4, 3) · ~425 Hz" },
  { value: "5,4", m: 5, n: 4, hz: 750, label: "(5, 4) · ~750 Hz" },
];

export class BuiltInTone {
  constructor() {
    this.ctx = null;
    this.osc = null;
    this.gain = null;
    /** @type {number} */
    this._hz = 440;
    /** Synthetic “mic RMS” for particle coupling (0–1). */
    this._vizAmp = 0.62;
  }

  isRunning() {
    return Boolean(this.ctx && this.osc && this.ctx.state === "running");
  }

  getFrequencyHz() {
    return this.isRunning() ? this._hz : 0;
  }

  /** Amplitude scalar for visualization when tone is on (no FFT). */
  getVizAmplitude() {
    return this.isRunning() ? this._vizAmp : 0;
  }

  async resumeContext() {
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }
  }

  tryResume() {
    if (this.ctx?.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }
  }

  /**
   * @param {number} hz
   * @param {{ gain?: number }} [opts]
   */
  async start(hz, opts = {}) {
    await this.stop();
    const gain = typeof opts.gain === "number" ? opts.gain : 0.055;
    this._hz = Math.max(45, Math.min(8000, hz));

    this.ctx = new AudioContext();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = gain;

    this.osc = this.ctx.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = this._hz;
    this.osc.connect(this.gain);
    this.gain.connect(this.ctx.destination);
    this.osc.start(0);

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  async stop() {
    try {
      if (this.osc) {
        try {
          this.osc.stop(0);
        } catch {
          /* already stopped */
        }
        this.osc.disconnect();
      }
      if (this.gain) this.gain.disconnect();
      if (this.ctx) await this.ctx.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.osc = null;
    this.gain = null;
  }
}
