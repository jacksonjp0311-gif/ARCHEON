import { describe, expect, it } from 'vitest';
import {
  alignEyeDirection,
  ARCHEON_WORLD_FRAME,
  CAMERA_UP_Z,
  cadFrameMismatch,
  engineeringGroundFromBounds,
  explosionOffset,
  frameFromCadMeta,
  getFinalRenderTransform,
  getRenderedEntityBounds,
  groundIntersectsBounds,
  homeEyeDirection,
  THREE_Y_UP_FRAME,
  worldPortFromLocal,
  zIncreasesUp,
  type SpatialPart
} from '@archeon/scene-engine';

const base = getRenderedEntityBounds({
  origin: [0, 0, 0.01],
  primitive: { kind: 'box', sx: 0.22, sy: 0.22, sz: 0.02 }
});
const column = getRenderedEntityBounds({
  origin: [0, 0, 0.06],
  primitive: { kind: 'cylinder', radius: 0.04, height: 0.08 }
});
const shoulder = getRenderedEntityBounds({
  origin: [0, 0, 0.2],
  primitive: { kind: 'box', sx: 0.12, sy: 0.12, sz: 0.08 }
});

describe('engineering Z-UP invariant', () => {
  it('declares RIGHT_HANDED Z_UP X_FORWARD meters', () => {
    expect(ARCHEON_WORLD_FRAME).toEqual({
      handedness: 'RIGHT_HANDED',
      upAxis: 'Z',
      forwardAxis: 'X',
      unit: 'm'
    });
    expect(CAMERA_UP_Z).toEqual([0, 0, 1]);
  });

  it('does not treat Three.js Y-up as the engineering world', () => {
    expect(cadFrameMismatch(THREE_Y_UP_FRAME)).toMatch(/Y-up/);
    expect(cadFrameMismatch(ARCHEON_WORLD_FRAME)).toBeNull();
  });

  it('Z increase means upward engineering position', () => {
    expect(zIncreasesUp(base.center, shoulder.center)).toBe(true);
    expect(shoulder.center[2]).toBeGreaterThan(base.center[2]);
  });
});

describe('construction ground vs machine', () => {
  const ground = engineeringGroundFromBounds([base, column, shoulder]);

  it('places the floor below the base plate', () => {
    expect(ground.z).toBeLessThan(base.min[2]);
    expect(base.min[2]).toBeGreaterThan(ground.z);
  });

  it('keeps the shoulder above the base', () => {
    expect(shoulder.min[2]).toBeGreaterThan(base.max[2] - 1e-6);
  });

  it('does not intersect assembled project bounds', () => {
    expect(groundIntersectsBounds(ground.z, [base, column, shoulder])).toBe(false);
  });

  it('uses 20–50 mm clearance', () => {
    expect(ground.clearance).toBeGreaterThanOrEqual(0.02);
    expect(ground.clearance).toBeLessThanOrEqual(0.05);
  });

  it('isolate/focus subset does not move project ground', () => {
    const project = engineeringGroundFromBounds([base, column, shoulder]);
    const isolated = engineeringGroundFromBounds([shoulder]);
    expect(isolated.z).not.toBeCloseTo(project.z);
  });
});

describe('camera orbit preserves Z-UP', () => {
  it('home eye has positive Z and camera.up is +Z', () => {
    const d = homeEyeDirection();
    expect(d[2]).toBeGreaterThan(0);
    expect(CAMERA_UP_Z).toEqual([0, 0, 1]);
  });

  it('axis aligns stay Z-up (no Y-up compensation)', () => {
    expect(alignEyeDirection('z')[2]).toBeGreaterThan(alignEyeDirection('z')[0]);
    expect(alignEyeDirection('x')[0]).toBeGreaterThan(0.9);
  });
});

describe('explode and ports preserve engineering frame', () => {
  const part: SpatialPart = {
    id: 'part.base.plate',
    origin_m: [0, 0, 0.01],
    explosion_vector: [0, 0, -1],
    explosion_distance_m: 0.12,
    assembly_stage: 1
  };

  it('downward explode stays on -Z', () => {
    const off = explosionOffset(part, 'SEQUENCE', 1, 7, 'ENGINEERING');
    expect(off[2]).toBeLessThan(0);
    expect(Math.abs(off[2])).toBeGreaterThan(Math.abs(off[0]));
    expect(Math.abs(off[2])).toBeGreaterThan(Math.abs(off[1]));
  });

  it('final transform does not swap Z into Y', () => {
    const p = getFinalRenderTransform([0, 0, 0.2], { explosion: [0, 0, -0.05] });
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(0);
    expect(p[2]).toBeCloseTo(0.15);
  });

  it('ports remain host-attached in XYZ', () => {
    const world = worldPortFromLocal([0, 0, 0.04], [0, 0, 0.2]);
    expect(world[2]).toBeCloseTo(0.24);
    expect(world[0]).toBeCloseTo(0);
  });
});

describe('CAD mesh transforms preserve engineering frame', () => {
  it('keeps mesh Z as vertical, not swapped to Y', () => {
    const b = getRenderedEntityBounds({
      origin: [0, 0, 0.2],
      primitive: { kind: 'box', sx: 0.1, sy: 0.1, sz: 0.08 },
      meshLocal: { min: [-0.05, -0.05, -0.04], max: [0.05, 0.05, 0.04] }
    });
    expect(b.source).toBe('mesh');
    expect(b.size[2]).toBeCloseTo(0.08);
    expect(b.center[2]).toBeCloseTo(0.2);
  });

  it('declares CAD source frame instead of converting Y-up', () => {
    const declared = frameFromCadMeta({ up_axis: 'Z', handedness: 'RIGHT_HANDED', forward_axis: 'X', units: 'm' });
    expect(cadFrameMismatch(declared)).toBeNull();
    const yUpStl = frameFromCadMeta({ up_axis: 'Y', handedness: 'RIGHT_HANDED', forward_axis: '-Z', units: 'm' });
    expect(cadFrameMismatch(yUpStl)).not.toBeNull();
  });
});
