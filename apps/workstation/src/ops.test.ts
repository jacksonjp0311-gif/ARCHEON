import { describe, expect, it } from 'vitest';
import type { DesignDocument } from '@archeon/design-protocol';
import { classifyEntity, contextActionsFor } from './services/context';
import {
  applyMechanicalOp,
  mechanicalOpFromView,
  SHOULDER_CONVERSATION_OPS
} from './services/mechanicalOps';
import { useUi } from './store';

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
  requirements: [],
  materials: [],
  analyses: [],
  evidence: [],
  fastener_groups: []
} as unknown as DesignDocument;

describe('identity of mechanical operations', () => {
  it('maps legacy language views onto the click action ids', () => {
    expect(mechanicalOpFromView('explode_stack')).toBe('open');
    expect(mechanicalOpFromView('show_joint')).toBe('show-motion');
    expect(mechanicalOpFromView('show_load_path')).toBe('show-load');
    expect(mechanicalOpFromView('show_load_paths')).toBe('show-load');
    expect(mechanicalOpFromView('explode_context')).toBe('explode');
    expect(mechanicalOpFromView('restore_display')).toBe('restore');
    expect(mechanicalOpFromView('home_view')).toBe('home');
    expect(mechanicalOpFromView('previous_view')).toBe('previous');
  });

  it('housing click actions are the same ops language OPEN / stack / load use', () => {
    const ids = contextActionsFor(classifyEntity('part.shoulder.housing', doc), doc).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['open', 'show-stack']));
    expect(SHOULDER_CONVERSATION_OPS).toEqual(expect.arrayContaining(['open', 'show-stack', 'show-load', 'restore']));
    expect(ids.filter((id) => SHOULDER_CONVERSATION_OPS.includes(id as (typeof SHOULDER_CONVERSATION_OPS)[number])).length).toBeGreaterThan(0);
  });

  it('applyMechanicalOp is the single executor for click and language', () => {
    useUi.getState().clearMechanical();
    applyMechanicalOp('open', 'part.shoulder.housing', doc);
    expect(useUi.getState().openId).toBe('part.shoulder.housing');
    expect(useUi.getState().ghostRoles).toEqual(expect.arrayContaining(['housing', 'cover', 'shell']));
    expect(useUi.getState().sectionOn).toBe(true);

    applyMechanicalOp('show-stack', 'part.shoulder.bearing.a', doc);
    expect(useUi.getState().stackIds[0]).toBe('part.shoulder.mount.upper');
    expect(useUi.getState().openId).toBeNull();

    applyMechanicalOp('show-load', 'part.shoulder.bearing.a', doc);
    expect(useUi.getState().loadPathIds).toEqual(doc.joints[0].load_path);

    applyMechanicalOp('restore', null, doc);
    expect(useUi.getState().openId).toBeNull();
    expect(useUi.getState().stackIds).toEqual([]);
    expect(useUi.getState().loadPathIds).toEqual([]);
  });
});
