export type ProvenanceClass =
  | 'SOURCE'
  | 'DERIVED'
  | 'GENERATED'
  | 'SIMULATED'
  | 'VALIDATED'
  | 'MEASURED'
  | 'ASSUMED'
  | 'UNVERIFIED'
  | 'USER_LOCKED';

export interface Provenance {
  class: ProvenanceClass;
  created_by: string;
  reason: string;
  requirement_ids: string[];
  agent_id: string | null;
  tools: string[];
  evidence_ids: string[];
  revision_id: string;
  user_approved: boolean;
}

export type Primitive =
  | { kind: 'box'; sx: number; sy: number; sz: number }
  | { kind: 'cylinder'; radius: number; height: number };

export interface CadRef {
  format: string;
  path: string;
  preview?: string | null;
  truth: string;
  note: string;
}

export interface Spatial {
  origin_m: [number, number, number];
  rpy_rad: [number, number, number];
  primitive: Primitive;
  assembly_stage: number;
  explosion_vector: [number, number, number];
  explosion_distance_m: number;
  radial_group: string | null;
  parent_axis: string | null;
  service_path: [number, number, number][];
  cad?: CadRef | null;
}

export interface Part {
  id: string;
  name: string;
  parent: string | null;
  system: string | null;
  material: string | null;
  semantic_role: string;
  qty: number;
  catalog_ref: string | null;
  spatial: Spatial;
  provenance: Provenance;
}

export interface Requirement {
  id: string;
  text: string;
  quantity: string | null;
  operator: string | null;
  value: number | null;
  unit: string | null;
  acceptance: string;
  satisfied: boolean | null;
  evidence: string[];
  provenance: Provenance;
}

export const LOCAL_COMMANDS = [
  'explode assembly',
  'isolate shoulder',
  'show interfaces',
  'show requirements',
  'select base',
  'reset view',
  'increase upper arm length by 25 mm',
  'validate proposal',
  'commit proposal',
  'reject proposal'
];
