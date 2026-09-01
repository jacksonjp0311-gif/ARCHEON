import { describe, expect, it } from 'vitest';
import { explosionOffset, hierarchicalOffsets, profileFor, type SpatialPart } from '@archeon/scene-engine';

const part: SpatialPart = {
  id: 'part.a',
  origin_m: [0, 0, 0],
  explosion_vector: [1, 0, 0],
  explosion_distance_m: 0.2,
  assembly_stage: 3,
  depth: 1
};

describe('explosionOffset v2', () => {
  it('is deterministic', () => {
    const a = explosionOffset(part, 'RADIAL', 0.5, 7, 'ENGINEERING');
    const b = explosionOffset(part, 'RADIAL', 0.5, 7, 'ENGINEERING');
    expect(a).toEqual(b);
  });

  it('assembled factor is zero', () => {
    expect(explosionOffset(part, 'SEQUENCE', 0, 7, 'ENGINEERING')).toEqual([0, 0, 0]);
  });

  it('ENGINEERING spread exceeds COMPACT', () => {
    const compact = explosionOffset(part, 'RADIAL', 1, 7, 'COMPACT');
    const engineering = explosionOffset(part, 'RADIAL', 1, 7, 'ENGINEERING');
    expect(Math.hypot(...engineering)).toBeGreaterThan(Math.hypot(...compact));
  });

  it('deeper hierarchy moves farther at SYSTEM explode', () => {
    const root = explosionOffset({ ...part, depth: 0, assembly_stage: 1 }, 'SYSTEM', 1, 7, 'ENGINEERING');
    const leaf = explosionOffset({ ...part, depth: 2, assembly_stage: 5 }, 'SYSTEM', 1, 7, 'ENGINEERING');
    expect(Math.hypot(...leaf)).toBeGreaterThan(Math.hypot(...root) * 0.4);
  });

  it('profile progress is clamped', () => {
    expect(profileFor('WIDE', 'SEQUENCE', 2).progress).toBe(1);
    expect(profileFor('WIDE', 'SEQUENCE', -1).progress).toBe(0);
  });
});

describe('hierarchicalOffsets SYSTEM', () => {
  it('is zero at progress 0', () => {
    const a: SpatialPart = { ...part, id: 'a', parentId: 'asm.s', origin_m: [0, 0, 0] };
    const b: SpatialPart = { ...part, id: 'b', parentId: 'asm.u', origin_m: [0.4, 0, 0], explosion_vector: [0, 1, 0] };
    const off = hierarchicalOffsets([a, b], 'SYSTEM', 0, 'ENGINEERING');
    expect(off.a).toEqual([0, 0, 0]);
    expect(off.b).toEqual([0, 0, 0]);
  });

  it('separates different parent assemblies', () => {
    const a: SpatialPart = { ...part, id: 'a', parentId: 'asm.s', origin_m: [0, 0, 0] };
    const b: SpatialPart = { ...part, id: 'b', parentId: 'asm.u', origin_m: [0.4, 0, 0], explosion_vector: [0, 1, 0] };
    const off = hierarchicalOffsets([a, b], 'SYSTEM', 0.4, 'ENGINEERING');
    const dx = off.a[0] - off.b[0];
    const dy = off.a[1] - off.b[1];
    const dz = off.a[2] - off.b[2];
    expect(Math.hypot(dx, dy, dz)).toBeGreaterThan(0.05);
  });
});
