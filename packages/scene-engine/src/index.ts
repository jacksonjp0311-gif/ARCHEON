/** Spatial explosion — an alternate projection of the assembly graph, not animation. */

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
    case 'STACK':
      dir = v;
      mag *= 0.55 + 0.08 * stage;
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

export {
  recursiveExplosionOffsets,
  resolveExplodeContext,
  partsInScope,
  assemblyDescendants,
  getFinalRenderTransform,
  getEntityWorldBounds,
  getScopeBounds,
  transformHostPoint,
  worldPortFromLocal,
  worldToHostLocal,
  invRotateRpy,
  fitDistanceForAabb,
  resolveFitIntent,
  focusOffset,
  primitiveSize,
  stageWeight
} from './explode';
export type { AssemblyRef, FitIntent, RenderLayers, Vec3 } from './explode';

import { recursiveExplosionOffsets, type AssemblyRef } from './explode';

/**
 * Recursive assembly-aware explosion. Optional assemblies + scope.
 * Out-of-scope parts stay at zero offset (no residual drift).
 */
export function hierarchicalOffsets(
  parts: SpatialPart[],
  strategy: ExplosionStrategy,
  t: number,
  preset: SpreadPreset = 'ENGINEERING',
  assemblies: AssemblyRef[] = [],
  scopeId: string | null = null
): Record<string, [number, number, number]> {
  return recursiveExplosionOffsets(parts, strategy, t, preset, assemblies, scopeId);
}

/** Semantic scene commands. Agents never animate frames; the scene engine interpolates. */
export type SceneCommand =
  | { op: 'focus_entity'; entity_id: string; ghost_others?: boolean; duration_ms?: number }
  | { op: 'focus_assembly'; entity_id: string; ghost_others?: boolean; duration_ms?: number }
  | { op: 'explode_entity'; entity_id?: string | null; factor?: number }
  | { op: 'explode_system'; factor?: number }
  | { op: 'set_explosion'; progress: number }
  | { op: 'set_explosion_spread'; spread: SpreadPreset }
  | { op: 'ghost_others'; enabled: boolean }
  | { op: 'restore_display' }
  | { op: 'show_overlay'; overlay: string }
  | { op: 'hide_overlay' }
  | { op: 'fit_scene' }
  | { op: 'fit_selection' }
  | { op: 'align_camera'; axis?: 'x' | 'y' | 'z' }
  | { op: 'track_entity'; entity_id: string }
  | { op: 'untrack_entity'; entity_id: string }
  | { op: 'clear_selection' }
  | { op: 'select_entity'; entity_id: string }
  | { op: 'isolate_entity'; entity_id: string }
  | { op: 'compare_variants'; mode: 'SPREAD' | 'STACK' | 'OVERLAY' | 'FOCUS' | 'COMPARE' }
  | { op: 'select_variant'; id: string }
  | { op: 'previous_view' }
  | { op: 'home_view' }
  | { op: 'show_affected' };

export const SPREAD_ORDER: SpreadPreset[] = ['COMPACT', 'NORMAL', 'ENGINEERING', 'WIDE', 'EXTREME'];

export interface SceneSnapshot {
  selectedId: string | null;
  trackedIds: string[];
  neighborhoodIds: string[];
  ghostOthers: boolean;
  focusId: string | null;
  explosion: number;
  spread: SpreadPreset;
  explodeContext: string | null;
  isolate: string | null;
  overlay: string;
  spatial: string;
  variantMode: 'NONE' | 'SPREAD' | 'STACK' | 'OVERLAY' | 'FOCUS' | 'COMPARE';
  activeVariant: string | null;
  cameraAxis: 'x' | 'y' | 'z' | null;
  fitRequest: 'none' | 'scene' | 'selection' | 'home' | 'previous' | 'scope';
}

export function emptyScene(): SceneSnapshot {
  return {
    selectedId: null,
    trackedIds: [],
    neighborhoodIds: [],
    ghostOthers: false,
    focusId: null,
    explosion: 0,
    spread: 'ENGINEERING',
    explodeContext: null,
    isolate: null,
    overlay: 'NONE',
    spatial: 'ASSEMBLED',
    variantMode: 'NONE',
    activeVariant: null,
    cameraAxis: null,
    fitRequest: 'none'
  };
}

export function applySceneCommand(state: SceneSnapshot, cmd: SceneCommand): SceneSnapshot {
  switch (cmd.op) {
    case 'select_entity':
      return {
        ...state,
        selectedId: cmd.entity_id,
        fitRequest: state.explosion > 0.02 || String(state.spatial).includes('EXPLOD') ? 'none' : 'selection'
      };
    case 'clear_selection':
      return { ...state, selectedId: null, neighborhoodIds: [], ghostOthers: false, focusId: null, fitRequest: 'none' };
    case 'focus_entity':
    case 'focus_assembly':
      return {
        ...state,
        selectedId: cmd.entity_id,
        focusId: cmd.entity_id,
        ghostOthers: cmd.ghost_others !== false,
        isolate: null,
        spatial: state.explosion > 0.02 || String(state.spatial).includes('EXPLOD') ? state.spatial : 'FOCUS',
        fitRequest: 'selection'
      };
    case 'explode_entity':
      return {
        ...state,
        explodeContext: cmd.entity_id ?? state.selectedId,
        explosion: cmd.factor ?? 0.85,
        spatial: 'PART_EXPLODED',
        focusId: null,
        isolate: null,
        fitRequest: 'scope'
      };
    case 'explode_system':
      return {
        ...state,
        explosion: cmd.factor ?? 0.7,
        spatial: 'SYSTEM_EXPLODED',
        explodeContext: null,
        focusId: null,
        isolate: null,
        fitRequest: 'scope'
      };
    case 'set_explosion': {
      const progress = Math.min(1, Math.max(0, cmd.progress));
      return {
        ...state,
        explosion: progress,
        spatial: progress <= 0 ? 'ASSEMBLED' : state.explodeContext ? 'PART_EXPLODED' : state.spatial === 'ASSEMBLED' ? 'EXPLODED' : state.spatial,
        explodeContext: progress <= 0 ? null : state.explodeContext,
        fitRequest: 'none'
      };
    }
    case 'set_explosion_spread':
      return { ...state, spread: cmd.spread };
    case 'ghost_others':
      return { ...state, ghostOthers: cmd.enabled };
    case 'restore_display':
      return {
        ...state,
        ghostOthers: false,
        isolate: null,
        focusId: null,
        explosion: 0,
        explodeContext: null,
        spatial: 'ASSEMBLED',
        overlay: 'NONE',
        variantMode: 'NONE',
        fitRequest: 'home'
      };
    case 'show_overlay':
      return { ...state, overlay: cmd.overlay };
    case 'hide_overlay':
      return { ...state, overlay: 'NONE' };
    case 'fit_scene':
      return { ...state, fitRequest: state.explodeContext ? 'scope' : 'scene' };
    case 'fit_selection':
      return { ...state, fitRequest: 'selection' };
    case 'align_camera':
      return { ...state, cameraAxis: cmd.axis ?? 'y', fitRequest: 'scene' };
    case 'track_entity':
      return { ...state, trackedIds: state.trackedIds.includes(cmd.entity_id) ? state.trackedIds : [...state.trackedIds, cmd.entity_id] };
    case 'untrack_entity':
      return { ...state, trackedIds: state.trackedIds.filter((id) => id !== cmd.entity_id) };
    case 'isolate_entity':
      return { ...state, isolate: cmd.entity_id, selectedId: cmd.entity_id, spatial: 'ISOLATE', fitRequest: 'selection' };
    case 'compare_variants':
      return { ...state, variantMode: cmd.mode, fitRequest: 'scene' };
    case 'select_variant':
      return { ...state, activeVariant: cmd.id, variantMode: state.variantMode === 'NONE' ? 'FOCUS' : state.variantMode };
    case 'previous_view':
      return { ...state, fitRequest: 'previous' };
    case 'home_view':
      return {
        ...state,
        fitRequest: 'home',
        explosion: 0,
        isolate: null,
        ghostOthers: false,
        spatial: 'ASSEMBLED',
        explodeContext: null,
        focusId: null
      };
    case 'show_affected':
      return { ...state, ghostOthers: true, overlay: 'AGENT_DIFF', fitRequest: 'selection' };
    default:
      return state;
  }
}

export function nudgeSpread(current: SpreadPreset, dir: 1 | -1): SpreadPreset {
  const i = SPREAD_ORDER.indexOf(current);
  return SPREAD_ORDER[Math.min(SPREAD_ORDER.length - 1, Math.max(0, i + dir))];
}

