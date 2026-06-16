/**
 * main.js — ties audio input, eigenmode math, Three.js visualization, particles, and UI.
 *
 * Plate mathematics uses (x, y) in [−1,1]²; see mathEngine.js and visualization.js.
 */

import { AudioInput } from "./audioInput.js";
import { BuiltInTone, BUILTIN_PRESETS } from "./builtInTone.js";
import { ChladniVisualization } from "./visualization.js";
import { PlateParticles } from "./particles.js";
import { initUI } from "./ui.js";

const canvas = document.getElementById("c3d");
const video = document.getElementById("webcam");

const audio = new AudioInput();
const builtIn = new BuiltInTone();
const viz = new ChladniVisualization(canvas);
const particleCount =
  typeof matchMedia !== "undefined" && matchMedia("(max-width: 900px)").matches ? 2400 : 4000;
const particles = new PlateParticles(particleCount, 1);
viz.scene.add(particles.points);

let modePresetValue = "auto";
let lastFrameTime = performance.now();
let fps = 60;
let fpsFrames = 0;
let fpsTimer = 0;

/**
 * Heavily smoothed frequency (Hz) used only to pick (m, n) in Audio-driven mode.
 * Raw FFT peaks jump frame-to-frame; without this, mode shapes flicker unrealistically.
 */
let smoothedFreqForModes = 180;

/** User opt-in: slow orbit; never forced on by pause/resume. */
let userWantsCameraOrbit = false;

/** In Audio-driven mode, freeze (m,n) at snapshot while enabled. */
let holdAutoPattern = false;
/** @type {{ m: number, n: number } | null} */
let heldAutoMN = null;

/** Cap on ω in cos(ωt) — lower = calmer standing-wave motion. */
const OMEGA_VISUAL_CAP = 7.5;

/**
 * Frequency bands → (m, n). Real plates do not map a single FFT bin to (m,n) this way;
 * this is a stable, didactic mapping so patterns change only when sustained pitch crosses a band.
 */
const MODE_BANDS = [
  [1, 1, 55, 95],
  [2, 1, 95, 130],
  [1, 2, 130, 155],
  [2, 2, 155, 200],
  [3, 2, 200, 250],
  [2, 3, 250, 300],
  [3, 3, 300, 380],
  [4, 3, 380, 470],
  [3, 4, 470, 560],
  [4, 4, 560, 680],
  [5, 4, 680, 820],
  [4, 5, 820, 980],
  [5, 5, 980, 1200],
  [6, 5, 1200, 1500],
  [5, 6, 1500, 1850],
  [6, 6, 1850, 2300],
  [7, 5, 2300, 2900],
  [6, 7, 2900, 3600],
  [7, 7, 3600, 4500],
  [8, 6, 4500, 6000],
  [8, 8, 6000, 9000],
];

function modesFromStableBands(fHz) {
  const f = Math.max(45, Math.min(8500, fHz || 120));
  for (const row of MODE_BANDS) {
    const [m, n, lo, hi] = row;
    if (f >= lo && f < hi) return { m, n };
  }
  const last = MODE_BANDS[MODE_BANDS.length - 1];
  return { m: last[0], n: last[1] };
}

function hzForBuiltinPreset(value) {
  const row = BUILTIN_PRESETS.find((p) => p.value === value);
  return row ? row.hz : BUILTIN_PRESETS[0].hz;
}


function resizeAll() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  viz.resize(w, h);
}

window.addEventListener("resize", resizeAll);
resizeAll();

const sensitivityEl = document.getElementById("sensitivity");
const freqScaleEl = document.getElementById("freqScale");
const intensityEl = document.getElementById("intensity");

const ui = initUI({
  sensitivity: document.getElementById("sensitivity"),
  sensitivityVal: document.getElementById("sensitivityVal"),
  freqScale: document.getElementById("freqScale"),
  freqScaleVal: document.getElementById("freqScaleVal"),
  intensity: document.getElementById("intensity"),
  intensityVal: document.getElementById("intensityVal"),
  pauseBtn: document.getElementById("pauseBtn"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),
  modePreset: document.getElementById("modePreset"),
  viewMode: document.getElementById("viewMode"),
  nodalGeometryToggle: document.getElementById("nodalGeometryToggle"),
  heatmapToggle: document.getElementById("heatmapToggle"),
  contourToggle: document.getElementById("contourToggle"),
  micBtn: document.getElementById("micBtn"),
  camBtn: document.getElementById("camBtn"),
  builtinBtn: document.getElementById("builtinBtn"),
  builtinPreset: document.getElementById("builtinPreset"),
  metricFreq: document.getElementById("metricFreq"),
  metricAmp: document.getElementById("metricAmp"),
  metricMode: document.getElementById("metricMode"),
  metricEq: document.getElementById("metricEq"),
  metricOmega: document.getElementById("metricOmega"),
  metricNodal: document.getElementById("metricNodal"),
  metricFps: document.getElementById("metricFps"),
  statusBanner: document.getElementById("statusBanner"),
  sessionStatus: document.getElementById("sessionStatus"),
  stripFps: document.getElementById("stripFps"),
  stripFreq: document.getElementById("stripFreq"),
  stripAmp: document.getElementById("stripAmp"),
  stripMode: document.getElementById("stripMode"),
  stripOmega: document.getElementById("stripOmega"),
  cameraOrbitToggle: document.getElementById("cameraOrbitToggle"),
  holdPatternToggle: document.getElementById("holdPatternToggle"),
  onPauseToggle: () => {
    viz.paused = !viz.paused;
    viz.setAutoRotate(userWantsCameraOrbit && !viz.paused);
    ui.setPauseLabel(viz.paused);
  },
  onFullscreen: async () => {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement) await el.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch (e) {
      ui.showBanner(`Fullscreen: ${e?.message || e}`, 4000);
    }
  },
  onModePreset: (v) => {
    modePresetValue = v;
    if (v === "auto" && holdAutoPattern) {
      heldAutoMN = modesFromStableBands(smoothedFreqForModes);
    }
  },
  onCameraOrbit: (on) => {
    userWantsCameraOrbit = Boolean(on);
    viz.setAutoRotate(userWantsCameraOrbit && !viz.paused);
  },
  onHoldAutoPattern: (on) => {
    holdAutoPattern = Boolean(on);
    if (holdAutoPattern && modePresetValue === "auto") {
      heldAutoMN = modesFromStableBands(smoothedFreqForModes);
    } else {
      heldAutoMN = null;
    }
  },
  onViewMode: (v) => viz.setViewMode(v),
  onNodalGeometry: (on) => viz.setNodalGeometryMode(on),
  onHeatmap: (on) => viz.setHeatmap(on),
  onContour: (on) => viz.setMeshEdges(on),
  onMic: async () => {
    if (audio.stream) {
      audio.dispose();
      ui.setMicActive(false);
      ui.showBanner("Microphone stopped.", 2400);
      return;
    }
    if (builtIn.isRunning()) {
      await builtIn.stop();
      ui.setBuiltinActive(false);
    }
    try {
      await audio.initMicrophone();
      await audio.resumeContext();
      if (!audio.isRunning()) await audio.resumeContext();
      ui.setMicActive(true);
      ui.showBanner("Microphone active — steady tones give the clearest mode response.", 4200);
    } catch (e) {
      ui.setMicActive(false);
      const name = e?.name || "";
      const hint =
        name === "NotAllowedError"
          ? " Allow access in the browser, or use HTTPS when not on localhost."
          : "";
      ui.showBanner(`Microphone: ${e?.message || String(e)}.${hint}`, 6500);
    }
  },
  onCam: async () => {
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      ui.setCamActive(false);
      ui.showBanner("Camera stopped.", 2400);
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API not available in this context.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      ui.setCamActive(true);
      ui.showBanner("Camera active — plate renders over the live feed.", 3600);
    } catch (e) {
      ui.setCamActive(false);
      const name = e?.name || "";
      const hint =
        name === "NotAllowedError"
          ? " Use HTTPS on mobile devices, or allow camera for this site."
          : "";
      ui.showBanner(`Camera: ${e?.message || String(e)}.${hint}`, 6500);
    }
  },
  onBuiltinToggle: async () => {
    if (builtIn.isRunning()) {
      await builtIn.stop();
      ui.setBuiltinActive(false);
      ui.showBanner("Demo tone stopped.", 2200);
      return;
    }
    if (audio.isRunning()) {
      audio.dispose();
      ui.setMicActive(false);
    }
    const preset = document.getElementById("builtinPreset")?.value ?? "1,1";
    const hz = hzForBuiltinPreset(preset);
    try {
      await builtIn.start(hz);
      await builtIn.resumeContext();
      ui.setBuiltinActive(true);
      ui.showBanner(
        "Demo tone playing — use Audio-driven (auto) for the matching (m, n), or pick a fixed eigenmode preset.",
        5200,
      );
    } catch (e) {
      ui.setBuiltinActive(false);
      ui.showBanner(`Demo tone: ${e?.message || String(e)}`, 5000);
    }
  },
  onBuiltinPresetChange: async (value) => {
    if (!builtIn.isRunning()) return;
    const hz = hzForBuiltinPreset(value);
    try {
      await builtIn.start(hz);
      await builtIn.resumeContext();
      ui.setBuiltinActive(true);
    } catch {
      await builtIn.stop();
      ui.setBuiltinActive(false);
    }
  },
});

ui.setPauseLabel(false);
ui.setMicActive(false);
ui.setCamActive(false);
ui.setBuiltinActive(false);
modePresetValue = document.getElementById("modePreset").value;

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    audio.tryResume();
    builtIn.tryResume();
  }
});

let sessionTick = 0;

function viewAmplitudeScale() {
  if (viz.viewMode === "contour") return 0;
  if (viz.viewMode === "hybrid") return 0.38;
  return 1;
}

function animate(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  audio.tryResume();
  builtIn.tryResume();

  fpsFrames += 1;
  fpsTimer += dt;
  if (fpsTimer >= 0.45) {
    fps = fpsFrames / fpsTimer;
    fpsFrames = 0;
    fpsTimer = 0;
  }

  const sens = parseFloat(sensitivityEl.value);
  const fscale = parseFloat(freqScaleEl.value);
  const intens = parseFloat(intensityEl.value);

  audio.setSensitivity(sens);
  viz.baseAmplitude = intens * 0.13;

  const micLive = audio.isRunning();
  const toneLive = builtIn.isRunning();
  const driveLive = micLive || toneLive;

  let freqHz = 0;
  let amp = 0;
  if (micLive) {
    freqHz = audio.getDominantFrequency();
    amp = audio.getAmplitude();
  } else if (toneLive) {
    freqHz = builtIn.getFrequencyHz();
    amp = builtIn.getVizAmplitude();
  }

  /** Temporal term cos(ωt): raw 2πf would make high-pitched input shimmer many times per second. */
  if (driveLive) {
    const omegaRaw = 2 * Math.PI * freqHz * 0.0022 * fscale;
    viz.angularFreq = Math.min(omegaRaw, OMEGA_VISUAL_CAP);
    viz.audioBoost = amp;
    const smoothK = toneLive && !micLive ? 0.24 : 0.018;
    smoothedFreqForModes += (freqHz - smoothedFreqForModes) * smoothK;
  } else {
    viz.angularFreq = Math.min(9 * fscale, OMEGA_VISUAL_CAP);
    viz.audioBoost = 0;
    freqHz = 0;
    smoothedFreqForModes += (180 - smoothedFreqForModes) * 0.02;
  }

  if (modePresetValue !== "auto") {
    const [mm, nn] = modePresetValue.split(",").map(Number);
    viz.m = mm;
    viz.n = nn;
  } else if (holdAutoPattern && heldAutoMN) {
    viz.m = heldAutoMN.m;
    viz.n = heldAutoMN.n;
  } else {
    const { m, n } = modesFromStableBands(smoothedFreqForModes);
    viz.m = m;
    viz.n = n;
  }

  viz.update(dt);
  const surfaceAt = (px, py) => viz.displacementAt(px, py, viz.time);
  const particleDt = viz.paused ? 0 : dt;
  const vs = viewAmplitudeScale();
  const wave = {
    m: viz.m,
    n: viz.n,
    t: viz.time,
    omega: viz.angularFreq,
    A: viz.totalA() * vs,
  };
  particles.update(viz.m, viz.n, particleDt, 0.78 + amp * 0.52, surfaceAt, wave);
  particles.setOpacity(0.82 + amp * 0.16);

  sessionTick += 1;
  if (sessionTick % 20 === 0) {
    let mic = "Mic: off";
    if (audio.isRunning()) mic = "Mic: live";
    else if (audio.stream) mic = "Mic: idle — focus tab or interact to resume audio";
    const demo = builtIn.isRunning() ? "Demo tone: on" : "Demo tone: off";
    const cam = video.srcObject ? "Camera: on" : "Camera: off";
    const run = viz.paused ? "Simulation: paused" : "Simulation: running";
    ui.setSession(`${mic} · ${demo} · ${cam} · ${run}`);
  }

  const m = viz.m;
  const n = viz.n;
  const omega = viz.angularFreq;
  const omegaRawDrive =
    driveLive && freqHz > 0 ? 2 * Math.PI * freqHz * 0.0022 * fscale : omega;
  const capped = driveLive && omegaRawDrive > OMEGA_VISUAL_CAP + 1e-6;
  const eq = `u(x,y,t) = A·sin(${m}πx)·sin(${n}πy)·cos(ωt)`;
  let omegaLine = `ω = ${omega.toFixed(3)} rad/s  (drive for animation`;
  if (micLive) {
    omegaLine += `; f ≈ ${freqHz.toFixed(0)} Hz from mic`;
    if (capped) omegaLine += "; ω capped so motion stays readable";
  } else if (toneLive) {
    omegaLine += `; f = ${freqHz.toFixed(1)} Hz built-in sine`;
    if (capped) omegaLine += "; ω capped so motion stays readable";
  }
  omegaLine += ")";
  const nodalLine =
    "Nodal set (mode shape): sin(" +
    m +
    "πx)sin(" +
    n +
    "πy)=0  =>  lines x=k/" +
    m +
    ", y=l/" +
    n +
    " (instantaneous u=0 also when cos(ωt)=0).";

  ui.setMetrics({
    freqHz: driveLive ? freqHz : null,
    amplitude: driveLive ? amp : null,
    m,
    n,
    fps,
    equation: eq,
    omegaRad: omega,
    omegaLine,
    nodalLine,
  });

  viz.render();
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
