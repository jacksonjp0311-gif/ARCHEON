import { describe, expect, it } from 'vitest';
import {
  applySceneCommand,
  emptyScene,
  explosionOffset,
  getFinalRenderTransform,
  getEntityWorldBounds,
  hierarchicalOffsets,
  nudgeSpread,
  profileFor,
  resolveExplodeContext,
  resolveFitIntent,
  transformHostPoint,
  worldPortFromLocal,
  worldToHostLocal,
  fitDistanceForAabb,
  type SpatialPart
} from '@archeon/scene-engine';
import { composeFromLegacy, emptyOverlays, enableOverlay, primaryOverlayName } from '@archeon/spatial-grammar';

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

  it('clear_selection does not destroy system explosion', () => {
    let s = applySceneCommand(emptyScene(), { op: 'explode_system', factor: 0.7 });
    s = applySceneCommand(s, { op: 'select_entity', entity_id: 'part.a' });
    s = applySceneCommand(s, { op: 'clear_selection' });
    expect(s.explosion).toBe(0.7);
    expect(s.spatial).toBe('SYSTEM_EXPLODED');
    expect(s.selectedId).toBeNull();
  });

  it('explode_entity clears focus pull', () => {
    let s = applySceneCommand(emptyScene(), { op: 'focus_entity', entity_id: 'part.a' });
    s = applySceneCommand(s, { op: 'explode_entity', entity_id: 'asm.shoulder', factor: 0.8 });
    expect(s.focusId).toBeNull();
    expect(s.spatial).toBe('PART_EXPLODED');
    expect(s.fitRequest).toBe('scope');
  });

  it('restore_display resets explosion scope', () => {
    let s = applySceneCommand(emptyScene(), { op: 'explode_entity', entity_id: 'asm.shoulder' });
    s = applySceneCommand(s, { op: 'restore_display' });
    expect(s.explodeContext).toBeNull();
    expect(s.explosion).toBe(0);
    expect(s.spatial).toBe('ASSEMBLED');
  });
});

describe('explode scope', () => {
  const assemblies = [
    { id: 'asm.arm', parent: null as string | null },
    { id: 'asm.shoulder', parent: 'asm.arm' },
    { id: 'asm.base', parent: 'asm.arm' }
  ];
  const parts = [
    { id: 'part.shoulder.housing', parent: 'asm.shoulder' },
    { id: 'part.shoulder.shaft', parent: 'asm.shoulder' },
    { id: 'part.base.plate', parent: 'asm.base' }
  ];

  it('leaf part resolves to containing assembly', () => {
    expect(resolveExplodeContext('part.shoulder.housing', parts, assemblies)).toBe('asm.shoulder');
  });

  it('assembly stays itself', () => {
    expect(resolveExplodeContext('asm.shoulder', parts, assemblies)).toBe('asm.shoulder');
  });

  it('local explosion does not move out-of-scope parts', () => {
    const spatial: SpatialPart[] = parts.map((p, i) => ({
      id: p.id,
      origin_m: [i * 0.2, 0, 0] as [number, number, number],
      explosion_vector: [1, 0, 0] as [number, number, number],
      explosion_distance_m: 0.2,
      assembly_stage: i + 1,
      parentId: p.parent
    }));
    const off = hierarchicalOffsets(spatial, 'SYSTEM', 1, 'ENGINEERING', assemblies, 'asm.shoulder');
    expect(off['part.base.plate']).toEqual([0, 0, 0]);
    expect(Math.hypot(...off['part.shoulder.housing'])).toBeGreaterThan(0.01);
  });

  it('child offset includes parent assembly offset', () => {
    const spatial: SpatialPart[] = parts.map((p, i) => ({
      id: p.id,
      origin_m: [i * 0.3, 0, 0.1] as [number, number, number],
      explosion_vector: [0, 0, 1] as [number, number, number],
      explosion_distance_m: 0.05,
      assembly_stage: i + 1,
      parentId: p.parent
    }));
    const mid = hierarchicalOffsets(spatial, 'SYSTEM', 0.3, 'ENGINEERING', assemblies, null);
    const full = hierarchicalOffsets(spatial, 'SYSTEM', 1, 'ENGINEERING', assemblies, null);
    const midMove = Math.hypot(...mid['part.shoulder.housing']);
    const fullMove = Math.hypot(...full['part.shoulder.housing']);
    expect(fullMove).toBeGreaterThan(midMove);
  });
});

describe('final transform and bounds', () => {
  it('composes canonical + explosion + focus', () => {
    const p = getFinalRenderTransform([1, 0, 0], { explosion: [0, 0.2, 0], focus: [0.1, 0, 0] });
    expect(p).toEqual([1.1, 0.2, 0]);
  });

  it('rotated bounds are not axis-aligned primitive only', () => {
    const b = getEntityWorldBounds([0, 0, 0], [2, 0.2, 0.2], [0, 0, Math.PI / 2]);
    expect(b.max[1] - b.min[1]).toBeGreaterThan(1);
  });

  it('ports are host-local, not canonical-world mixed', () => {
    const local: [number, number, number] = [0.1, 0, 0];
    const hostWorld: [number, number, number] = [0.5, 0, 0.2];
    const p = worldPortFromLocal(local, hostWorld);
    expect(p[0]).toBeCloseTo(0.6);
    expect(p[2]).toBeCloseTo(0.2);
    const back = worldToHostLocal(p, hostWorld);
    expect(back[0]).toBeCloseTo(0.1);
    expect(back[2]).toBeCloseTo(0);
    const viaLegacy = transformHostPoint(local, [9, 9, 9], hostWorld);
    expect(viaLegacy[0]).toBeCloseTo(0.6);
  });

  it('aspect-aware fit is longer for a long thin AABB than a cube of same radius', () => {
    const long = fitDistanceForAabb([1.6, 0.2, 0.2], 42, 16 / 9, 0.78);
    const cube = fitDistanceForAabb([0.4, 0.4, 0.4], 42, 16 / 9, 0.78);
    expect(long).toBeGreaterThan(cube);
  });

  it('exploded spatial mode does not imply explode trails', () => {
    expect(composeFromLegacy('EXPLODED').overlay).toBe('NONE');
    expect(composeFromLegacy('SYSTEM_EXPLODED').overlay).toBe('NONE');
    expect(emptyOverlays().explodeTrails).toBe(false);
    const on = enableOverlay(emptyOverlays(), 'EXPLODE_LINES');
    expect(on.explodeTrails).toBe(true);
    expect(on.interfaces).toBe(false);
    expect(primaryOverlayName(on)).toBe('EXPLODE_LINES');
  });

  it('system explode fit intent is not selection', () => {
    expect(
      resolveFitIntent({
        spatial: 'SYSTEM_EXPLODED',
        isolate: null,
        explodeContext: null,
        focusId: null,
        variantMode: 'NONE',
        explosion: 0.7
      })
    ).toBe('system_exploded');
  });

  it('part explode fit uses local scope', () => {
    expect(
      resolveFitIntent({
        spatial: 'PART_EXPLODED',
        isolate: null,
        explodeContext: 'asm.shoulder',
        focusId: null,
        variantMode: 'NONE',
        explosion: 0.85
      })
    ).toBe('part_exploded');
  });
});

