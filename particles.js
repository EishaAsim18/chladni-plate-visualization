import * as THREE from "three";
import { displacementU, modePhi } from "./mathEngine.js";

/**
 * particles.js — sand grains above the plate (world Y offset from surface u)
 *
 * Grains follow a phenomenological “drift toward low motion” rule, not full granular physics.
 * Real powder on a driven plate is a complicated contact + fluidization problem; experiments
 * often show accumulation near nodal lines (least out-of-plane motion). Here we minimize a
 * potential dominated by φ² (zeros = nodal network of the chosen mode) plus small |u| and a
 * thin rim repulsion (non-physical; avoids φ=0 on the whole square boundary dominating).
 */

export class PlateParticles {
  constructor(count = 3500, halfExtent = 1, grainLift = 0.11) {
    this.count = count;
    this.halfExtent = halfExtent;
    this.grainLift = grainLift;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 2);
    this.liftJitter = new Float32Array(count);
    this.geometry = new THREE.BufferGeometry();
    const sandColors = new Float32Array(count * 3);
    this._tmpSand = new THREE.Color();
    for (let i = 0; i < count; i++) {
      /* Salt / light powder on dark plate (classic Chladni look). */
      const hue = 0.085 + Math.random() * 0.04;
      const sat = 0.02 + Math.random() * 0.08;
      const light = 0.82 + Math.random() * 0.14;
      this._tmpSand.setHSL(hue, sat, light);
      sandColors[i * 3] = this._tmpSand.r;
      sandColors[i * 3 + 1] = this._tmpSand.g;
      sandColors[i * 3 + 2] = this._tmpSand.b;
    }

    this.material = new THREE.PointsMaterial({
      vertexColors: true,
      color: 0xffffff,
      size: 0.052,
      transparent: true,
      opacity: 0.99,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    });

    for (let i = 0; i < count; i++) {
      this.liftJitter[i] = Math.random() * 0.02;
      const x = (Math.random() * 2 - 1) * halfExtent * 0.92;
      const z = (Math.random() * 2 - 1) * halfExtent * 0.92;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = this.grainLift + this.liftJitter[i];
      this.positions[i * 3 + 2] = z;
      this.velocities[i * 2] = 0;
      this.velocities[i * 2 + 1] = 0;
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(sandColors, 3));
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  /**
   * @param {(plateX: number, plateY: number) => number} surfaceHeight — u at plate (x,y)
   * @param {{ m: number, n: number, t: number, omega: number, A: number }} wave — for peak avoidance
   */
  update(m, n, dt, strength = 1, surfaceHeight = null, wave = null) {
    const h = 0.0035;
    const pull = 3.85 * strength;
    const damp = 0.952;
    const nx = Math.max(1, m);
    const ny = Math.max(1, n);
    const he = this.halfExtent;
    const move = dt > 1e-8;
    const subSteps = move ? (dt > 0.032 ? 3 : 2) : 1;
    const subDt = move ? dt / subSteps : 0;

    const phiSq = (px, py) => {
      const p = modePhi(px, py, nx, ny);
      return p * p;
    };
    const peakPenalty = (px, py) => {
      if (!wave) return 0;
      const u = displacementU(px, py, wave.t, {
        m: nx,
        n: ny,
        A: wave.A,
        omega: wave.omega,
      });
      return Math.abs(u);
    };

    /**
     * φ=0 on the full square rim — same minimum as interior nodals. Only add cost in a thin
     * outer band so φ² gradients toward nodal curves stay usable (previous strong repel killed patterns).
     */
    const edgeRepel = (px, pz) => {
      const r = Math.max(Math.abs(px), Math.abs(pz)) / he;
      const t = THREE.MathUtils.smoothstep(r, 0.88, 0.992);
      return t * t * t * 0.48;
    };

    for (let step = 0; step < subSteps; step++) {
      if (subDt <= 1e-8) break;

      for (let i = 0; i < this.count; i++) {
        let x = this.positions[i * 3];
        let py = this.positions[i * 3 + 2];

        const potential = (px, pz) =>
          phiSq(px, pz) + 0.042 * peakPenalty(px, pz) + edgeRepel(px, pz);

        const gx = (potential(x + h, py) - potential(x - h, py)) / (2 * h);
        const gz = (potential(x, py + h) - potential(x, py - h)) / (2 * h);

        this.velocities[i * 2] = (this.velocities[i * 2] - gx * pull * subDt) * damp;
        this.velocities[i * 2 + 1] = (this.velocities[i * 2 + 1] - gz * pull * subDt) * damp;

        x += this.velocities[i * 2] * subDt * 64;
        py += this.velocities[i * 2 + 1] * subDt * 64;

        const lim = he * 0.985;
        if (x > lim) x = lim;
        if (x < -lim) x = -lim;
        if (py > lim) py = lim;
        if (py < -lim) py = -lim;

        this.positions[i * 3] = x;
        this.positions[i * 3 + 2] = py;
      }

    }

    for (let i = 0; i < this.count; i++) {
      const x = this.positions[i * 3];
      const py = this.positions[i * 3 + 2];
      const baseY =
        typeof surfaceHeight === "function" ? surfaceHeight(x, py) : 0;
      this.positions[i * 3 + 1] = baseY + this.grainLift + this.liftJitter[i];
    }

    this.geometry.attributes.position.needsUpdate = true;
  }

  setOpacity(a) {
    this.material.opacity = THREE.MathUtils.clamp(a, 0.78, 0.995);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
