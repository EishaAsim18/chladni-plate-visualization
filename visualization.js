import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { displacementU, modePhi, NODAL_PHI_EPS, NODAL_U_EPS } from "./mathEngine.js";
import { ContourIsolinesRenderer } from "./contourRenderer.js";

/**
 * visualization.js — Three.js Chladni plate
 *
 * Mathematical plate coordinates (x, y) ∈ [−1,1]² map to world (X, Z).
 * Out-of-plane displacement u(x,y,t) is applied along world Y:
 *
 *   u(x,y,t) = A sin(mπx) sin(nπy) cos(ωt)
 *
 * So “vertical” in the math is world Y; (x,y) lie in the horizontal plate plane.
 */

export class ChladniVisualization {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    /** @type {THREE.PMREMGenerator | null} */
    this._pmrem = null;
    this._iblReady = false;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 50);
    /* Slight offset like tabletop Chladni footage: plate reads broad, sand reads bright. */
    this.camera.position.set(0.42, 2.58, 2.12);
    this.camera.lookAt(0, 0.04, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 5;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.target.set(0, 0.04, 0);
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.22;

    this.m = 2;
    this.n = 3;
    this.angularFreq = 12;
    this.baseAmplitude = 0.07;
    this.audioBoost = 0;
    this.time = 0;
    this.paused = false;

    this.heatmapEnabled = false;
    this.meshEdgesEnabled = true;
    /** 'surface' | 'contour' | 'hybrid' */
    this.viewMode = "surface";
    this.nodalGeometryMode = false;

    this._buildLights();
    this._buildPlate();

    this.contours = new ContourIsolinesRenderer(this.scene, { lift: 0.092 });
    this.contours.update(this.m, this.n);

    this._tmpColor = new THREE.Color();
    this._edgeFrame = 0;
    this._syncContourVisibility();
  }

  _buildLights() {
    /* One strong key + low fill — high contrast like powder-on-metal demos. */
    const key = new THREE.DirectionalLight(0xffeed8, 1.12);
    key.position.set(2.4, 5.2, 0.9);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xc8b8a8, 0.2);
    fill.position.set(-2.8, 1.4, -1.6);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0xffccaa, 0.36, 20);
    rim.position.set(-1.2, 2.2, 1.6);
    this.scene.add(rim);

    const amb = new THREE.AmbientLight(0x221c18, 0.38);
    this.scene.add(amb);
  }

  _buildImageBasedLighting() {
    if (this._iblReady) return;
    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;
    if (w < 4 || h < 4) return;

    if (this._pmrem) {
      this._pmrem.dispose();
      this._pmrem = null;
    }
    if (this.scene.environment) {
      this.scene.environment.dispose();
      this.scene.environment = null;
    }

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    this._pmrem = pmrem;
    this._iblReady = true;
  }

  _buildPlate() {
    const segs = 128;
    this.geometry = new THREE.PlaneGeometry(2, 2, segs, segs);
    this.geometry.rotateX(-Math.PI / 2);

    const count = this.geometry.attributes.position.count;
    const src = this.geometry.attributes.position.array;
    this.basePositions = new Float32Array(count * 3);
    for (let i = 0; i < src.length; i++) {
      this.basePositions[i] = src[i];
    }

    this.colors = new Float32Array(count * 3);
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));

    /* Dark tarnished brass — bright sand reads like classic Chladni video stills. */
    this.material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x5c4a38),
      vertexColors: true,
      metalness: 0.88,
      roughness: 0.46,
      clearcoat: 0.18,
      clearcoatRoughness: 0.52,
      envMapIntensity: 1.05,
      specularIntensity: 1.15,
      specularColor: new THREE.Color(0xffe8d4),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
      emissive: new THREE.Color(0x120e0a),
      emissiveIntensity: 0.028,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 0;
    this.scene.add(this.mesh);

    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.geometry, 22),
      new THREE.LineBasicMaterial({
        color: 0xc4b4a0,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    );
    this.edges.renderOrder = 1;
    this.scene.add(this.edges);

    const grid = new THREE.GridHelper(2.2, 20, 0x4a3d32, 0x1c1610);
    grid.position.y = -0.18;
    const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const m of gridMats) {
      m.transparent = true;
      m.opacity = 0.1;
    }
    this.scene.add(grid);
  }

  setViewMode(mode) {
    if (mode === "surface" || mode === "contour" || mode === "hybrid") {
      this.viewMode = mode;
    }
    this._syncContourVisibility();
  }

  setNodalGeometryMode(on) {
    this.nodalGeometryMode = Boolean(on);
    this.contours.setNodalGeometryMode(this.nodalGeometryMode);
    this._syncContourVisibility();
  }

  _syncContourVisibility() {
    const showAnalytic =
      this.viewMode === "contour" || this.viewMode === "hybrid" || this.nodalGeometryMode;
    this.contours.setVisible(showAnalytic);
  }

  setAutoRotate(on) {
    this.controls.autoRotate = Boolean(on);
  }

  setHeatmap(on) {
    this.heatmapEnabled = on;
  }

  setMeshEdges(on) {
    this.meshEdgesEnabled = on;
    if (this.edges) this.edges.visible = on;
  }

  /** @deprecated alias */
  setContour(on) {
    this.setMeshEdges(on);
  }

  /** Total amplitude A used in u = A sin(mπx)sin(nπy)cos(ωt) */
  totalA() {
    return this.baseAmplitude * (1 + this.audioBoost * 0.45);
  }

  /**
   * Out-of-plane displacement u at plate coordinates (x, y).
   * @param {number} plateX — maps to world X
   * @param {number} plateY — maps to world Z
   */
  displacementAt(plateX, plateY, t) {
    let scale = 1;
    if (this.viewMode === "contour") scale = 0;
    else if (this.viewMode === "hybrid") scale = 0.38;
    const A = this.totalA() * scale;
    return displacementU(plateX, plateY, t, {
      m: this.m,
      n: this.n,
      A,
      omega: this.angularFreq,
    });
  }

  update(dt) {
    if (!this.paused) this.time += dt;

    const pos = this.geometry.attributes.position;
    const col = this.geometry.attributes.color;
    const t = this.time;
    const m = this.m;
    const n = this.n;
    const A0 = this.totalA();

    if (this.nodalGeometryMode) {
      this.material.opacity = 0.38;
      this.material.metalness = 0.82;
      this.material.roughness = 0.48;
      this.material.envMapIntensity = 0.92;
      this.material.emissiveIntensity = 0.03;
      this.edges.material.color.setHex(0xfff6e8);
      this.edges.material.opacity = 0.58;
    } else {
      this.material.opacity = this.viewMode === "contour" ? 0.14 : 1;
      this.material.metalness = 0.88;
      this.material.roughness = 0.46;
      this.material.envMapIntensity = 1.05;
      this.material.emissiveIntensity = 0.028;
      this.edges.material.color.setHex(0xc4b4a0);
      this.edges.material.opacity = this.viewMode === "contour" ? 0.18 : 0.3;
    }

    if (this.viewMode === "contour") {
      this.material.opacity = Math.min(this.material.opacity, 0.16);
    }

    let viewScale = 1;
    if (this.viewMode === "contour") viewScale = 0;
    else if (this.viewMode === "hybrid") viewScale = 0.38;
    const Aeff = A0 * viewScale;

    for (let i = 0; i < pos.count; i++) {
      const ix = i * 3;
      const plateX = this.basePositions[ix];
      const yOrig = this.basePositions[ix + 1];
      const plateY = this.basePositions[ix + 2];

      const u = displacementU(plateX, plateY, t, {
        m,
        n,
        A: Aeff,
        omega: this.angularFreq,
      });

      pos.array[ix + 1] = yOrig + u;

      if (this.heatmapEnabled) {
        const phi = modePhi(plateX, plateY, m, n);
        const nodalPhi = Math.abs(phi) < NODAL_PHI_EPS;
        const nodalU = Math.abs(u) < NODAL_U_EPS * Math.max(1e-6, Math.abs(Aeff) + 1e-6);

        // Slight plate tint only; figure should read in the sand (cf. tabletop Chladni demos).
        if (nodalPhi || nodalU) {
          this._tmpColor.setRGB(0.78, 0.7, 0.58);
        } else if (u > 0) {
          const s = THREE.MathUtils.clamp(u / (Math.abs(Aeff) + 1e-6), 0, 1);
          this._tmpColor.setRGB(0.98, 0.94 + s * 0.04, 0.86 + s * 0.05);
        } else {
          const s = THREE.MathUtils.clamp(-u / (Math.abs(Aeff) + 1e-6), 0, 1);
          this._tmpColor.setRGB(0.9 - s * 0.04, 0.92, 0.98);
        }
        col.array[ix] = THREE.MathUtils.clamp(this._tmpColor.r, 0.55, 1);
        col.array[ix + 1] = THREE.MathUtils.clamp(this._tmpColor.g, 0.55, 1);
        col.array[ix + 2] = THREE.MathUtils.clamp(this._tmpColor.b, 0.55, 1);
      } else {
        col.array[ix] = 1;
        col.array[ix + 1] = 1;
        col.array[ix + 2] = 1;
      }
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.geometry.computeVertexNormals();

    this.contours.update(m, n);

    if (this.edges) {
      this.edges.visible = this.meshEdgesEnabled;
    }

    if (this.meshEdgesEnabled && this.edges) {
      this._edgeFrame += 1;
      if (this._edgeFrame % 28 === 0) {
        this.edges.geometry.dispose();
        this.edges.geometry = new THREE.EdgesGeometry(this.geometry, 26);
      }
    }
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._buildImageBasedLighting();
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.contours.dispose();
    this.controls.dispose();
    this.geometry.dispose();
    this.material.dispose();
    if (this.edges) {
      this.edges.geometry.dispose();
      this.edges.material.dispose();
    }
    if (this.scene.environment) {
      this.scene.environment.dispose();
      this.scene.environment = null;
    }
    if (this._pmrem) {
      this._pmrem.dispose();
      this._pmrem = null;
    }
    this._iblReady = false;
    this.renderer.dispose();
  }
}
