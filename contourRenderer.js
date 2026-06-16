import * as THREE from "three";

/**
 * contourRenderer.js — exact nodal grid for φ_{m,n}(x,y) = sin(mπx) sin(nπy)
 *
 * Zero set φ = 0 is the union of lines x = k/m and y = ℓ/n (k, ℓ integers) in [−1,1]².
 * Drawn in the plate plane: world (X, Z) with Y = lift (multivariable calculus level set).
 */

function buildExactNodalSegments(m, n) {
  const mm = Math.max(1, m);
  const nn = Math.max(1, n);
  const arr = [];
  for (let k = -mm; k <= mm; k++) {
    const x = k / mm;
    if (x < -1 - 1e-9 || x > 1 + 1e-9) continue;
    arr.push(x, -1, x, 1);
  }
  for (let k = -nn; k <= nn; k++) {
    const y = k / nn;
    if (y < -1 - 1e-9 || y > 1 + 1e-9) continue;
    arr.push(-1, y, 1, y);
  }
  return arr;
}

export class ContourIsolinesRenderer {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.lift = options.lift ?? 0.055;

    this.geom = new THREE.BufferGeometry();
    this.positions = new Float32Array(120000);
    this.geom.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geom.setDrawRange(0, 0);

    this.mat = new THREE.LineBasicMaterial({
      color: 0xfff2dc,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.LineSegments(this.geom, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 4;
    this.scene.add(this.lines);

    this._lastMN = "";
  }

  setNodalGeometryMode(on) {
    if (on) {
      this.mat.color.setHex(0xffffff);
      this.mat.opacity = 0.92;
    } else {
      this.mat.color.setHex(0xfff2dc);
      this.mat.opacity = 0.48;
    }
  }

  setVisible(v) {
    this.lines.visible = v;
  }

  update(m, n) {
    const key = `${m},${n}`;
    if (key === this._lastMN) return;
    this._lastMN = key;

    const flat = buildExactNodalSegments(m, n);
    const LY = this.lift;
    let ptr = 0;
    const buf = this.positions;
    for (let i = 0; i < flat.length; i += 4) {
      const x0 = flat[i];
      const y0 = flat[i + 1];
      const x1 = flat[i + 2];
      const y1 = flat[i + 3];
      buf[ptr++] = x0;
      buf[ptr++] = LY;
      buf[ptr++] = y0;
      buf[ptr++] = x1;
      buf[ptr++] = LY;
      buf[ptr++] = y1;
    }
    this.geom.attributes.position.needsUpdate = true;
    this.geom.setDrawRange(0, ptr / 3);
    this.geom.computeBoundingSphere();
  }

  dispose() {
    this.geom.dispose();
    this.mat.dispose();
    this.scene.remove(this.lines);
  }
}
