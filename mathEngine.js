/**
 * mathEngine.js — eigenfunctions, standing waves, and nodal sets on the unit square
 *
 * We model an idealized square plate with fixed edges (Dirichlet analogy). Separable
 * eigenmodes of the Laplacian on [−1,1]² have the form
 *
 *   φ_{m,n}(x, y) = sin(mπx) sin(nπy),   m, n ∈ ℕ
 *
 * A standing wave in time is
 *
 *   u(x, y, t) = A · φ_{m,n}(x, y) · cos(ωt)
 *
 * Here u is the transverse (out-of-plane) displacement. Nodal lines (Chladni curves
 * in this idealization) lie in the zero set of φ_{m,n}, i.e. where sin(mπx)=0 or
 * sin(nπy)=0, hence vertical lines x = k/m and horizontal lines y = ℓ/n inside the
 * square (multivariable calculus: level set u(·,·,t)=0 when cos(ωt)≠0 is the same as
 * φ=0).
 *
 * Three.js mapping: mathematical (x, y) on the plate map to world (X, Z); displacement
 * u is applied along world Y (see visualization.js).
 *
 * Physics fidelity (short):
 * — Mode shape φ and nodal set {φ=0} match the idealized square membrane / Dirichlet
 *   eigenfunction sin(mπx)sin(nπy) on [−1,1]² (same as u(·,·,t)=0 when cos(ωt)≠0).
 * — u = A φ cos(ωt) is a correct separable standing-wave form for that mode; ω and A here
 *   are visualization parameters, not necessarily the plate’s true eigenfrequency / Q.
 * — Real elastic plates follow stiff-plate theory (different PDE, spectrum, and mode shapes
 *   than the pure membrane); circular/irregular plates are not this separable form.
 * — Mic-driven (m,n) in the app is didactic mapping from pitch, not a modal analysis of a body.
 */

/**
 * Mode shape φ_{m,n}(x, y) at plate coordinates (x,y) ∈ [−1,1]².
 */
export function modePhi(x, y, m, n) {
  const mm = Math.max(1, m);
  const nn = Math.max(1, n);
  return Math.sin(mm * Math.PI * x) * Math.sin(nn * Math.PI * y);
}

/**
 * Standing-wave displacement u(x,y,t) = A sin(mπx) sin(nπy) cos(ωt).
 * @param {number} x — plate coordinate (maps to world X)
 * @param {number} y — plate coordinate (maps to world Z)
 */
export function displacementU(x, y, t, { m, n, A, omega }) {
  return A * modePhi(x, y, m, n) * Math.cos(omega * t);
}

/** |u| below this (relative to |A|) counts as “nodal band” for shading */
export const NODAL_U_EPS = 0.06;

/** |φ| below this highlights the time-independent nodal network */
export const NODAL_PHI_EPS = 0.08;

export function nearNodalPhi(x, y, m, n, eps = NODAL_PHI_EPS) {
  return Math.abs(modePhi(x, y, m, n)) < eps;
}

export function nearNodalU(u, A, eps = NODAL_U_EPS) {
  const scale = Math.max(1e-6, Math.abs(A));
  return Math.abs(u) < eps * scale;
}
