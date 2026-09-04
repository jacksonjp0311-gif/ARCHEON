import { describe, expect, it } from 'vitest';
import {
  fitDistanceForAabb,
  fitSizeFromRendered,
  geometryMode,
  getRenderedEntityBounds,
  overlayVisible,
  sanitizeEdgeSegments,
  validateAabb
} from '@archeon/scene-engine';
import { geometryDisplay } from '@archeon/design-protocol';
import { emptyOverlays, enableOverlay } from '@archeon/spatial-grammar';

describe('mesh-local origin preservation', () => {
  it('does not recenter an offset CAD-local AABB onto the part origin', () => {
    const b = getRenderedEntityBounds({
      origin: [0, 0, 0],
      primitive: { kind: 'box', sx: 0.08, sy: 0.08, sz: 0.08 },
      meshLocal: { min: [0.9, -0.04, -0.04], max: [1.1, 0.04, 0.04] }
    });
    expect(b.source).toBe('mesh');
    expect(b.center[0]).toBeCloseTo(1.0);
    expect(b.center[1]).toBeCloseTo(0);
  });

  it('keeps CAD-local mesh centered on the semantic origin when authored that way', () => {
    const b = getRenderedEntityBounds({
      origin: [0.5, 0, 0.2],
      primitive: { kind: 'box', sx: 0.08, sy: 0.08, sz: 0.04 },
      meshLocal: { min: [-0.04, -0.04, -0.02], max: [0.04, 0.04, 0.02] }
    });
    expect(b.source).toBe('mesh');
    expect(b.center[0]).toBeCloseTo(0.5);
    expect(b.center[2]).toBeCloseTo(0.2);
  });
});

describe('actual mesh bounds', () => {
  it('prefers valid mesh AABB over the DesignIR primitive', () => {
    const b = getRenderedEntityBounds({
      origin: [0, 0, 0],
      primitive: { kind: 'box', sx: 0.2, sy: 0.2, sz: 0.2 },
      meshLocal: { min: [-0.01, -0.01, -0.05], max: [0.01, 0.01, 0.05] }
    });
    expect(b.source).toBe('mesh');
    expect(b.size[2]).toBeCloseTo(0.1);
    expect(b.size[0]).toBeCloseTo(0.02);
  });

  it('falls back to primitive when no mesh is present', () => {
    const b = getRenderedEntityBounds({
      origin: [0.1, 0, 0],
      primitive: { kind: 'box', sx: 0.2, sy: 0.1, sz: 0.05 }
    });
    expect(b.source).toBe('primitive');
    expect(b.size[0]).toBeCloseTo(0.2);
  });
});

describe('unit sanity', () => {
  it('flags mm-as-meters extents', () => {
    expect(validateAabb({ min: [0, 0, 0], max: [240, 80, 80] }).code).toBe('absurd_extent_mm_as_m');
  });

  it('flags a center thousands of times farther than the project', () => {
    expect(validateAabb({ min: [-0.05, -0.05, -0.05], max: [0.05, 0.05, 0.05] }, [0, 0, 800]).code).toBe(
      'center_far_from_project'
    );
  });

  it('rejects NaN / Infinity bounds', () => {
    expect(validateAabb({ min: [NaN, 0, 0], max: [1, 1, 1] }).code).toBe('nan_or_inf_bounds');
    expect(validateAabb({ min: [0, 0, 0], max: [Infinity, 1, 1] }).code).toBe('nan_or_inf_bounds');
  });
});

describe('invalid bounds rejection', () => {
  it('falls back to primitive when mesh AABB is absurd', () => {
    const b = getRenderedEntityBounds({
      origin: [0, 0, 0],
      primitive: { kind: 'box', sx: 0.08, sy: 0.08, sz: 0.08 },
      meshLocal: { min: [0, 0, 0], max: [400, 400, 400] }
    });
    expect(b.source).toBe('primitive');
    expect(b.rejected).toBe('absurd_extent_mm_as_m');
    expect(b.size[0]).toBeCloseTo(0.08);
  });

  it('rejects non-positive size', () => {
    expect(validateAabb({ min: [1, 1, 1], max: [1, 1, 1] }).code).toBe('non_positive_size');
  });
});

describe('overlay isolation', () => {
  it('LINES / INTERFACES / DATUMS are independent', () => {
    const trails = enableOverlay(emptyOverlays(), 'EXPLODE_LINES');
    expect(trails.explodeTrails).toBe(true);
    expect(trails.interfaces).toBe(false);
    expect(trails.datums).toBe(false);
    const ifaces = enableOverlay(emptyOverlays(), 'INTERFACES');
    expect(ifaces.interfaces).toBe(true);
    expect(ifaces.explodeTrails).toBe(false);
  });

  it('debug gate can hide an enabled overlay', () => {
    expect(overlayVisible(true, false)).toBe(false);
    expect(overlayVisible(false, true)).toBe(false);
    expect(overlayVisible(true, true)).toBe(true);
  });
});

describe('edge toggle / sanitization', () => {
  it('drops the drei Edges 1 m placeholder segment', () => {
    const placeholder = [0, 0, 0, 1, 0, 0];
    expect(sanitizeEdgeSegments(placeholder, 0.2)).toEqual([]);
  });

  it('keeps a short technical edge and drops NaN / degenerate / extreme', () => {
    const mixed = [
      0, 0, 0, 0.04, 0, 0, 0, 0, 0, 0, 0, 0, NaN, 0, 0, 1, 0, 0, 0, 0, 0, 50, 0, 0
    ];
    const out = sanitizeEdgeSegments(mixed, 0.2);
    expect(out).toEqual([0, 0, 0, 0.04, 0, 0]);
  });
});

describe('primitive / CAD exclusivity', () => {
  const both = { cadMeshes: true, primitives: true };
  it('never draws CAD and primitive together', () => {
    expect(geometryMode(true, both)).toBe('cad');
    expect(geometryMode(true, { cadMeshes: false, primitives: true })).toBe('primitive');
    expect(geometryMode(true, { cadMeshes: false, primitives: false })).toBe('hidden');
    expect(geometryMode(false, both)).toBe('primitive');
  });

  it('labels generated preview, source mesh, exact tessellation, and primitive fallback', () => {
    expect(geometryDisplay({ format: 'stl', path: 'generated/a.stl', truth: 'GENERATED', note: '', source: 'GENERATED' }, 'cad')).toBe(
      'GENERATED PREVIEW'
    );
    expect(geometryDisplay({ format: 'step', path: 'cad/a.step', preview: 'cad/a.stl', truth: 'SOURCE', note: '', source: 'SOURCE' }, 'cad')).toBe(
      'EXACT BREP TESSELLATION'
    );
    expect(geometryDisplay({ format: 'stl', path: 'cad/scan.stl', truth: 'SOURCE', note: '', source: 'SOURCE' }, 'cad')).toBe(
      'SOURCE MESH'
    );
    expect(geometryDisplay({ format: 'stl', path: 'generated/a.stl', truth: 'GENERATED', note: '' }, 'primitive')).toBe(
      'DESIGNIR PRIMITIVE FALLBACK'
    );
    expect(geometryDisplay(null, 'cad')).toBe('DESIGNIR PRIMITIVE FALLBACK');
  });
});

describe('camera fit using rendered bounds', () => {
  it('uses mesh AABB size, not the primitive envelope', () => {
    const rendered = getRenderedEntityBounds({
      origin: [0, 0, 0],
      primitive: { kind: 'box', sx: 2, sy: 2, sz: 2 },
      meshLocal: { min: [-0.2, -0.05, -0.05], max: [0.2, 0.05, 0.05] }
    });
    const size = fitSizeFromRendered([rendered]);
    expect(size[0]).toBeCloseTo(0.4);
    expect(size[1]).toBeCloseTo(0.1);
    const meshDist = fitDistanceForAabb(size, 42, 16 / 9, 0.78);
    const primDist = fitDistanceForAabb([2, 2, 2], 42, 16 / 9, 0.78);
    expect(meshDist).toBeLessThan(primDist);
  });

  it('ignores invalid boxes when composing fit size', () => {
    const good = getRenderedEntityBounds({
      origin: [0, 0, 0],
      primitive: { kind: 'box', sx: 0.2, sy: 0.1, sz: 0.1 }
    });
    const bad = {
      ...good,
      min: [NaN, 0, 0] as [number, number, number],
      max: [1, 1, 1] as [number, number, number]
    };
    const size = fitSizeFromRendered([good, bad]);
    expect(size[0]).toBeCloseTo(0.2);
  });
});
