import type { DesignDocument } from '@archeon/design-protocol';

export type PaletteKind = 'PART' | 'ASSEMBLY' | 'FEATURE' | 'JOINT' | 'INTERFACE' | 'MATE' | 'REQUIREMENT' | 'MATERIAL' | 'ANALYSIS' | 'EVIDENCE' | 'COMMAND' | 'VIEW' | 'AGENT';

export interface PaletteItem {
  id: string;
  label: string;
  kind: PaletteKind;
  hint?: string;
  /** Geometry to frame while the semantic entity remains selected. */
  focusId?: string;
}

export function semanticCatalog(doc: DesignDocument): PaletteItem[] {
  const hostForPort = (portId: string) => doc.ports.find((port) => port.id === portId)?.host;
  const focusForInterface = (id: string) => {
    const iface = doc.interfaces.find((candidate) => candidate.id === id);
    return iface ? hostForPort(iface.a) ?? hostForPort(iface.b) : undefined;
  };
  return [
    ...doc.parts.map((part) => ({
      id: part.id,
      label: part.name,
      kind: 'PART' as const,
      hint: `${part.semantic_role} ${part.material ?? ''} ${part.parent ?? ''}`,
      focusId: part.id
    })),
    ...doc.assemblies.map((assembly) => ({
      id: assembly.id,
      label: assembly.name,
      kind: 'ASSEMBLY' as const,
      hint: assembly.semantic_role,
      focusId: assembly.id
    })),
    ...doc.features.map((feature) => ({
      id: feature.id,
      label: feature.semantic_role || feature.id,
      kind: 'FEATURE' as const,
      hint: feature.kind,
      focusId: feature.part
    })),
    ...doc.joints.map((joint) => ({
      id: joint.id,
      label: joint.name,
      kind: 'JOINT' as const,
      hint: `${joint.joint_type} ${joint.load_role}`,
      focusId: joint.child
    })),
    ...doc.interfaces.map((iface) => ({
      id: iface.id,
      label: iface.name,
      kind: 'INTERFACE' as const,
      hint: `${iface.kind} ${iface.semantic_role}`,
      focusId: focusForInterface(iface.id)
    })),
    ...doc.mates.map((mate) => ({
      id: mate.id,
      label: `${mate.kind} mate`,
      kind: 'MATE' as const,
      hint: `${mate.state} ${mate.interface}`,
      focusId: focusForInterface(mate.interface)
    })),
    ...doc.requirements.map((req) => ({
      id: req.id,
      label: req.text,
      kind: 'REQUIREMENT' as const,
      hint: req.quantity ?? '',
      focusId: doc.parts.find((part) => part.provenance.requirement_ids.includes(req.id))?.id
    })),
    ...doc.materials.map((material) => ({
      id: material.id,
      label: material.name,
      kind: 'MATERIAL' as const,
      hint: material.notes,
      focusId: doc.parts.find((part) => part.material === material.id)?.id
    })),
    ...doc.analyses.map((analysis) => ({
      id: analysis.id,
      label: analysis.kind,
      kind: 'ANALYSIS' as const,
      hint: `${analysis.status} ${analysis.notes}`
    })),
    ...doc.evidence.map((evidence) => ({
      id: evidence.id,
      label: evidence.text,
      kind: 'EVIDENCE' as const,
      hint: evidence.kind
    }))
  ];
}

export function searchPalette(q: string, catalog: PaletteItem[]): PaletteItem[] {
  const n = q.trim().toLowerCase();
  if (!n) return [];
  const tokens = n.split(/\s+/).filter(Boolean);
  return catalog
    .map((item) => {
      const hay = `${item.label} ${item.id} ${item.hint ?? ''} ${item.kind}`.toLowerCase();
      if (!tokens.every((t) => hay.includes(t))) return { item, score: 0 };
      let score = 50;
      if (item.id.toLowerCase() === n || item.label.toLowerCase() === n) score = 100;
      else if (item.id.toLowerCase().startsWith(n) || item.label.toLowerCase().startsWith(n)) score = 80;
      else if (item.label.toLowerCase().includes(n) || item.id.toLowerCase().includes(n)) score = 70;
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.item.kind.localeCompare(b.item.kind))
    .map((x) => x.item)
    .slice(0, 40);
}

export function groupPalette(items: PaletteItem[]): Record<string, PaletteItem[]> {
  const out: Record<string, PaletteItem[]> = {};
  for (const item of items) {
    (out[item.kind] ??= []).push(item);
  }
  return out;
}

export type ContextKind =
  | 'none'
  | 'part'
  | 'assembly'
  | 'joint'
  | 'requirement'
  | 'interface'
  | 'feature'
  | 'mate'
  | 'proposal';

export { contextActions, primaryActions, contextActionsFor } from './context';
export type { ContextAction, EntityKind } from './context';
