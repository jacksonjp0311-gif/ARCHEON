/** Recursive assembly-aware explosion and final render transforms. */

export type ExplosionStrategy =
  | 'RADIAL'
  | 'AXIAL'
  | 'SEQUENCE'
  | 'SYSTEM'
  | 'BOM_FOCUS'
  | 'SERVICE'
  | 'GRAPH'
  | 'CUSTOM'
  | 'STACK';

export type SpreadPreset = 'COMPACT' | 'NORMAL' | 'ENGINEERING' | 'WIDE' | 'EXTREME';

export interface SpatialPart {
  id: string;
  origin_m: Vec3;
  explosion_vector: Vec3;
  explosion_distance_m: number;
  assembly_stage: number;
  parentId?: string | null;
  depth?: number;
  servicePath?: Vec3[];
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

const SPREAD: Record<SpreadPreset, { spreadScale: number; hierarchySpacing: number }> = {
  COMPACT: { spreadScale: 1.35, hierarchySpacing: 0.55 },
  NORMAL: { spreadScale: 2.6, hierarchySpacing: 0.95 },
  ENGINEERING: { spreadScale: 4.2, hierarchySpacing: 1.25 },
  WIDE: { spreadScale: 6.8, hierarchySpacing: 1.7 },
  EXTREME: { spreadScale: 10.5, hierarchySpacing: 2.3 }
};

export type Vec3 = [number, number, number];

export interface AssemblyRef {
  id: string;
  parent: string | null;
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}
export function len3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}
export function norm3(v: Vec3): Vec3 {
  const n = len3(v);
  if (n < 1e-9) return [0, 0, 1];
  return [v[0] / n, v[1] / n, v[2] / n];
}

export function rotateRpy(v: Vec3, rpy: Vec3): Vec3 {
  const [r, p, y] = rpy;
  if (Math.abs(r) + Math.abs(p) + Math.abs(y) < 1e-12) return v;
  const cr = Math.cos(r), sr = Math.sin(r);
  const cp = Math.cos(p), sp = Math.sin(p);
  const cy = Math.cos(y), sy = Math.sin(y);
  const x1 = v[0], y1 = v[1] * cr - v[2] * sr, z1 = v[1] * sr + v[2] * cr;
  const x2 = x1 * cp + z1 * sp, y2 = y1, z2 = -x1 * sp + z1 * cp;
  return [x2 * cy - y2 * sy, x2 * sy + y2 * cy, z2];
}

export function stageWeight(progress: number, start: number, end: number): number {
  if (end <= start) return progress >= start ? 1 : 0;
  return smoothstep((progress - start) / (end - start));
}

export function resolveExplodeContext(
  selectedId: string | null,
  parts: { id: string; parent: string | null }[],
  assemblies: AssemblyRef[],
  explicit?: 'extract' | null
): string | null {
  if (!selectedId) return null;
  if (assemblies.some((a) => a.id === selectedId)) return selectedId;
  const part = parts.find((p) => p.id === selectedId);
  if (!part) return selectedId;
  if (explicit === 'extract') return part.id;
  const kids = parts.filter((p) => p.parent === part.id);
  if (kids.length) return part.id;
  return part.parent;
}

export function assemblyDescendants(scopeId: string, assemblies: AssemblyRef[]): Set<string> {
  const ids = new Set<string>([scopeId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of assemblies) {
      if (a.parent && ids.has(a.parent) && !ids.has(a.id)) {
        ids.add(a.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function partsInScope(
  scopeId: string | null,
  parts: { id: string; parent?: string | null; parentId?: string | null }[],
  assemblies: AssemblyRef[]
): Set<string> | null {
  if (!scopeId) return null;
  const asms = assemblyDescendants(scopeId, assemblies);
  const out = new Set<string>();
  for (const p of parts) {
    const parent = p.parent ?? p.parentId ?? null;
    if (p.id === scopeId || (parent && asms.has(parent))) out.add(p.id);
  }
  return out;
}

export function assemblyDepth(id: string, assemblies: AssemblyRef[]): number {
  let d = 0;
  let pid: string | null = assemblies.find((a) => a.id === id)?.parent ?? null;
  const seen = new Set<string>();
  while (pid && !seen.has(pid) && d < 8) {
    seen.add(pid);
    d += 1;
    pid = assemblies.find((a) => a.id === pid)?.parent ?? null;
  }
  return d;
}

function centroidOf(pts: SpatialPart[]): Vec3 {
  if (!pts.length) return [0, 0, 0];
  let x = 0, y = 0, z = 0;
  for (const p of pts) {
    x += p.origin_m[0];
    y += p.origin_m[1];
    z += p.origin_m[2];
  }
  const n = pts.length;
  return [x / n, y / n, z / n];
}

function inferAssemblies(parts: SpatialPart[]): AssemblyRef[] {
  const ids = new Set<string>();
  for (const p of parts) if (p.parentId) ids.add(p.parentId);
  return [...ids].map((id) => ({ id, parent: null }));
}

/**
 * Recursive explosion: assembly offset + child assembly offset + part offset.
 * Out-of-scope parts receive [0,0,0] — no residual drift.
 */
export function recursiveExplosionOffsets(
  parts: SpatialPart[],
  strategy: ExplosionStrategy,
  t: number,
  preset: SpreadPreset = 'ENGINEERING',
  assemblies: AssemblyRef[] = [],
  scopeId: string | null = null
): Record<string, Vec3> {
  const out: Record<string, Vec3> = {};
  const k = Math.min(1, Math.max(0, t));
  if (k <= 0) {
    for (const p of parts) out[p.id] = [0, 0, 0];
    return out;
  }
  const asms = assemblies.length ? assemblies : inferAssemblies(parts);
  const scopeParts = partsInScope(scopeId, parts, asms);
  const profile = SPREAD[preset];
  const worldC = centroidOf(parts);
  if (strategy === 'STACK') {
    for (const p of parts) {
      if (scopeParts && !scopeParts.has(p.id)) {
        out[p.id] = [0, 0, 0];
        continue;
      }
      const base = p.explosion_distance_m > 0 ? p.explosion_distance_m : 0.08;
      const stage = Math.max(1, p.assembly_stage);
      const mag = base * profile.spreadScale * 0.28 * k * (0.35 + 0.06 * stage);
      out[p.id] = scale3(norm3(p.explosion_vector), mag);
    }
    return out;
  }

  const descendants = new Map<string, SpatialPart[]>();
  for (const a of asms) descendants.set(a.id, []);
  for (const p of parts) {
    let pid: string | null = p.parentId ?? null;
    const seen = new Set<string>();
    while (pid && !seen.has(pid)) {
      seen.add(pid);
      const list = descendants.get(pid);
      if (list) list.push(p);
      pid = asms.find((x) => x.id === pid)?.parent ?? null;
    }
  }

  const asmMemo = new Map<string, Vec3>();
  const offsetOf = (asmId: string): Vec3 => {
    const hit = asmMemo.get(asmId);
    if (hit) return hit;
    const a = asms.find((x) => x.id === asmId);
    const parentOff = a?.parent ? offsetOf(a.parent) : ([0, 0, 0] as Vec3);
    if (scopeId) {
      const scopedAsms = assemblyDescendants(scopeId, asms);
      if (!scopedAsms.has(asmId) && asmId !== scopeId) {
        asmMemo.set(asmId, [0, 0, 0]);
        return [0, 0, 0];
      }
    }
    const depth = assemblyDepth(asmId, asms);
    const roots = asms.filter((x) => !x.parent);
    if (!a?.parent && roots.length <= 1) {
      asmMemo.set(asmId, parentOff);
      return parentOff;
    }
    const majorK = stageWeight(k, 0.0, 0.35);
    const subK = stageWeight(k, 0.25, 0.6);
    const stageK = depth <= 1 ? majorK : subK;
    const kids = descendants.get(asmId) ?? [];
    const c = centroidOf(kids.length ? kids : parts.filter((p) => p.parentId === asmId));
    const parentKids = a.parent ? descendants.get(a.parent) ?? [] : parts;
    const pc = parentKids.length ? centroidOf(parentKids) : worldC;
    let dir = sub3(c, pc);
    if (len3(dir) < 1e-6) {
      let vx = 0, vy = 0, vz = 0;
      for (const p of kids) {
        vx += p.explosion_vector[0];
        vy += p.explosion_vector[1];
        vz += p.explosion_vector[2];
      }
      dir = [vx, vy, vz];
    }
    dir = norm3(dir);
    const mag = 0.085 * profile.spreadScale * profile.hierarchySpacing * (1 + 0.22 * depth) * stageK;
    const local = scale3(dir, mag);
    const total = add3(parentOff, local);
    asmMemo.set(asmId, total);
    return total;
  };

  const partK = stageWeight(k, 0.5, 1.0);
  for (const p of parts) {
    if (scopeParts && !scopeParts.has(p.id)) {
      out[p.id] = [0, 0, 0];
      continue;
    }
    const parentOff = p.parentId ? offsetOf(p.parentId) : ([0, 0, 0] as Vec3);
    let local: Vec3 = [0, 0, 0];
    if (partK > 0) {
      const base = p.explosion_distance_m > 0 ? p.explosion_distance_m : 0.08;
      local = scale3(norm3(p.explosion_vector), base * 0.55 * profile.spreadScale * 0.22 * partK);
    }
    out[p.id] = add3(parentOff, local);
  }
  return out;
}

export interface RenderLayers {
  explosion?: Vec3;
  focus?: Vec3;
  service?: Vec3;
  proposal?: Vec3;
  variant?: Vec3;
}

export function getFinalRenderTransform(canonical: Vec3, layers: RenderLayers = {}): Vec3 {
  return add3(
    add3(
      add3(add3(add3(canonical, layers.explosion ?? [0, 0, 0]), layers.focus ?? [0, 0, 0]), layers.service ?? [0, 0, 0]),
      layers.proposal ?? [0, 0, 0]
    ),
    layers.variant ?? [0, 0, 0]
  );
}

export function focusOffset(
  id: string,
  parent: string | null,
  focusId: string | null,
  exploding: boolean
): Vec3 {
  if (!focusId) return [0, 0, 0];
  if (id !== focusId && parent !== focusId) return [0, 0, 0];
  if (exploding) return [0, 0, 0];
  return [0.18, 0.12, 0];
}

export function primitiveSize(prim: { kind: string; sx?: number; sy?: number; sz?: number; radius?: number; height?: number }): Vec3 {
  if (prim.kind === 'box') return [prim.sx ?? 0.01, prim.sy ?? 0.01, prim.sz ?? 0.01];
  const d = (prim.radius ?? 0.01) * 2;
  return [d, d, prim.height ?? 0.01];
}

export function getEntityWorldBounds(
  origin: Vec3,
  size: Vec3,
  rpy: Vec3 = [0, 0, 0]
): { min: Vec3; max: Vec3 } {
  const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
  const corners: Vec3[] = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz]
  ];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const c of corners) {
    const w = add3(origin, rotateRpy(c, rpy));
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], w[i]);
      max[i] = Math.max(max[i], w[i]);
    }
  }
  return { min, max };
}

export function getScopeBounds(boxes: { min: Vec3; max: Vec3 }[]): { min: Vec3; max: Vec3; center: Vec3; radius: number } {
  if (!boxes.length) return { min: [0, 0, 0], max: [0, 0, 0], center: [0.4, 0.15, 0], radius: 1.2 };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(0.2, len3(sub3(max, min)) / 2);
  return { min, max, center, radius };
}

/**
 * Port coordinates are HOST-LOCAL.
 * worldPort = hostWorldTransform × portLocal
 * (`hostCanonical` is ignored — kept so old call sites type-check).
 */
export function transformHostPoint(
  portLocal: Vec3,
  _hostCanonical: Vec3,
  hostWorld: Vec3,
  rpy: Vec3 = [0, 0, 0]
): Vec3 {
  return worldPortFromLocal(portLocal, hostWorld, rpy);
}

/** world = hostWorld + R(hostRpy) * portLocal */
export function worldPortFromLocal(portLocal: Vec3, hostWorld: Vec3, rpy: Vec3 = [0, 0, 0]): Vec3 {
  return add3(hostWorld, rotateRpy(portLocal, rpy));
}

/** Inverse of rotateRpy (X then Y then Z). */
export function invRotateRpy(v: Vec3, rpy: Vec3): Vec3 {
  const [r, p, y] = rpy;
  const cy = Math.cos(y), sy = Math.sin(y);
  const cp = Math.cos(p), sp = Math.sin(p);
  const cr = Math.cos(r), sr = Math.sin(r);
  const x0 = v[0] * cy + v[1] * sy;
  const y0 = -v[0] * sy + v[1] * cy;
  const z0 = v[2];
  const x1 = x0 * cp - z0 * sp;
  const y1 = y0;
  const z1 = x0 * sp + z0 * cp;
  return [x1, y1 * cr + z1 * sr, -y1 * sr + z1 * cr];
}

export function worldToHostLocal(world: Vec3, hostWorld: Vec3, rpy: Vec3 = [0, 0, 0]): Vec3 {
  return invRotateRpy(sub3(world, hostWorld), rpy);
}

/** Aspect-aware distance so the AABB fills ~75–82% of the viewport. */
export function fitDistanceForAabb(
  size: Vec3,
  fovDeg: number,
  aspect: number,
  fill = 0.78
): number {
  const fillClamped = Math.min(0.82, Math.max(0.75, fill));
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.35, aspect));
  const distV = size[1] / 2 / Math.tan(vFov / 2) / fillClamped;
  const distH = size[0] / 2 / Math.tan(hFov / 2) / fillClamped;
  const distD = size[2] / 2 / Math.tan(vFov / 2) / fillClamped;
  return Math.max(0.45, distV, distH, distD);
}

export type FitIntent = 'assembled' | 'focus' | 'isolate' | 'part_exploded' | 'system_exploded' | 'variant' | 'selection';

export function resolveFitIntent(opts: {
  spatial: string;
  isolate: string | null;
  explodeContext: string | null;
  focusId: string | null;
  variantMode: string;
  explosion: number;
  explicit?: 'scene' | 'selection' | 'home' | 'previous' | 'scope' | 'none';
}): FitIntent {
  const { spatial, isolate, explodeContext, focusId, variantMode, explosion, explicit } = opts;
  if (explicit === 'home' || explicit === 'scene') return spatial.includes('EXPLOD') && explosion > 0.02
    ? (explodeContext ? 'part_exploded' : 'system_exploded')
    : 'assembled';
  if (explicit === 'selection' && !(spatial.includes('EXPLOD') && explosion > 0.02 && !focusId)) return 'selection';
  if (explicit === 'scope') return explodeContext ? 'part_exploded' : 'system_exploded';
  if (variantMode && variantMode !== 'NONE') return 'variant';
  if (spatial === 'ISOLATE' && isolate) return 'isolate';
  if (spatial === 'FOCUS' || (focusId && explosion <= 0.02)) return 'focus';
  if (spatial === 'PART_EXPLODED' || explodeContext) return 'part_exploded';
  if (spatial === 'SYSTEM_EXPLODED' || spatial === 'EXPLODED') return 'system_exploded';
  return 'assembled';
}
