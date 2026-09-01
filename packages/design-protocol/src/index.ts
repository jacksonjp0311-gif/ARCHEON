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
  /** Mesh vertices live in this frame. CAD_LOCAL = solid local origin, not viewer-recentered. */
  coordinate_frame?: string;
  local_origin?: [number, number, number];
  units?: string;
  geometry_revision?: string;
  source?: string;
}

export type GeometryDisplay =
  | 'EXACT CAD TESSELLATION'
  | 'GENERATED MESH'
  | 'DESIGNIR PRIMITIVE FALLBACK';

/** What the viewport should claim for a part. Drawn mode wins over metadata. */
export function geometryDisplay(
  cad: CadRef | null | undefined,
  drawn: 'cad' | 'primitive' | 'hidden' = 'cad'
): GeometryDisplay {
  if (drawn !== 'cad' || !cad) return 'DESIGNIR PRIMITIVE FALLBACK';
  const src = (cad.source || cad.truth || '').toUpperCase();
  if (src === 'GENERATED') return 'GENERATED MESH';
  return 'EXACT CAD TESSELLATION';
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
  'give me the shoulder',
  'open the shoulder',
  'show me the internal stack',
  'show the load-carrying interfaces',
  'make it detailed',
  'put it back together',
  'run the checks',
  'clear selection'
];

export function neighborhoodOf(
  id: string,
  ports: { id: string; host: string }[],
  interfaces: { id: string; a: string; b: string }[]
): string[] {
  const portIds = new Set(ports.filter((p) => p.host === id || p.id === id).map((p) => p.id));
  const out = new Set<string>();
  for (const iface of interfaces) {
    const aHost = ports.find((p) => p.id === iface.a)?.host;
    const bHost = ports.find((p) => p.id === iface.b)?.host;
    if (portIds.has(iface.a) || portIds.has(iface.b) || aHost === id || bHost === id || iface.id === id) {
      out.add(iface.id);
      if (aHost) out.add(aHost);
      if (bHost) out.add(bHost);
    }
  }
  out.delete(id);
  return [...out];
}

/** 1-hop interface graph around a part, port, interface, or assembly (via child parts). */
export function localInterfaceGraph(
  selectedId: string | null,
  parts: { id: string; parent: string | null }[],
  ports: { id: string; host: string }[],
  interfaces: { id: string; a: string; b: string }[]
): { hostIds: Set<string>; portIds: Set<string>; ifaceIds: Set<string> } {
  const hostIds = new Set<string>();
  const portIds = new Set<string>();
  const ifaceIds = new Set<string>();
  if (!selectedId) return { hostIds, portIds, ifaceIds };
  const seeds = new Set<string>([selectedId]);
  for (const p of parts) {
    if (p.parent === selectedId || p.id === selectedId) seeds.add(p.id);
  }
  for (const port of ports) {
    if (seeds.has(port.host) || seeds.has(port.id)) {
      seeds.add(port.host);
      portIds.add(port.id);
    }
  }
  for (const iface of interfaces) {
    const aHost = ports.find((p) => p.id === iface.a)?.host;
    const bHost = ports.find((p) => p.id === iface.b)?.host;
    const hit =
      seeds.has(iface.id) ||
      seeds.has(iface.a) ||
      seeds.has(iface.b) ||
      (aHost != null && seeds.has(aHost)) ||
      (bHost != null && seeds.has(bHost));
    if (!hit) continue;
    ifaceIds.add(iface.id);
    if (aHost) hostIds.add(aHost);
    if (bHost) hostIds.add(bHost);
    portIds.add(iface.a);
    portIds.add(iface.b);
  }
  return { hostIds, portIds, ifaceIds };
}
