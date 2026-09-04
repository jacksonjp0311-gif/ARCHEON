import { aabbsOverlap, getRenderedEntityBounds, type LocalAabb, type Vec3 } from './bounds';

export type Quaternion = [number, number, number, number];

export interface KinematicPart {
  id: string;
  parent: string | null;
  spatial: {
    origin_m: Vec3;
    rpy_rad: Vec3;
    primitive: { kind: string; sx?: number; sy?: number; sz?: number; radius?: number; height?: number };
  };
}

export interface KinematicAssembly {
  id: string;
  parent: string | null;
  children?: string[];
}

export interface KinematicJoint {
  id: string;
  parent: string;
  child: string;
  joint_type: 'FIXED' | 'REVOLUTE' | 'PRISMATIC';
  axis: Vec3;
  origin_m: Vec3;
  limits: { lower: number; upper: number; unit: string } | null;
  position: number | null;
  rotating_group: string[];
}

export interface PartPose {
  id: string;
  position: Vec3;
  quaternion: Quaternion;
  rpy: Vec3;
}

export interface JointWorldFrame {
  id: string;
  origin: Vec3;
  axis: Vec3;
  requested: number;
  value: number;
  clamped: boolean;
}

export interface KinematicSolution {
  parts: Record<string, PartPose>;
  joints: Record<string, JointWorldFrame>;
}

export interface MotionCollision {
  a: string;
  b: string;
  at: number;
  joint: string;
  status: 'UNVERIFIED';
  method: 'SWEPT_WORLD_AABB';
}

export interface MotionSweepResult {
  joint: string;
  target: number;
  samples: number;
  collisions: MotionCollision[];
  status: 'UNVERIFIED';
  note: string;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(v: Vec3, n: number): Vec3 {
  return [v[0] * n, v[1] * n, v[2] * n];
}

function normalize(v: Vec3): Vec3 {
  const n = Math.hypot(...v);
  return n > 1e-12 ? scale(v, 1 / n) : [0, 0, 1];
}

export function multiplyQuaternion(a: Quaternion, b: Quaternion): Quaternion {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

export function quaternionFromAxisAngle(axis: Vec3, angle: number): Quaternion {
  const n = normalize(axis);
  const s = Math.sin(angle / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
}

export function quaternionFromRpy([x, y, z]: Vec3): Quaternion {
  const qx: Quaternion = [Math.sin(x / 2), 0, 0, Math.cos(x / 2)];
  const qy: Quaternion = [0, Math.sin(y / 2), 0, Math.cos(y / 2)];
  const qz: Quaternion = [0, 0, Math.sin(z / 2), Math.cos(z / 2)];
  return multiplyQuaternion(qz, multiplyQuaternion(qy, qx));
}

export function rotateByQuaternion(q: Quaternion, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const uv: Vec3 = [y * v[2] - z * v[1], z * v[0] - x * v[2], x * v[1] - y * v[0]];
  const uuv: Vec3 = [y * uv[2] - z * uv[1], z * uv[0] - x * uv[2], x * uv[1] - y * uv[0]];
  return add(v, add(scale(uv, 2 * w), scale(uuv, 2)));
}

export function rpyFromQuaternion([x, y, z, w]: Quaternion): Vec3 {
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - w * z);
  const m13 = 2 * (x * z + w * y);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - w * x);
  const m32 = 2 * (y * z + w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const pitch = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) return [Math.atan2(-m23, m33), pitch, Math.atan2(-m12, m11)];
  return [Math.atan2(m32, m22), pitch, 0];
}

function clampJoint(joint: KinematicJoint, requested: number): number {
  if (!joint.limits) return requested;
  return Math.max(joint.limits.lower, Math.min(joint.limits.upper, requested));
}

function assemblyAncestors(id: string | null, assemblies: KinematicAssembly[]): string[] {
  const parent = new Map(assemblies.map((a) => [a.id, a.parent]));
  const out: string[] = [];
  let cursor = id;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    out.push(cursor);
    cursor = parent.get(cursor) ?? null;
  }
  return out;
}

function entityInScopes(entity: string, scopes: Set<string>, assemblies: KinematicAssembly[]): boolean {
  if (scopes.has(entity)) return true;
  return assemblyAncestors(entity, assemblies).some((id) => scopes.has(id));
}

function affectedPartIds(joint: KinematicJoint, parts: KinematicPart[], assemblies: KinematicAssembly[]): Set<string> {
  const scopes = new Set(joint.rotating_group.length ? joint.rotating_group : [joint.child]);
  return new Set(parts.filter((part) => scopes.has(part.id) || assemblyAncestors(part.parent, assemblies).some((id) => scopes.has(id))).map((p) => p.id));
}

/**
 * Evaluates the serial joint chain in DesignIR order. Every joint motion is
 * applied to its complete rotating group, while downstream joint frames are
 * carried by earlier motions. Values use the units declared by DesignIR
 * (normally radians for revolute joints and metres for prismatic joints).
 */
export function solveKinematics(
  parts: KinematicPart[],
  assemblies: KinematicAssembly[],
  joints: KinematicJoint[],
  controls: Record<string, number> = {}
): KinematicSolution {
  const poses: Record<string, PartPose> = Object.fromEntries(parts.map((part) => {
    const quaternion = quaternionFromRpy(part.spatial.rpy_rad);
    return [part.id, { id: part.id, position: [...part.spatial.origin_m], quaternion, rpy: [...part.spatial.rpy_rad] }];
  }));
  const frames: Record<string, JointWorldFrame> = {};
  const prior: { scopes: Set<string>; type: KinematicJoint['joint_type']; origin: Vec3; axis: Vec3; value: number }[] = [];

  for (const joint of joints) {
    let origin: Vec3 = [...joint.origin_m];
    let axis: Vec3 = normalize(joint.axis);
    for (const motion of prior) {
      if (!entityInScopes(joint.parent, motion.scopes, assemblies)) continue;
      if (motion.type === 'REVOLUTE') {
        const q = quaternionFromAxisAngle(motion.axis, motion.value);
        origin = add(motion.origin, rotateByQuaternion(q, sub(origin, motion.origin)));
        axis = normalize(rotateByQuaternion(q, axis));
      } else if (motion.type === 'PRISMATIC') {
        origin = add(origin, scale(motion.axis, motion.value));
      }
    }

    const requested = controls[joint.id] ?? joint.position ?? 0;
    const value = joint.joint_type === 'FIXED' ? 0 : clampJoint(joint, requested);
    frames[joint.id] = { id: joint.id, origin, axis, requested, value, clamped: Math.abs(requested - value) > 1e-12 };
    const scopes = new Set(joint.rotating_group.length ? joint.rotating_group : [joint.child]);
    const affected = affectedPartIds(joint, parts, assemblies);

    if (joint.joint_type === 'REVOLUTE' && Math.abs(value) > 1e-12) {
      const q = quaternionFromAxisAngle(axis, value);
      for (const id of affected) {
        const pose = poses[id];
        pose.position = add(origin, rotateByQuaternion(q, sub(pose.position, origin)));
        pose.quaternion = multiplyQuaternion(q, pose.quaternion);
        pose.rpy = rpyFromQuaternion(pose.quaternion);
      }
    } else if (joint.joint_type === 'PRISMATIC' && Math.abs(value) > 1e-12) {
      const delta = scale(axis, value);
      for (const id of affected) poses[id].position = add(poses[id].position, delta);
    }
    prior.push({ scopes, type: joint.joint_type, origin, axis, value });
  }
  return { parts: poses, joints: frames };
}

function poseBounds(part: KinematicPart, pose: PartPose): LocalAabb {
  const bounds = getRenderedEntityBounds({ origin: pose.position, rpy: pose.rpy, primitive: part.spatial.primitive });
  return { min: bounds.min, max: bounds.max };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function overlappingPairs(parts: KinematicPart[], solution: KinematicSolution): Set<string> {
  const boxes = parts.map((part) => ({ part, box: poseBounds(part, solution.parts[part.id]) }));
  const pairs = new Set<string>();
  for (let i = 0; i < boxes.length; i++) {
    for (let k = i + 1; k < boxes.length; k++) {
      if (aabbsOverlap(boxes[i].box, boxes[k].box, -1e-6)) pairs.add(pairKey(boxes[i].part.id, boxes[k].part.id));
    }
  }
  return pairs;
}

/** Conservative broad-phase sweep. Initial contacts are ignored; new pairs are
 * reported as UNVERIFIED until an exact mesh/BREP narrow phase confirms them. */
export function sweepJointMotion(
  parts: KinematicPart[],
  assemblies: KinematicAssembly[],
  joints: KinematicJoint[],
  jointId: string,
  target: number,
  samples = 25,
  baseControls: Record<string, number> = {}
): MotionSweepResult {
  const count = Math.max(2, Math.floor(samples));
  const targetJoint = joints.find((joint) => joint.id === jointId);
  const start = baseControls[jointId] ?? targetJoint?.position ?? 0;
  if (!targetJoint || Math.abs(target - start) < 1e-12) {
    return {
      joint: jointId, target, samples: count, collisions: [], status: 'UNVERIFIED',
      note: 'No joint travel requested. Conservative sampled world-AABB broad phase was not run.'
    };
  }
  const moving = affectedPartIds(targetJoint, parts, assemblies);
  const seen = new Set<string>();
  const persistence = new Map<string, number>();
  const collisions: MotionCollision[] = [];
  for (let step = 1; step <= count; step++) {
    const at = start + (target - start) * (step / count);
    const solution = solveKinematics(parts, assemblies, joints, { ...baseControls, [jointId]: at });
    for (const key of overlappingPairs(parts, solution)) {
      const [a, b] = key.split('|');
      if (moving.has(a) === moving.has(b) || seen.has(key)) continue;
      const hits = (persistence.get(key) ?? 0) + 1;
      persistence.set(key, hits);
      // One sample may just be an intended assembled contact. Persistence into
      // the next pose is a clearance warning and requires exact confirmation.
      if (hits < 2) continue;
      seen.add(key);
      collisions.push({ a, b, at, joint: jointId, status: 'UNVERIFIED', method: 'SWEPT_WORLD_AABB' });
    }
  }
  return {
    joint: jointId,
    target,
    samples: count,
    collisions,
    status: 'UNVERIFIED',
    note: 'Conservative sampled world-AABB broad phase. Persistent moving/fixed overlap is reported; exact mesh/BREP narrow phase is not yet available.'
  };
}
