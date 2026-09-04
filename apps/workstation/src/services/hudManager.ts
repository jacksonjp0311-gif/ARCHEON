export const HUD_IDS = [
  'agent',
  'project',
  'inspector',
  'analysis',
  'measure',
  'section',
  'compare',
  'health',
  'history',
  'bom',
  'interfaces',
  'library'
] as const;

export type HudId = (typeof HUD_IDS)[number];

export const PRIMARY_HUDS: HudId[] = ['project', 'inspector', 'analysis', 'compare', 'history', 'bom', 'library'];
export const UTILITY_HUDS: HudId[] = ['measure', 'section', 'health', 'interfaces'];
export const MAX_UTILITY = 2;

export interface HudGeom {
  open: boolean;
  pinned: boolean;
  collapsed: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  openedAt: number;
}

export type HudMap = Record<HudId, HudGeom>;

const DEFAULTS: Record<HudId, Pick<HudGeom, 'x' | 'y' | 'w' | 'h'>> = {
  agent: { x: -1, y: 10, w: 360, h: 460 },
  project: { x: 12, y: 36, w: 920, h: 650 },
  inspector: { x: -1, y: 52, w: 300, h: 520 },
  analysis: { x: -1, y: 52, w: 320, h: 360 },
  measure: { x: 12, y: -1, w: 280, h: 160 },
  section: { x: 12, y: -1, w: 280, h: 180 },
  compare: { x: -1, y: 52, w: 320, h: 280 },
  health: { x: -1, y: 52, w: 300, h: 360 },
  history: { x: -1, y: -1, w: 360, h: 280 },
  bom: { x: -1, y: -1, w: 420, h: 320 },
  interfaces: { x: 8, y: -1, w: 320, h: 240 },
  library: { x: -1, y: 52, w: 440, h: 560 }
};

export function defaultHud(id: HudId): HudGeom {
  return { open: false, pinned: false, collapsed: false, openedAt: 0, ...DEFAULTS[id] };
}

export function emptyHuds(): HudMap {
  const out = {} as HudMap;
  for (const id of HUD_IDS) out[id] = defaultHud(id);
  return out;
}

export function clampHud(g: HudGeom, vw: number, vh: number, pinned: boolean): HudGeom {
  const maxW = Math.max(240, vw - 24);
  const maxH = Math.max(140, vh - 56);
  const w = Math.min(g.w, maxW);
  const h = Math.min(g.h, maxH);
  const x = g.x < 0 ? g.x : Math.min(Math.max(0, g.x), Math.max(0, vw - w - 8));
  const y = g.y < 0 ? g.y : Math.min(Math.max(0, g.y), Math.max(0, vh - h - 48));
  if (pinned && g.x >= 0 && g.y >= 0) {
    const inaccessible = g.x > vw - 48 || g.y > vh - 48;
    if (!inaccessible) return { ...g, w, h };
  }
  return { ...g, w, h, x, y };
}

export function occupiedRatio(huds: HudMap, vw: number, vh: number): number {
  let occ = 0;
  for (const id of HUD_IDS) {
    const g = huds[id];
    if (!g.open || g.collapsed) continue;
    occ += g.w * g.h;
  }
  return occ / Math.max(1, vw * vh);
}

/** Keep ~55–60% of the modeling viewport unobstructed. Collapse oldest unpinned HUDs. */
export function preserveViewport(huds: HudMap, vw = 1280, vh = 720): HudMap {
  let next: HudMap = { ...huds };
  while (occupiedRatio(next, vw, vh) > 0.45) {
    const victims = HUD_IDS.filter((id) => next[id].open && !next[id].pinned && !next[id].collapsed).sort(
      (a, b) => next[a].openedAt - next[b].openedAt
    );
    const victim = victims.find((id) => id !== 'agent') ?? victims[0];
    if (!victim) break;
    next = { ...next, [victim]: { ...next[victim], collapsed: true } };
  }
  return next;
}

export function applyOpen(huds: HudMap, id: HudId, now = Date.now()): HudMap {
  const next: HudMap = { ...huds, [id]: { ...huds[id], open: true, collapsed: false, openedAt: now } };
  if (id === 'agent') return preserveViewport(next);
  if (PRIMARY_HUDS.includes(id)) {
    for (const p of PRIMARY_HUDS) {
      if (p !== id && next[p].open && !next[p].pinned) {
        next[p] = { ...next[p], open: false };
      }
    }
  }
  if (UTILITY_HUDS.includes(id)) {
    let openUtils = UTILITY_HUDS.filter((u) => next[u].open);
    while (openUtils.length > MAX_UTILITY) {
      const unpinned = openUtils
        .filter((u) => u !== id && !next[u].pinned)
        .sort((a, b) => next[a].openedAt - next[b].openedAt);
      const victim = unpinned[0] ?? openUtils.filter((u) => u !== id).sort((a, b) => next[a].openedAt - next[b].openedAt)[0];
      if (!victim) break;
      next[victim] = { ...next[victim], open: false };
      openUtils = UTILITY_HUDS.filter((u) => next[u].open);
    }
  }
  return preserveViewport(next);
}

export function applyClose(huds: HudMap, id: HudId): HudMap {
  return { ...huds, [id]: { ...huds[id], open: false, pinned: false } };
}

/** Inspector follows selection. Deselect closes it unless pinned. */
export function inspectorAfterSelection(huds: HudMap, selectedId: string | null): HudMap {
  if (selectedId) return applyOpen(huds, 'inspector');
  if (huds.inspector.pinned) return huds;
  return applyClose(huds, 'inspector');
}

export function applyPin(huds: HudMap, id: HudId, pinned: boolean): HudMap {
  return { ...huds, [id]: { ...huds[id], pinned, open: pinned ? true : huds[id].open } };
}

export function primaryOpen(huds: HudMap): HudId[] {
  return PRIMARY_HUDS.filter((id) => huds[id].open);
}

export function utilityOpen(huds: HudMap): HudId[] {
  return UTILITY_HUDS.filter((id) => huds[id].open);
}

export const HUD_KEY = 'archeon.huds.v2';

export function loadHuds(): HudMap {
  const base = emptyHuds();
  try {
    const raw = sessionStorage.getItem(HUD_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<HudMap>;
    for (const id of HUD_IDS) {
      if (parsed[id]) base[id] = { ...base[id], ...parsed[id] };
    }
  } catch { /* session only */ }
  return base;
}

export function saveHuds(huds: HudMap) {
  try {
    sessionStorage.setItem(HUD_KEY, JSON.stringify(huds));
  } catch { /* session only */ }
}

export interface Crumb {
  id: string;
  name: string;
}

export function breadcrumbs(
  selectedId: string | null,
  projectName: string,
  parts: { id: string; name: string; parent: string | null }[],
  assemblies: { id: string; name: string; parent: string | null }[]
): Crumb[] {
  const crumbs: Crumb[] = [{ id: 'project', name: projectName || 'ARCHEON' }];
  if (!selectedId) return crumbs;
  const chain: Crumb[] = [];
  let pid: string | null = selectedId;
  const seen = new Set<string>();
  while (pid && !seen.has(pid) && chain.length < 8) {
    seen.add(pid);
    const part = parts.find((p) => p.id === pid);
    const asm = assemblies.find((a) => a.id === pid);
    if (part) {
      chain.push({ id: part.id, name: part.name });
      pid = part.parent;
    } else if (asm) {
      chain.push({ id: asm.id, name: asm.name });
      pid = asm.parent;
    } else {
      chain.push({ id: pid, name: pid });
      break;
    }
  }
  const path = chain.reverse();
  if (path[0] && path[0].name === crumbs[0].name) crumbs.push(...path.slice(1));
  else crumbs.push(...path);
  return crumbs;
}

export const HUMAN_MODES = ['DESIGN', 'ASSEMBLE', 'ANALYZE', 'REVIEW'] as const;
export type HumanMode = (typeof HUMAN_MODES)[number];

export function toWorkstationMode(m: HumanMode): 'DESIGN' | 'ASSEMBLY' | 'ANALYSIS' | 'REVIEW' {
  if (m === 'ASSEMBLE') return 'ASSEMBLY';
  if (m === 'ANALYZE') return 'ANALYSIS';
  return m;
}

export function fromWorkstationMode(m: string): HumanMode {
  if (m === 'ASSEMBLY' || m === 'ASSEMBLE') return 'ASSEMBLE';
  if (m === 'ANALYSIS' || m === 'ANALYZE' || m === 'SIMULATION' || m === 'DIAGNOSTICS') return 'ANALYZE';
  if (m === 'REVIEW' || m === 'MANUFACTURING') return 'REVIEW';
  return 'DESIGN';
}

export const RAIL_ITEMS = [
  { id: 'project', group: 'MODEL', label: 'Project', detail: 'Overview & structure', glyph: '▣', hud: 'project' as HudId },
  { id: 'parts', group: 'MODEL', label: 'Parts', detail: 'Components & features', glyph: '◇', hud: 'project' as HudId },
  { id: 'joints', group: 'MODEL', label: 'Joints', detail: 'Motion & constraints', glyph: '⦿', hud: 'project' as HudId },
  { id: 'interfaces', group: 'MODEL', label: 'Interfaces', detail: 'Ports & connections', glyph: '⇄', hud: 'project' as HudId },
  { id: 'bom', group: 'ENGINEER', label: 'BOM', detail: 'Items & quantities', glyph: '≡', hud: 'bom' as HudId },
  { id: 'analyze', group: 'ENGINEER', label: 'Analyze', detail: 'Evidence & validation', glyph: '△', hud: 'analysis' as HudId },
  { id: 'library', group: 'KNOWLEDGE', label: 'Library', detail: 'Parts, patterns & materials', glyph: '▤', hud: 'library' as HudId },
  { id: 'agent', group: 'KNOWLEDGE', label: 'Master Engineer', detail: 'Goals, variants & review', glyph: '✦', hud: 'agent' as HudId },
  { id: 'history', group: 'KNOWLEDGE', label: 'History', detail: 'Revisions & decisions', glyph: '↻', hud: 'history' as HudId }
] as const;
