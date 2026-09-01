/** Rendered-entity bounds, unit sanity, and technical-edge sanitization. */

export type Vec3 = [number, number, number];

export interface LocalAabb {
  min: Vec3;
  max: Vec3;
}

export interface RenderedBounds {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
  source: 'mesh' | 'primitive';
  rejected?: string;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function len(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function aabbSize(b: LocalAabb): Vec3 {
  return sub(b.max, b.min);
}

export function aabbCenter(b: LocalAabb): Vec3 {
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

/** Engineering envelope for ARCHEON Arm-scale machines. Not a general CAD limit. */
export const BOUNDS_MAX_M = 20;
export const BOUNDS_MIN_M = 1e-6;
export const CENTER_MAX_M = 50;

export function validateAabb(b: LocalAabb, origin: Vec3 = [0, 0, 0]): { ok: boolean; code?: string } {
  for (const v of [...b.min, ...b.max, ...origin]) {
    if (!Number.isFinite(v)) return { ok: false, code: 'nan_or_inf_bounds' };
  }
  const size = aabbSize(b);
  if (size[0] <= 0 || size[1] <= 0 || size[2] <= 0) return { ok: false, code: 'non_positive_size' };
  const maxDim = Math.max(size[0], size[1], size[2]);
  if (maxDim < BOUNDS_MIN_M) return { ok: false, code: 'too_small' };
  if (maxDim > BOUNDS_MAX_M) return { ok: false, code: 'absurd_extent_mm_as_m' };
  const c = aabbCenter(b);
  const worldC = add(origin, c);
  if (len(worldC) > CENTER_MAX_M) return { ok: false, code: 'center_far_from_project' };
  return { ok: true };
}

export function primitiveLocalAabb(prim: {
  kind: string;
  sx?: number;
  sy?: number;
  sz?: number;
  radius?: number;
  height?: number;
}): LocalAabb {
  let sx: number, sy: number, sz: number;
  if (prim.kind === 'box') {
    sx = prim.sx ?? 0.01;
    sy = prim.sy ?? 0.01;
    sz = prim.sz ?? 0.01;
  } else {
    const d = (prim.radius ?? 0.01) * 2;
    sx = d;
    sy = d;
    sz = prim.height ?? 0.01;
  }
  return {
    min: [-sx / 2, -sy / 2, -sz / 2],
    max: [sx / 2, sy / 2, sz / 2]
  };
}

function rotateRpy(v: Vec3, rpy: Vec3): Vec3 {
  const [r, p, y] = rpy;
  if (Math.abs(r) + Math.abs(p) + Math.abs(y) < 1e-12) return v;
  const cr = Math.cos(r), sr = Math.sin(r);
  const cp = Math.cos(p), sp = Math.sin(p);
  const cy = Math.cos(y), sy = Math.sin(y);
  const x1 = v[0], y1 = v[1] * cr - v[2] * sr, z1 = v[1] * sr + v[2] * cr;
  const x2 = x1 * cp + z1 * sp, y2 = y1, z2 = -x1 * sp + z1 * cp;
  return [x2 * cy - y2 * sy, x2 * sy + y2 * cy, z2];
}

export function transformLocalAabb(local: LocalAabb, origin: Vec3, rpy: Vec3): LocalAabb {
  const corners: Vec3[] = [
    [local.min[0], local.min[1], local.min[2]],
    [local.max[0], local.min[1], local.min[2]],
    [local.min[0], local.max[1], local.min[2]],
    [local.max[0], local.max[1], local.min[2]],
    [local.min[0], local.min[1], local.max[2]],
    [local.max[0], local.min[1], local.max[2]],
    [local.min[0], local.max[1], local.max[2]],
    [local.max[0], local.max[1], local.max[2]]
  ];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const c of corners) {
    const w = add(origin, rotateRpy(c, rpy));
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], w[i]);
      max[i] = Math.max(max[i], w[i]);
    }
  }
  return { min, max };
}

/**
 * Single bounds source for fit / focus / explode / labels.
 * Prefer actual mesh AABB when valid; else DesignIR primitive.
 */
export function getRenderedEntityBounds(opts: {
  origin: Vec3;
  rpy?: Vec3;
  primitive: { kind: string; sx?: number; sy?: number; sz?: number; radius?: number; height?: number };
  meshLocal?: LocalAabb | null;
}): RenderedBounds {
  const rpy = opts.rpy ?? [0, 0, 0];
  const prim = primitiveLocalAabb(opts.primitive);
  let local = prim;
  let source: 'mesh' | 'primitive' = 'primitive';
  let rejected: string | undefined;
  if (opts.meshLocal) {
    const v = validateAabb(opts.meshLocal, opts.origin);
    if (v.ok) {
      local = opts.meshLocal;
      source = 'mesh';
    } else {
      rejected = v.code;
    }
  }
  const world = transformLocalAabb(local, opts.origin, rpy);
  const worldCheck = validateAabb(world);
  if (!worldCheck.ok) {
    const fb = transformLocalAabb(prim, opts.origin, rpy);
    const size = aabbSize(fb);
    const center = aabbCenter(fb);
    return { min: fb.min, max: fb.max, center, size, source: 'primitive', rejected: worldCheck.code };
  }
  const size = aabbSize(world);
  const center = aabbCenter(world);
  return { min: world.min, max: world.max, center, size, source, rejected };
}

/** Drop degenerate or absurd line segments (e.g. drei Edges 1 m placeholder). */
export function sanitizeEdgeSegments(
  positions: ArrayLike<number>,
  maxLen: number
): number[] {
  const out: number[] = [];
  for (let i = 0; i + 5 < positions.length; i += 6) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    if (![ax, ay, az, bx, by, bz].every(Number.isFinite)) continue;
    const d = Math.hypot(bx - ax, by - ay, bz - az);
    if (d < 1e-8 || d > maxLen) continue;
    out.push(ax, ay, az, bx, by, bz);
  }
  return out;
}

export function geometryMode(hasCadMesh: boolean, debug: { cadMeshes: boolean; primitives: boolean }): 'cad' | 'primitive' | 'hidden' {
  if (hasCadMesh && debug.cadMeshes) return 'cad';
  if (debug.primitives) return 'primitive';
  return 'hidden';
}

/** Overlay geometry is drawn only when both the overlay flag and the debug gate are on. */
export function overlayVisible(overlayOn: boolean, debugOn: boolean): boolean {
  return overlayOn && debugOn;
}

/** Prefer mesh AABB size for camera fit; fall back to primitive. Rejects invalid boxes. */
export function fitSizeFromRendered(bounds: RenderedBounds[]): [number, number, number] {
  const ok = bounds.filter((b) => validateAabb({ min: b.min, max: b.max }).ok);
  if (!ok.length) return [1.2, 0.6, 0.8];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of ok) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }
  return [Math.max(0.08, max[0] - min[0]), Math.max(0.08, max[1] - min[1]), Math.max(0.08, max[2] - min[2])];
}
