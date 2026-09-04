export * from './generated';
import type { CadRef } from './generated';

export type GeometryDisplay =
  | 'EXACT BREP'
  | 'EXACT BREP TESSELLATION'
  | 'SOURCE MESH'
  | 'GENERATED EXACT'
  | 'GENERATED PREVIEW'
  | 'SEMANTIC ONLY'
  | 'DESIGNIR PRIMITIVE FALLBACK';

/** What the viewport should claim for a part. Drawn mode wins over metadata. */
export function geometryDisplay(
  cad: CadRef | null | undefined,
  drawn: 'cad' | 'primitive' | 'hidden' = 'cad'
): GeometryDisplay {
  if (drawn !== 'cad' || !cad) return 'DESIGNIR PRIMITIVE FALLBACK';
  const cls = cad.geometry_class || (() => {
    const format = cad.format.toLowerCase();
    const source = (cad.source || cad.truth || '').toUpperCase();
    if (source === 'SOURCE' && ['stl', 'glb', 'gltf', 'obj'].includes(format)) return 'SOURCE_MESH';
    if (source === 'SOURCE' && ['step', 'stp'].includes(format)) return 'EXACT_BREP_TESSELLATION';
    if (source === 'GENERATED') return 'GENERATED_PREVIEW';
    return 'PRIMITIVE_FALLBACK';
  })();
  if (cls === 'EXACT_BREP' && cad.preview) return 'EXACT BREP TESSELLATION';
  if (cls === 'GENERATED_EXACT' && cad.preview) return 'GENERATED PREVIEW';
  const labels: Record<string, GeometryDisplay> = {
    EXACT_BREP: 'EXACT BREP',
    EXACT_BREP_TESSELLATION: 'EXACT BREP TESSELLATION',
    SOURCE_MESH: 'SOURCE MESH',
    GENERATED_EXACT: 'GENERATED EXACT',
    GENERATED_PREVIEW: 'GENERATED PREVIEW',
    SEMANTIC_ONLY: 'SEMANTIC ONLY',
    PRIMITIVE_FALLBACK: 'DESIGNIR PRIMITIVE FALLBACK'
  };
  return labels[cls] ?? 'DESIGNIR PRIMITIVE FALLBACK';
}

export function hasRenderableCad(cad: CadRef | null | undefined): boolean {
  return !!cad && (!!cad.preview || cad.format.toLowerCase() === 'stl');
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
