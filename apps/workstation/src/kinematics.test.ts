import { describe, expect, it } from 'vitest';
import { solveKinematics, sweepJointMotion, type KinematicAssembly, type KinematicJoint, type KinematicPart } from '@archeon/scene-engine';

const assemblies: KinematicAssembly[] = [
  { id: 'asm.root', parent: null },
  { id: 'asm.upper', parent: 'asm.root' },
  { id: 'asm.fore', parent: 'asm.root' },
  { id: 'asm.tool', parent: 'asm.root' }
];

const box = (id: string, parent: string, origin_m: [number, number, number], size = 0.1): KinematicPart => ({
  id,
  parent,
  spatial: { origin_m, rpy_rad: [0, 0, 0], primitive: { kind: 'box', sx: size, sy: size, sz: size } }
});

const joints: KinematicJoint[] = [
  {
    id: 'j1', parent: 'asm.root', child: 'asm.upper', joint_type: 'REVOLUTE', axis: [0, 0, 1], origin_m: [0, 0, 0],
    limits: { lower: -Math.PI / 2, upper: Math.PI / 2, unit: 'rad' }, position: 0,
    rotating_group: ['asm.upper', 'asm.fore', 'asm.tool']
  },
  {
    id: 'j2', parent: 'asm.upper', child: 'asm.fore', joint_type: 'REVOLUTE', axis: [0, 1, 0], origin_m: [1, 0, 0],
    limits: { lower: -Math.PI, upper: Math.PI, unit: 'rad' }, position: 0,
    rotating_group: ['asm.fore', 'asm.tool']
  },
  {
    id: 'j3', parent: 'asm.fore', child: 'asm.tool', joint_type: 'PRISMATIC', axis: [1, 0, 0], origin_m: [2, 0, 0],
    limits: { lower: 0, upper: 0.2, unit: 'm' }, position: 0, rotating_group: ['asm.tool']
  },
  {
    id: 'fixed', parent: 'asm.tool', child: 'asm.tool', joint_type: 'FIXED', axis: [1, 0, 0], origin_m: [2, 0, 0],
    limits: null, position: 0, rotating_group: []
  }
];

describe('first-class joint kinematics', () => {
  it('moves a complete rigid group around a revolute axis', () => {
    const parts = [box('upper', 'asm.upper', [0.5, 0, 0]), box('fore', 'asm.fore', [1.5, 0, 0])];
    const solved = solveKinematics(parts, assemblies, joints, { j1: Math.PI / 2 });
    expect(solved.parts.upper.position[0]).toBeCloseTo(0, 6);
    expect(solved.parts.upper.position[1]).toBeCloseTo(0.5, 6);
    expect(solved.parts.fore.position[1]).toBeCloseTo(1.5, 6);
  });

  it('propagates an upstream transform into a downstream joint frame', () => {
    const parts = [box('fore', 'asm.fore', [2, 0, 0])];
    const solved = solveKinematics(parts, assemblies, joints, { j1: Math.PI / 2, j2: Math.PI / 2 });
    expect(solved.joints.j2.origin[0]).toBeCloseTo(0, 6);
    expect(solved.joints.j2.origin[1]).toBeCloseTo(1, 6);
    expect(solved.parts.fore.position[1]).toBeCloseTo(1, 6);
    expect(solved.parts.fore.position[2]).toBeCloseTo(-1, 6);
  });

  it('enforces limits, supports prismatic joints, and ignores fixed controls', () => {
    const parts = [box('tool', 'asm.tool', [2, 0, 0])];
    const solved = solveKinematics(parts, assemblies, joints, { j1: 99, j3: 0.5, fixed: 1 });
    expect(solved.joints.j1.value).toBeCloseTo(Math.PI / 2);
    expect(solved.joints.j1.clamped).toBe(true);
    expect(solved.joints.j3.value).toBeCloseTo(0.2);
    expect(solved.joints.fixed.value).toBe(0);
  });

  it('reports newly introduced broad-phase collisions during a sweep', () => {
    const parts = [box('moving', 'asm.fore', [1, 0, 0], 0.2), box('obstacle', 'asm.root', [0, 1, 0], 0.3)];
    const sweep = sweepJointMotion(parts, assemblies, [joints[0]], 'j1', Math.PI / 2, 12);
    expect(sweep.collisions.some((hit) => hit.a === 'moving' && hit.b === 'obstacle')).toBe(true);
    expect(sweep.status).toBe('UNVERIFIED');
  });
});
