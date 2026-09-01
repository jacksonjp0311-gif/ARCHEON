import { describe, expect, it } from 'vitest';
import { applySceneCommand, emptyScene, explosionOffset, hierarchicalOffsets, type SpatialPart } from '@archeon/scene-engine';

function parts(n: number): SpatialPart[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `part.${i}`,
    origin_m: [i * 0.05, 0, 0] as [number, number, number],
    explosion_vector: [1, 0, 0] as [number, number, number],
    explosion_distance_m: 0.2,
    assembly_stage: (i % 7) + 1,
    depth: i % 3,
    parentId: `asm.${i % 5}`
  }));
}

describe('v0.3 benches (measured, not invented)', () => {
  it('explosion 200 parts', () => {
    const list = parts(200);
    const t0 = performance.now();
    hierarchicalOffsets(list, 'SYSTEM', 0.7, 'ENGINEERING');
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`bench explosion_200 ${ms.toFixed(3)} ms`);
    expect(ms).toBeLessThan(50);
  });

  it('scene-command latency', () => {
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      applySceneCommand(emptyScene(), { op: 'focus_entity', entity_id: 'asm.shoulder', ghost_others: true });
    }
    const ms = (performance.now() - t0) / 1000;
    // eslint-disable-next-line no-console
    console.log(`bench scene_command_us ${(ms * 1000).toFixed(3)} µs`);
    expect(ms).toBeLessThan(1);
  });

  it('single offset is deterministic', () => {
    const p = parts(1)[0];
    expect(explosionOffset(p, 'RADIAL', 0.4, 9, 'ENGINEERING')).toEqual(explosionOffset(p, 'RADIAL', 0.4, 9, 'ENGINEERING'));
  });
});
