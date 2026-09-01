/** Spatial explosion — an alternate projection of the assembly graph, not animation. */

export type ExplosionStrategy =
  | 'RADIAL'
  | 'AXIAL'
  | 'SEQUENCE'
  | 'SYSTEM'
  | 'BOM_FOCUS'
  | 'SERVICE'
  | 'GRAPH'
  | 'CUSTOM';

export type SpreadPreset = 'COMPACT' | 'NORMAL' | 'ENGINEERING' | 'WIDE' | 'EXTREME';

export interface ExplosionProfile {
  strategy: ExplosionStrategy;
  progress: number;
  spreadScale: number;
  minimumSeparation: number;
  hierarchySpacing: number;
  stageSpacing: number;
  radialSpacing: number;
  cameraMargin: number;
}

export const SPREAD_PRESETS: Record<SpreadPreset, Omit<ExplosionProfile, 'strategy' | 'progress'>> = {
  COMPACT: { spreadScale: 1.35, minimumSeparation: 0.05, hierarchySpacing: 0.55, stageSpacing: 0.09, radialSpacing: 0.85, cameraMargin: 1.35 },
  NORMAL: { spreadScale: 2.6, minimumSeparation: 0.09, hierarchySpacing: 0.95, stageSpacing: 0.16, radialSpacing: 1.15, cameraMargin: 1.55 },
  ENGINEERING: { spreadScale: 4.2, minimumSeparation: 0.16, hierarchySpacing: 1.25, stageSpacing: 0.24, radialSpacing: 1.55, cameraMargin: 1.85 },
  WIDE: { spreadScale: 6.8, minimumSeparation: 0.24, hierarchySpacing: 1.7, stageSpacing: 0.34, radialSpacing: 2.05, cameraMargin: 2.25 },
  EXTREME: { spreadScale: 10.5, minimumSeparation: 0.38, hierarchySpacing: 2.3, stageSpacing: 0.48, radialSpacing: 2.9, cameraMargin: 2.85 }
};

export interface SpatialPart {
  id: string;
  origin_m: [number, number, number];
  explosion_vector: [number, number, number];
  explosion_distance_m: number;
  assembly_stage: number;
  parentId?: string | null;
  depth?: number;
  servicePath?: [number, number, number][];
}

export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function len3(v: [number, number, number]): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function norm3(v: [number, number, number]): [number, number, number] {
  const n = len3(v);
  if (n < 1e-9) return [0, 0, 1];
  return [v[0] / n, v[1] / n, v[2] / n];
}

function scale3(v: [number, number, number], s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function add3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function profileFor(preset: SpreadPreset, strategy: ExplosionStrategy, progress: number): ExplosionProfile {
  return { strategy, progress: Math.min(1, Math.max(0, progress)), ...SPREAD_PRESETS[preset] };
}

/**
 * Deterministic exploded offset.
 * magnitude = baseDistance × hierarchy × stage × spreadScale × smoothstep(progress)
 * then clamped to minimumSeparation × progress.
 */
export function explosionOffset(
  part: SpatialPart,
  strategy: ExplosionStrategy,
  t: number,
  sequenceLen: number,
  preset: SpreadPreset = 'ENGINEERING'
): [number, number, number] {
  const p = profileFor(preset, strategy, t);
  const k = smoothstep(p.progress);
  if (k <= 0) return [0, 0, 0];

  const depth = Math.max(0, part.depth ?? 0);
  const stage = Math.max(1, part.assembly_stage);
  const rank = Math.max(1, sequenceLen - stage);
  const base = part.explosion_distance_m > 0 ? part.explosion_distance_m : 0.12;
  const v = norm3(part.explosion_vector);

  let dir: [number, number, number] = v;
  let mag = base * p.spreadScale * k;

  switch (strategy) {
    case 'SEQUENCE':
      mag *= 0.55 + p.stageSpacing * rank + p.hierarchySpacing * 0.15 * depth;
      break;
    case 'AXIAL':
      dir = [0, 0, part.explosion_vector[2] === 0 ? 1 : Math.sign(part.explosion_vector[2])];
      mag *= 0.7 + p.hierarchySpacing * 0.2 * depth;
      break;
    case 'SYSTEM': {
      const assemblyK = smoothstep(Math.min(1, p.progress / 0.45));
      const childK = p.progress > 0.35 ? smoothstep((p.progress - 0.35) / 0.65) : 0;
      const assemblyMag = base * p.spreadScale * p.hierarchySpacing * assemblyK * (depth === 0 ? 1.15 : 0.35);
      const childMag = base * p.spreadScale * p.stageSpacing * childK * (1 + depth);
      mag = assemblyMag + childMag;
      break;
    }
    case 'BOM_FOCUS':
      mag *= 0.22 + 0.08 * depth;
      break;
    case 'SERVICE':
      if (part.servicePath && part.servicePath.length >= 2) {
        const a = part.servicePath[0];
        const b = part.servicePath[part.servicePath.length - 1];
        dir = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      }
      mag *= 1.15 + p.hierarchySpacing * 0.2;
      break;
    case 'GRAPH':
      mag *= 0.7 + p.radialSpacing * 0.25 + 0.12 * depth;
      break;
    case 'CUSTOM':
      mag *= 1;
      break;
    default:
      mag *= p.radialSpacing * (0.55 + 0.12 * rank * 0.08 + 0.18 * depth);
  }

  mag = Math.max(mag, p.minimumSeparation * k * (1 + 0.15 * depth));
  return scale3(dir, mag);
}

export function renderTransform(
  origin: [number, number, number],
  explosion: [number, number, number],
  focus: [number, number, number] = [0, 0, 0],
  service: [number, number, number] = [0, 0, 0],
  proposal: [number, number, number] = [0, 0, 0]
): [number, number, number] {
  return add3(add3(add3(add3(origin, explosion), focus), service), proposal);
}

export function worldBox(
  origin: [number, number, number],
  size: [number, number, number]
): { min: [number, number, number]; max: [number, number, number] } {
  const hx = size[0] / 2;
  const hy = size[1] / 2;
  const hz = size[2] / 2;
  return {
    min: [origin[0] - hx, origin[1] - hy, origin[2] - hz],
    max: [origin[0] + hx, origin[1] + hy, origin[2] + hz]
  };
}

export function fitSphere(
  boxes: { min: [number, number, number]; max: [number, number, number] }[]
): { center: [number, number, number]; radius: number } {
  if (!boxes.length) return { center: [0.4, 0.15, 0], radius: 1.2 };
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2
  ];
  const radius = Math.max(0.2, len3([max[0] - min[0], max[1] - min[1], max[2] - min[2]]) / 2);
  return { center, radius };
}

/**
 * SYSTEM explosion: subassemblies separate first, then children.
 * Other strategies remain per-part deterministic offsets.
 */
export function hierarchicalOffsets(
  parts: SpatialPart[],
  strategy: ExplosionStrategy,
  t: number,
  preset: SpreadPreset = 'ENGINEERING'
): Record<string, [number, number, number]> {
  const n = Math.max(1, parts.length);
  const out: Record<string, [number, number, number]> = {};
  if (strategy !== 'SYSTEM') {
    for (const p of parts) out[p.id] = explosionOffset(p, strategy, t, n, preset);
    return out;
  }
  const profile = profileFor(preset, strategy, t);
  const assemblyK = smoothstep(Math.min(1, profile.progress / 0.45));
  const childK = profile.progress > 0.35 ? smoothstep((profile.progress - 0.35) / 0.65) : 0;
  if (assemblyK <= 0 && childK <= 0) {
    for (const p of parts) out[p.id] = [0, 0, 0];
    return out;
  }
  const groups = new Map<string, SpatialPart[]>();
  for (const part of parts) {
    const key = part.parentId ?? '_root';
    const list = groups.get(key) ?? [];
    list.push(part);
    groups.set(key, list);
  }
  let cx = 0, cy = 0, cz = 0;
  for (const part of parts) {
    cx += part.origin_m[0];
    cy += part.origin_m[1];
    cz += part.origin_m[2];
  }
  const inv = 1 / Math.max(1, parts.length);
  const worldC: [number, number, number] = [cx * inv, cy * inv, cz * inv];
  const asmOff = new Map<string, [number, number, number]>();
  for (const [key, group] of groups) {
    let gx = 0, gy = 0, gz = 0;
    let vx = 0, vy = 0, vz = 0;
    for (const part of group) {
      gx += part.origin_m[0];
      gy += part.origin_m[1];
      gz += part.origin_m[2];
      vx += part.explosion_vector[0];
      vy += part.explosion_vector[1];
      vz += part.explosion_vector[2];
    }
    const ginv = 1 / group.length;
    const centroid: [number, number, number] = [gx * ginv, gy * ginv, gz * ginv];
    let dir: [number, number, number] = [centroid[0] - worldC[0], centroid[1] - worldC[1], centroid[2] - worldC[2]];
    if (len3(dir) < 1e-6) dir = norm3([vx, vy, vz]);
    else dir = norm3(dir);
    const mag = 0.22 * profile.spreadScale * profile.hierarchySpacing * assemblyK;
    asmOff.set(key, scale3(dir, mag));
  }
  for (const part of parts) {
    const parentOff = asmOff.get(part.parentId ?? '_root') ?? [0, 0, 0];
    const child = explosionOffset(part, 'RADIAL', childK, n, preset);
    out[part.id] = add3(parentOff, child);
  }
  return out;
}
