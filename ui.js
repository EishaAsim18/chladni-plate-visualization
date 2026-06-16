/**
 * ui.js — DOM bindings for controls, telemetry, and status.
 */

let bannerHideTimeoutId = 0;

export function initUI(elements) {
  const {
    sensitivity,
    sensitivityVal,
    freqScale,
    freqScaleVal,
    intensity,
    intensityVal,
    pauseBtn,
    fullscreenBtn,
    modePreset,
    viewMode,
    nodalGeometryToggle,
    heatmapToggle,
    contourToggle,
    micBtn,
    camBtn,
    builtinBtn,
    builtinPreset,
    metricFreq,
    metricAmp,
    metricMode,
    metricEq,
    metricOmega,
    metricNodal,
    metricFps,
    statusBanner,
    sessionStatus,
    stripFps,
    stripFreq,
    stripAmp,
    stripMode,
    stripOmega,
    cameraOrbitToggle,
    holdPatternToggle,
  } = elements;

  const bindRange = (input, label, formatter = (v) => Number(v).toFixed(2)) => {
    const sync = () => {
      label.textContent = formatter(input.value);
    };
    input.addEventListener("input", sync);
    sync();
  };

  bindRange(sensitivity, sensitivityVal);
  bindRange(freqScale, freqScaleVal);
  bindRange(intensity, intensityVal);

  pauseBtn.addEventListener("click", () => {
    elements.onPauseToggle?.();
  });

  fullscreenBtn.addEventListener("click", () => {
    elements.onFullscreen?.();
  });

  modePreset.addEventListener("change", () => {
    elements.onModePreset?.(modePreset.value);
  });

  if (viewMode) {
    viewMode.addEventListener("change", () => {
      elements.onViewMode?.(viewMode.value);
    });
  }

  if (nodalGeometryToggle) {
    nodalGeometryToggle.addEventListener("change", () => {
      elements.onNodalGeometry?.(nodalGeometryToggle.checked);
    });
  }

  heatmapToggle.addEventListener("change", () => {
    elements.onHeatmap?.(heatmapToggle.checked);
  });
  elements.onHeatmap?.(heatmapToggle.checked);

  contourToggle.addEventListener("change", () => {
    elements.onContour?.(contourToggle.checked);
  });

  if (cameraOrbitToggle) {
    cameraOrbitToggle.addEventListener("change", () => {
      elements.onCameraOrbit?.(cameraOrbitToggle.checked);
    });
  }

  if (holdPatternToggle) {
    holdPatternToggle.addEventListener("change", () => {
      elements.onHoldAutoPattern?.(holdPatternToggle.checked);
    });
  }

  micBtn.addEventListener("click", async () => {
    micBtn.disabled = true;
    try {
      await elements.onMic?.();
    } finally {
      micBtn.disabled = false;
    }
  });

  camBtn.addEventListener("click", async () => {
    camBtn.disabled = true;
    try {
      await elements.onCam?.();
    } finally {
      camBtn.disabled = false;
    }
  });

  if (builtinPreset) {
    builtinPreset.addEventListener("change", () => {
      elements.onBuiltinPresetChange?.(builtinPreset.value);
    });
  }

  if (builtinBtn) {
    builtinBtn.addEventListener("click", async () => {
      builtinBtn.disabled = true;
      try {
        await elements.onBuiltinToggle?.();
      } finally {
        builtinBtn.disabled = false;
      }
    });
  }

  return {
    setPauseLabel(paused) {
      pauseBtn.textContent = paused ? "Resume" : "Pause";
    },
    setMicActive(on) {
      micBtn.classList.toggle("is-active", on);
      micBtn.setAttribute("aria-pressed", on ? "true" : "false");
      micBtn.textContent = on ? "Stop microphone" : "Enable microphone";
    },
    setCamActive(on) {
      camBtn.classList.toggle("is-active", on);
      camBtn.setAttribute("aria-pressed", on ? "true" : "false");
      camBtn.textContent = on ? "Stop camera" : "Enable camera";
    },
    setBuiltinActive(on) {
      if (!builtinBtn) return;
      builtinBtn.classList.toggle("is-active", on);
      builtinBtn.setAttribute("aria-pressed", on ? "true" : "false");
      builtinBtn.textContent = on ? "Stop demo tone" : "Play demo tone";
    },
    setSession(text) {
      if (sessionStatus) sessionStatus.textContent = text;
    },
    setMetrics({
      freqHz,
      amplitude,
      m,
      n,
      fps,
      equation,
      omegaRad,
      omegaLine,
      nodalLine,
    }) {
      if (freqHz == null) metricFreq.textContent = "— Hz";
      else metricFreq.textContent = `${freqHz.toFixed(1)} Hz`;

      if (amplitude == null) metricAmp.textContent = "—";
      else metricAmp.textContent = amplitude.toFixed(3);
      if (m != null && n != null) {
        metricMode.textContent = `(${m}, ${n})`;
      }
      if (equation) metricEq.textContent = equation;
      if (metricOmega) {
        if (omegaLine) metricOmega.textContent = omegaLine;
        else if (omegaRad != null)
          metricOmega.textContent = `${omegaRad.toFixed(3)} rad/s`;
        else metricOmega.textContent = "—";
      }
      if (metricNodal) {
        if (nodalLine) metricNodal.textContent = nodalLine;
        else if (m != null && n != null)
          metricNodal.textContent = `sin(${m}πx)sin(${n}πy) = 0`;
      }
      if (fps != null) metricFps.textContent = fps.toFixed(0);

      if (stripFps) {
        if (fps != null) stripFps.textContent = fps.toFixed(0);
        else stripFps.textContent = "—";
      }
      if (stripFreq) {
        if (freqHz == null) stripFreq.textContent = "—";
        else stripFreq.textContent = `${freqHz.toFixed(0)} Hz`;
      }
      if (stripAmp) {
        if (amplitude == null) stripAmp.textContent = "—";
        else stripAmp.textContent = amplitude.toFixed(2);
      }
      if (stripMode) {
        if (m != null && n != null) stripMode.textContent = `(${m},${n})`;
        else stripMode.textContent = "—";
      }
      if (stripOmega) {
        if (omegaRad == null) stripOmega.textContent = "—";
        else stripOmega.textContent = `${omegaRad.toFixed(1)}`;
      }
    },
    showBanner(msg, ms = 3200) {
      if (!statusBanner) return;
      statusBanner.textContent = msg;
      statusBanner.classList.add("is-visible");
      clearTimeout(bannerHideTimeoutId);
      bannerHideTimeoutId = setTimeout(() => {
        statusBanner.classList.remove("is-visible");
      }, ms);
    },
  };
}
