// GENERATED from schema/design-ir.schema.json. Do not edit by hand.
export const DESIGN_IR_SCHEMA_VERSION = "0.6.0" as const;

export type ProvenanceClass = 'SOURCE' | 'DERIVED' | 'GENERATED' | 'SIMULATED' | 'VALIDATED' | 'MEASURED' | 'ASSUMED' | 'UNVERIFIED' | 'USER_LOCKED';
export type GeometryClass = 'EXACT_BREP' | 'EXACT_BREP_TESSELLATION' | 'SOURCE_MESH' | 'GENERATED_EXACT' | 'GENERATED_PREVIEW' | 'SEMANTIC_ONLY' | 'PRIMITIVE_FALLBACK';
export type JointType = 'FIXED' | 'REVOLUTE' | 'PRISMATIC';
export type ConstraintState = 'DECLARED' | 'DERIVED' | 'SOLVED' | 'VALIDATED';
export type MateKind = 'COINCIDENT' | 'CONCENTRIC' | 'DISTANCE' | 'ANGLE' | 'FIXED' | 'REVOLUTE' | 'PRISMATIC' | 'PLANAR' | 'AXIAL' | 'FASTENED' | 'BEARING_SUPPORT';
export type Primitive = { kind: 'box'; sx: number; sy: number; sz: number } | { kind: 'cylinder'; radius: number; height: number };

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

export interface Project {
  id: string;
  name: string;
  description: string;
  revision_id: string;
  branch: string;
  kernel: string;
  domain: string;
  fidelity: 'CONCEPT' | 'ENGINEERING' | 'DETAILED';
  provenance: Provenance;
}

export interface System {
  id: string;
  name: string;
  parent: string | null;
  provenance: Provenance;
}

export interface Assembly {
  id: string;
  name: string;
  parent: string | null;
  system: string | null;
  children: string[];
  semantic_role: string;
  provenance: Provenance;
}

export interface CadRef {
  format: string;
  path: string;
  preview?: string | null;
  truth: string;
  geometry_class?: GeometryClass;
  note: string;
  coordinate_frame?: string;
  local_origin?: [number, number, number];
  units?: string;
  geometry_revision?: string;
  source?: string;
  up_axis?: string;
  handedness?: string;
  forward_axis?: string;
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
  component_class: string | null;
  detail_tier: string;
  spatial: Spatial;
  provenance: Provenance;
}

export interface LocalFrame {
  origin_m: [number, number, number];
  rpy_rad: [number, number, number];
  axis: [number, number, number];
}

export interface FeatureFrame {
  host: string | null;
  datum_id: string | null;
  origin_m: [number, number, number];
  rpy_rad: [number, number, number];
  axis: [number, number, number];
}

export interface Feature {
  id: string;
  part: string;
  kind: string;
  semantic_role: string;
  params: Record<string, unknown>;
  frame: FeatureFrame;
  provenance: Provenance;
}

export interface Datum {
  id: string;
  host: string;
  kind: string;
  origin_m: [number, number, number];
  axis: [number, number, number];
  semantic_role: string;
  provenance: Provenance;
}

export interface Port {
  id: string;
  host: string;
  role: string;
  datum: string | null;
  origin_m: [number, number, number];
  provenance: Provenance;
}

export interface Interface {
  id: string;
  name: string;
  kind: string;
  a: string;
  b: string;
  semantic_role: string;
  provenance: Provenance;
}

export interface Mate {
  id: string;
  interface: string;
  kind: MateKind;
  offset_m: number;
  state: ConstraintState;
  provenance: Provenance;
}

export interface JointLimits {
  lower: number;
  upper: number;
  unit: string;
}

export interface JointDrive {
  kind: string;
  actuator: string | null;
  ratio: number | null;
}

export interface Joint {
  id: string;
  name: string;
  parent: string;
  child: string;
  joint_type: JointType;
  dof: number;
  parent_frame: LocalFrame;
  child_frame: LocalFrame;
  axis: [number, number, number];
  origin_m: [number, number, number];
  limits: JointLimits | null;
  position: number | null;
  velocity: number | null;
  drive: JointDrive | null;
  interfaces: string[];
  rotating_group: string[];
  load_path: string[];
  load_role: string;
  service_role: string;
  provenance: Provenance;
}

export interface Constraint {
  id: string;
  kind: MateKind;
  entities: string[];
  value: number | null;
  unit: string | null;
  state: ConstraintState;
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

export interface Analysis {
  id: string;
  kind: string;
  status: string;
  notes: string;
  provenance: Provenance;
}

export interface Evidence {
  id: string;
  kind: string;
  text: string;
  provenance: Provenance;
}

export interface Decision {
  id: string;
  text: string;
  requirement_ids: string[];
  provenance: Provenance;
}

export interface Revision {
  id: string;
  parent_revision: string | null;
  transaction_id: string | null;
  timestamp: string;
  author: string;
  agent: string | null;
  message: string;
  geometry_hash: string | null;
  design_hash: string | null;
}

export interface FitRelation {
  id: string;
  a: string;
  b: string;
  quantity: string;
  a_value_m: number;
  b_value_m: number;
  clearance_m: number;
  fit_class: string;
  origin: string;
  provenance: Provenance;
}

export interface FastenerGroup {
  id: string;
  host: string;
  bolt_type: string;
  diameter_m: number;
  count: number;
  bolt_circle_m: number | null;
  hole_type: string;
  washer: boolean;
  nut: boolean;
  torque_reference: string | null;
  instance_ids: string[];
  provenance: Provenance;
}

export interface AssemblyPlan {
  id: string;
  name: string;
  assembly: string;
  nodes: unknown[];
  interfaces: string[];
  load_path: string[];
  rotating: string[];
  service: string[];
  provenance: Provenance;
}

export interface Material {
  id: string;
  name: string;
  density_kg_m3: number | null;
  appearance: string;
  notes: string;
  provenance: Provenance;
}

export interface Load {
  id: string;
  kind: string;
  target: string;
  magnitude: number;
  unit: string;
  provenance: Provenance;
}

export interface Flow {
  id: string;
  kind: string;
  from: string;
  to: string;
  provenance: Provenance;
}

export interface FunctionEntity {
  id: string;
  name: string;
  parts: string[];
  provenance: Provenance;
}

export interface Parameter {
  name: string;
  value: number;
  unit: string;
  min: number | null;
  max: number | null;
  provenance: Provenance;
}

export interface DesignDocument {
  schema_version: string;
  project: Project;
  systems: System[];
  assemblies: Assembly[];
  parts: Part[];
  features: Feature[];
  datums: Datum[];
  ports: Port[];
  interfaces: Interface[];
  mates: Mate[];
  joints: Joint[];
  constraints: Constraint[];
  functions: FunctionEntity[];
  flows: Flow[];
  loads: Load[];
  materials: Material[];
  requirements: Requirement[];
  analyses: Analysis[];
  evidence: Evidence[];
  decisions: Decision[];
  revisions: Revision[];
  parameters: Record<string, Parameter>;
  assembly_sequence: string[];
  fastener_groups: FastenerGroup[];
  assembly_plans: AssemblyPlan[];
  fit_relations: FitRelation[];
  component_library: unknown[];
  detail_budget: unknown[];
}
