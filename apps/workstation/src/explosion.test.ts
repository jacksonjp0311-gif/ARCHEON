import { describe, expect, it } from 'vitest';
import { applySceneCommand, emptyScene, explosionOffset, hierarchicalOffsets, nudgeSpread, profileFor, type SpatialPart } from '@archeon/scene-engine';

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

describe('scene command bus', () => {
  it('focus_entity is deterministic', () => {
    const a = applySceneCommand(emptyScene(), { op: 'focus_entity', entity_id: 'asm.shoulder', ghost_others: true });
    const b = applySceneCommand(emptyScene(), { op: 'focus_entity', entity_id: 'asm.shoulder', ghost_others: true });
    expect(a).toEqual(b);
    expect(a.selectedId).toBe('asm.shoulder');
    expect(a.ghostOthers).toBe(true);
  });

  it('explode_entity uses selected context', () => {
    const s = applySceneCommand({ ...emptyScene(), selectedId: 'asm.shoulder' }, { op: 'explode_entity', factor: 0.85 });
    expect(s.explodeContext).toBe('asm.shoulder');
    expect(s.explosion).toBe(0.85);
  });

  it('restore_display clears automation', () => {
    const s = applySceneCommand(
      applySceneCommand(emptyScene(), { op: 'focus_entity', entity_id: 'p', ghost_others: true }),
      { op: 'restore_display' }
    );
    expect(s.ghostOthers).toBe(false);
    expect(s.explosion).toBe(0);
    expect(s.isolate).toBeNull();
  });

  it('clear_selection and track_entity', () => {
    let s = applySceneCommand(emptyScene(), { op: 'track_entity', entity_id: 'part.a' });
    s = applySceneCommand(s, { op: 'select_entity', entity_id: 'part.a' });
    s = applySceneCommand(s, { op: 'clear_selection' });
    expect(s.selectedId).toBeNull();
    expect(s.trackedIds).toEqual(['part.a']);
  });

  it('ghost_others and fit_scene', () => {
    const s = applySceneCommand(emptyScene(), { op: 'ghost_others', enabled: true });
    expect(applySceneCommand(s, { op: 'fit_scene' }).fitRequest).toBe('scene');
  });

  it('compare_variants is deterministic', () => {
    const s = applySceneCommand(emptyScene(), { op: 'compare_variants', mode: 'SPREAD' });
    expect(s.variantMode).toBe('SPREAD');
    expect(nudgeSpread('ENGINEERING', 1)).toBe('WIDE');
    expect(nudgeSpread('COMPACT', -1)).toBe('COMPACT');
  });
});
