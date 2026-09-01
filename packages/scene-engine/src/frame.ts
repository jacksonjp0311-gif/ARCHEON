/** ARCHEON engineering world frame. DesignIR is never silently Y-up. */

export type Vec3 = [number, number, number];
export type Handedness = 'RIGHT_HANDED' | 'LEFT_HANDED';
export type AxisName = 'X' | 'Y' | 'Z' | '-X' | '-Y' | '-Z';
export type LengthUnit = 'm' | 'mm' | 'in';

export interface EngineeringFrame {
  handedness: Handedness;
  upAxis: AxisName;
  forwardAxis: AxisName;
  unit: LengthUnit;
}

/** Architecture invariant. Three.js defaults are Y-up; the workstation is not. */
export const ARCHEON_WORLD_FRAME: EngineeringFrame = {
  handedness: 'RIGHT_HANDED',
  upAxis: 'Z',
  forwardAxis: 'X',
  unit: 'm'
};

/** Three.js / glTF camera default. Never mix this with DesignIR without an explicit adapter. */
export const THREE_Y_UP_FRAME: EngineeringFrame = {
  handedness: 'RIGHT_HANDED',
  upAxis: 'Y',
  forwardAxis: '-Z',
  unit: 'm'
};

export const CAMERA_UP_Z: Vec3 = [0, 0, 1];

/** Isometric eye offset in engineering coordinates (X forward, Y lateral, Z up). */
export const HOME_EYE_OFFSET: Vec3 = [0.92, 0.74, 0.58];

export function framesEqual(a: EngineeringFrame, b: EngineeringFrame): boolean {
  return a.handedness === b.handedness && a.upAxis === b.upAxis && a.forwardAxis === b.forwardAxis && a.unit === b.unit;
}

export function isArcheonWorld(frame: EngineeringFrame): boolean {
  return framesEqual(frame, ARCHEON_WORLD_FRAME);
}

export function axisIndex(axis: AxisName): { index: 0 | 1 | 2; sign: 1 | -1 } {
  const name = axis.replace('-', '');
  const index = name === 'X' ? 0 : name === 'Y' ? 1 : 2;
  const sign: 1 | -1 = axis.startsWith('-') ? -1 : 1;
  return { index, sign };
}

export function frameFromCadMeta(meta?: {
  up_axis?: string;
  handedness?: string;
  forward_axis?: string;
  units?: string;
} | null): EngineeringFrame {
  const up = (meta?.up_axis || 'Z').toUpperCase() as AxisName;
  const forward = (meta?.forward_axis || 'X').toUpperCase() as AxisName;
  const handed = (meta?.handedness || 'RIGHT_HANDED').toUpperCase() as Handedness;
  const unit = (meta?.units === 'mm' || meta?.units === 'in' ? meta.units : 'm') as LengthUnit;
  return { handedness: handed, upAxis: up, forwardAxis: forward, unit };
}

/**
 * Imported/generated CAD is displayed in its declared frame.
 * A mismatch is reported, never converted by guessing a rotation.
 */
export function cadFrameMismatch(
  source: EngineeringFrame,
  target: EngineeringFrame = ARCHEON_WORLD_FRAME
): string | null {
  if (framesEqual(source, target)) return null;
  return `source ${source.upAxis}-up ${source.forwardAxis}-forward ${source.unit} vs world ${target.upAxis}-up ${target.forwardAxis}-forward ${target.unit}`;
}

export function homeEyeDirection(): Vec3 {
  const n = Math.hypot(...HOME_EYE_OFFSET);
  return [HOME_EYE_OFFSET[0] / n, HOME_EYE_OFFSET[1] / n, HOME_EYE_OFFSET[2] / n];
}

export function alignEyeDirection(axis: 'x' | 'y' | 'z' | null): Vec3 {
  if (axis === 'x') return [1, 0, 0.12];
  if (axis === 'y') return [0, 1, 0.12];
  if (axis === 'z') return [0.06, 0.04, 1];
  return homeEyeDirection();
}

export function groundClearanceM(horizontalSpan: number): number {
  return Math.min(0.05, Math.max(0.02, horizontalSpan * 0.04));
}

export interface EngineeringGround {
  x: number;
  y: number;
  z: number;
  clearance: number;
}

/**
 * Visual construction floor on the XY plane, below the assembled project.
 * Never derived from isolate/focus subset — that would slice the selected part.
 */
export function engineeringGroundFromBounds(boxes: { min: Vec3; max: Vec3 }[]): EngineeringGround {
  if (!boxes.length) return { x: 0.4, y: 0, z: -0.03, clearance: 0.03 };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.min[0]);
    maxX = Math.max(maxX, b.max[0]);
    minY = Math.min(minY, b.min[1]);
    maxY = Math.max(maxY, b.max[1]);
    minZ = Math.min(minZ, b.min[2]);
  }
  const span = Math.max(maxX - minX, maxY - minY, 0.05);
  const clearance = groundClearanceM(span);
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: minZ - clearance,
    clearance
  };
}

export function groundIntersectsBounds(groundZ: number, boxes: { min: Vec3; max: Vec3 }[]): boolean {
  return boxes.some((b) => b.min[2] < groundZ + 1e-9);
}

export function zIncreasesUp(lower: Vec3, higher: Vec3): boolean {
  return higher[2] > lower[2];
}
