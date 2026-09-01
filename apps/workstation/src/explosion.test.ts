import { describe, expect, it } from 'vitest';
import { explosionOffset } from '@archeon/scene-engine';

describe('explosionOffset', () => {
  const part = {
    id: 'part.a',
    origin_m: [0, 0, 0] as [number, number, number],
    explosion_vector: [1, 0, 0] as [number, number, number],
    explosion_distance_m: 0.2,
    assembly_stage: 3
  };

  it('is deterministic', () => {
    const a = explosionOffset(part, 'RADIAL', 0.5, 7);
    const b = explosionOffset(part, 'RADIAL', 0.5, 7);
    expect(a).toEqual(b);
    expect(a[0]).toBeCloseTo(0.1, 12);
    expect(a[1]).toBe(0);
  });

  it('assembled factor is zero', () => {
    expect(explosionOffset(part, 'SEQUENCE', 0, 7)).toEqual([0, 0, 0]);
  });
});
