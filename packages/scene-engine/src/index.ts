/** Spatial explosion — an alternate projection of the assembly graph, not animation. */

export type ExplosionStrategy =
  | 'RADIAL'
  | 'AXIAL'
  | 'SEQUENCE'
  | 'SYSTEM'
  | 'BOM_FOCUS'
  | 'SERVICE'
  | 'GRAPH'
  | 'CUSTOM';

export interface SpatialPart {
  id: string;
  origin_m: [number, number, number];
  explosion_vector: [number, number, number];
  explosion_distance_m: number;
  assembly_stage: number;
}

export function explosionOffset(
  part: SpatialPart,
  strategy: ExplosionStrategy,
  t: number,
  sequenceLen: number
): [number, number, number] {
  const k = Math.min(1, Math.max(0, t));
  const v = part.explosion_vector;
  const d = part.explosion_distance_m === 0 ? 0.12 : part.explosion_distance_m;
  let mag: number;
  switch (strategy) {
    case 'SEQUENCE': {
      const stage = Math.max(1, part.assembly_stage);
      const rank = Math.max(1, sequenceLen - stage);
      mag = d * k * (0.35 + 0.08 * rank);
      break;
    }
    case 'AXIAL':
      mag = d * k * Math.max(1, Math.abs(Math.sign(v[2]) || 1));
      break;
    case 'SYSTEM':
    case 'GRAPH':
      mag = d * k * 0.8;
      break;
    case 'BOM_FOCUS':
      mag = d * k * 0.2;
      break;
    case 'SERVICE':
      mag = d * k * 1.2;
      break;
    default:
      mag = d * k;
  }
  if (strategy === 'AXIAL') {
    const s = v[2] === 0 ? 1 : Math.sign(v[2]);
    return [0, 0, mag * s];
  }
  return [v[0] * mag, v[1] * mag, v[2] * mag];
}

export function renderTransform(
  origin: [number, number, number],
  explosion: [number, number, number],
  focus: [number, number, number] = [0, 0, 0],
  service: [number, number, number] = [0, 0, 0],
  proposal: [number, number, number] = [0, 0, 0]
): [number, number, number] {
  return [
    origin[0] + explosion[0] + focus[0] + service[0] + proposal[0],
    origin[1] + explosion[1] + focus[1] + service[1] + proposal[1],
    origin[2] + explosion[2] + focus[2] + service[2] + proposal[2]
  ];
}
