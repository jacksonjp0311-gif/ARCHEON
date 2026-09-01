export type PaletteKind = 'PART' | 'ASSEMBLY' | 'FEATURE' | 'JOINT' | 'INTERFACE' | 'REQUIREMENT' | 'ANALYSIS' | 'COMMAND' | 'VIEW' | 'AGENT';

export interface PaletteItem {
  id: string;
  label: string;
  kind: PaletteKind;
  hint?: string;
}

export function searchPalette(q: string, catalog: PaletteItem[]): PaletteItem[] {
  const n = q.trim().toLowerCase();
  if (!n) return catalog.slice(0, 18);
  return catalog
    .map((item) => {
      const hay = `${item.label} ${item.id} ${item.hint ?? ''}`.toLowerCase();
      let score = 0;
      if (item.id.toLowerCase() === n || item.label.toLowerCase() === n) score = 100;
      else if (item.id.toLowerCase().startsWith(n) || item.label.toLowerCase().startsWith(n)) score = 80;
      else if (hay.includes(n)) score = 50;
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.item.kind.localeCompare(b.item.kind))
    .map((x) => x.item)
    .slice(0, 24);
}

export function groupPalette(items: PaletteItem[]): Record<string, PaletteItem[]> {
  const out: Record<string, PaletteItem[]> = {};
  for (const item of items) {
    (out[item.kind] ??= []).push(item);
  }
  return out;
}

export type ContextKind = 'none' | 'part' | 'assembly' | 'requirement' | 'interface' | 'proposal';

export function contextActions(kind: ContextKind): { id: string; label: string; title: string }[] {
  switch (kind) {
    case 'part':
      return [
        { id: 'focus', label: 'FOCUS', title: 'Frame selected object.' },
        { id: 'isolate', label: 'ISOLATE', title: 'Hide unrelated objects temporarily.' },
        { id: 'explode', label: 'EXPLODE', title: 'Explode the parent assembly context.' },
        { id: 'measure', label: 'MEASURE', title: 'Envelope dimensions from DesignIR. Not a CMM.' },
        { id: 'track', label: 'TRACK', title: 'Keep this engineering entity monitored.' },
        { id: 'ask', label: 'ASK ARCHEON', title: 'Ask ARCHEON about this object.' }
      ];
    case 'assembly':
      return [
        { id: 'focus', label: 'FOCUS', title: 'Frame this assembly.' },
        { id: 'isolate', label: 'ISOLATE', title: 'Hide unrelated assemblies.' },
        { id: 'explode', label: 'EXPLODE', title: 'Explode this assembly only.' },
        { id: 'interfaces', label: 'INTERFACES', title: 'Show local connections.' },
        { id: 'track', label: 'TRACK', title: 'Watch this assembly.' },
        { id: 'ask', label: 'ASK', title: 'Ask ARCHEON about this assembly.' }
      ];
    case 'requirement':
      return [
        { id: 'affected', label: 'SHOW AFFECTED', title: 'Ghost unrelated systems.' },
        { id: 'track', label: 'TRACK', title: 'Watch this requirement.' },
        { id: 'ask', label: 'ASK', title: 'Ask ARCHEON why this requirement exists.' }
      ];
    case 'interface':
      return [
        { id: 'interfaces', label: 'CONNECTIONS', title: 'Show the local interface neighborhood.' },
        { id: 'track', label: 'TRACK', title: 'Watch this interface.' },
        { id: 'ask', label: 'ASK', title: 'Ask ARCHEON about this connection.' }
      ];
    case 'proposal':
      return [
        { id: 'compare', label: 'COMPARE', title: 'Overlay proposal geometry.' },
        { id: 'validate', label: 'VALIDATE', title: 'Run graph validators. Not FEA.' },
        { id: 'approve', label: 'APPROVE', title: 'Human COMMIT.' },
        { id: 'reject', label: 'REJECT', title: 'Discard the proposal. Canonical unchanged.' }
      ];
    default:
      return [
        { id: 'home', label: 'HOME', title: 'Assembled home view.' },
        { id: 'fit', label: 'FIT', title: 'Fit the whole machine.' },
        { id: 'ask', label: 'ASK ARCHEON', title: 'Open the agent HUD.' }
      ];
  }
}

export function objectHudActions(kind: ContextKind): { id: string; label: string }[] {
  if (kind === 'none') return [];
  if (kind === 'part') {
    return [
      { id: 'focus', label: 'FOCUS' },
      { id: 'isolate', label: 'ISOLATE' },
      { id: 'explode', label: 'EXPLODE' },
      { id: 'measure', label: 'MEASURE' },
      { id: 'track', label: 'TRACK' },
      { id: 'ask', label: 'ASK ARCHEON' },
      { id: 'more', label: 'MORE' }
    ];
  }
  const all = contextActions(kind);
  return all.slice(0, 4).concat(all.length > 4 ? [{ id: 'more', label: 'MORE' }] : []);
}
