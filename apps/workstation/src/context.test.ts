import { describe, expect, it } from 'vitest';
import type { DesignDocument } from '@archeon/design-protocol';
import {
  ancestorIds,
  classifyEntity,
  componentStack,
  contextActions,
  contextActionsFor,
  declaredLoadPath,
  primaryActions,
  reasoningSummary
} from './services/context';
import { groupPalette, searchPalette, semanticCatalog } from './services/palette';
import { emptyHuds, occupiedRatio, preserveViewport } from './services/hudManager';

const doc = {
  parts: [
    { id: 'part.shoulder.housing', name: 'Shoulder Housing', parent: 'asm.shoulder', semantic_role: 'housing', spatial: { assembly_stage: 1, service_path: [] }, provenance: { class: 'GENERATED', reason: 'Shell', requirement_ids: [] } },
    { id: 'part.shoulder.bearing.a', name: 'Pitch Bearing A', parent: 'asm.shoulder', semantic_role: 'bearing', spatial: { assembly_stage: 4, service_path: [] }, provenance: { class: 'GENERATED', reason: 'Radial support', requirement_ids: [] } },
    { id: 'part.shoulder.cover', name: 'Service Cover', parent: 'asm.shoulder', semantic_role: 'cover', spatial: { assembly_stage: 8, service_path: [[0, 0, 0], [0, 0, 0.08]] }, provenance: { class: 'GENERATED', reason: 'Access', requirement_ids: [] } }
  ],
  assemblies: [
    { id: 'asm.arm', name: 'ARCHEON Arm', parent: null, semantic_role: 'machine' },
    { id: 'asm.shoulder', name: 'Shoulder Assembly', parent: 'asm.arm', semantic_role: 'joint_host' }
  ],
  joints: [
    {
      id: 'joint.j2',
      name: 'Shoulder pitch',
      parent: 'asm.shoulder',
      child: 'asm.upper_arm',
      joint_type: 'REVOLUTE',
      dof: 1,
      axis: [0, 1, 0],
      load_path: ['part.shoulder.mount.upper', 'part.shoulder.shaft', 'part.shoulder.bearing.a', 'part.shoulder.housing'],
      rotating_group: ['part.shoulder.shaft', 'asm.upper_arm'],
      load_role: 'carry upper-arm radial and moment loads through bearing pair',
      provenance: { class: 'DERIVED' }
    }
  ],
  interfaces: [],
  ports: [],
  mates: [],
  features: [],
  requirements: [{ id: 'req.002', text: 'Bearing Support Requirement', quantity: 'REQ-002', provenance: { requirement_ids: [] } }],
  materials: [],
  analyses: [],
  evidence: [],
  fastener_groups: []
} as unknown as DesignDocument;

describe('context-generated actions', () => {
  it('housing gets OPEN / internals, not only generic CAD verbs', () => {
    const ctx = classifyEntity('part.shoulder.housing', doc);
    const ids = contextActionsFor(ctx, doc).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['open', 'show-stack', 'ask']));
    expect(ids).not.toContain('approve');
  });

  it('joint gets axis / motion / load path', () => {
    const ids = contextActionsFor(classifyEntity('joint.j2', doc), doc).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['show-axis', 'show-motion', 'show-load', 'show-stack']));
  });

  it('human actions stay available and primary list stays compact', () => {
    expect(contextActions('none').map((a) => a.id)).toEqual(expect.arrayContaining(['home', 'fit']));
    const primary = primaryActions(contextActionsFor(classifyEntity('part.shoulder.housing', doc), doc), 6);
    expect(primary.length).toBeLessThanOrEqual(7);
    expect(primary.some((a) => a.id === 'ask' || a.id === 'more')).toBe(true);
  });

  it('one generator is the source of truth', () => {
    expect(contextActions('proposal').map((a) => a.id)).toContain('approve');
  });
});

describe('project search', () => {
  it('groups bearing matches and does not auto-select', () => {
    const found = searchPalette('bearing', semanticCatalog(doc));
    expect(found.length).toBeGreaterThan(1);
    expect(groupPalette(found).PART.length).toBeGreaterThan(0);
    expect(searchPalette('', semanticCatalog(doc))).toEqual([]);
  });
});

describe('revealEntity ancestors', () => {
  it('opens parent assemblies for a leaf part', () => {
    const ids = ancestorIds('part.shoulder.housing', doc.parts, doc.assemblies);
    expect(ids).toEqual(['part.shoulder.housing', 'asm.shoulder', 'asm.arm']);
  });
});

describe('declared mechanical graphs', () => {
  it('uses joint load path as the stack and never invents FEA', () => {
    expect(declaredLoadPath(doc, 'part.shoulder.bearing.a')[0]).toBe('part.shoulder.mount.upper');
    expect(componentStack(doc, 'asm.shoulder')).toEqual(doc.joints[0].load_path);
    const summary = reasoningSummary(classifyEntity('part.shoulder.bearing.a', doc), doc);
    expect(summary.validation).toMatch(/UNVERIFIED|GRAPH/);
    expect(summary.why).toMatch(/DECLARED|loads/i);
  });
});

describe('HUD viewport preservation', () => {
  it('collapses unpinned HUDs when they cover too much of the viewport', () => {
    let h = emptyHuds();
    h.project = { ...h.project, open: true, pinned: false, w: 900, h: 700, openedAt: 1 };
    h.inspector = { ...h.inspector, open: true, pinned: false, w: 300, h: 520, openedAt: 2 };
    h = preserveViewport(h, 1280, 720);
    expect(occupiedRatio(h, 1280, 720)).toBeLessThanOrEqual(0.45 + 1e-6);
    expect(h.project.collapsed || h.inspector.collapsed).toBe(true);
  });

  it('does not collapse a pinned HUD to satisfy the budget', () => {
    let h = emptyHuds();
    h.project = { ...h.project, open: true, pinned: true, w: 900, h: 700, openedAt: 1 };
    h.inspector = { ...h.inspector, open: true, pinned: false, w: 300, h: 520, openedAt: 2 };
    h = preserveViewport(h, 1280, 720);
    expect(h.project.collapsed).toBe(false);
    expect(h.inspector.collapsed).toBe(true);
  });
});
