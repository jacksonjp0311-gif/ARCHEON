import { create } from 'zustand';
import type { ViewMode, TreeTab, DockTab, SpatialView, RenderStyle, Overlay, WorkstationMode, AgentTab } from '@archeon/spatial-grammar';
import { composeFromLegacy } from '@archeon/spatial-grammar';
import { applySceneCommand, nudgeSpread, type ExplosionStrategy, type SceneCommand, type SceneSnapshot, type SpreadPreset } from '@archeon/scene-engine';

export type DisplayState = 'VISIBLE' | 'HIDDEN' | 'GHOSTED' | 'ISOLATED';

interface Ui {
  selectedId: string | null;
  hoveredId: string | null;
  trackedIds: string[];
  recentIds: string[];
  neighborhoodIds: string[];
  ghostOthers: boolean;
  focusId: string | null;
  view: ViewMode;
  spatial: SpatialView;
  renderStyle: RenderStyle;
  overlay: Overlay;
  mode: WorkstationMode;
  explosion: number;
  strategy: ExplosionStrategy;
  spread: SpreadPreset;
  explodeContext: string | null;
  treeTab: TreeTab;
  dockTab: DockTab;
  isolate: string | null;
  connected: boolean;
  sectionOn: boolean;
  sectionAxis: 'x' | 'y' | 'z';
  sectionPos: number;
  hudOpen: boolean;
  hudCollapsed: boolean;
  agentTab: AgentTab;
  fitNonce: number;
  fitCenter: [number, number, number];
  fitRadius: number;
  variantMode: SceneSnapshot['variantMode'];
  activeVariant: string | null;
  geomRev: number;
  agentWorking: boolean;
  cadStatus: string | null;
  paletteOpen: boolean;
  inspectSection: 'SUMMARY' | 'ENGINEERING' | 'PROVENANCE' | 'GRAPH';
  cameraHistory: { center: [number, number, number]; radius: number }[];
  spatialHistory: SceneSnapshot[];
  setSelected: (id: string | null) => void;
  toggleSelected: (id: string) => void;
  setHovered: (id: string | null) => void;
  clearSelection: () => void;
  track: (id: string) => void;
  untrack: (id: string) => void;
  setNeighborhood: (ids: string[]) => void;
  setGhostOthers: (v: boolean) => void;
  setFocusId: (id: string | null) => void;
  setView: (view: ViewMode) => void;
  setSpatial: (spatial: SpatialView) => void;
  setRenderStyle: (style: RenderStyle) => void;
  setOverlay: (overlay: Overlay) => void;
  setMode: (mode: WorkstationMode) => void;
  setExplosion: (n: number) => void;
  setStrategy: (s: ExplosionStrategy) => void;
  setSpread: (s: SpreadPreset) => void;
  setExplodeContext: (id: string | null) => void;
  setTreeTab: (t: TreeTab) => void;
  setDockTab: (t: DockTab) => void;
  setIsolate: (id: string | null) => void;
  setConnected: (v: boolean) => void;
  setSectionOn: (v: boolean) => void;
  setSectionAxis: (a: 'x' | 'y' | 'z') => void;
  setSectionPos: (n: number) => void;
  setHudOpen: (v: boolean) => void;
  setHudCollapsed: (v: boolean) => void;
  setAgentTab: (t: AgentTab) => void;
  requestFit: (center: [number, number, number], radius: number) => void;
  resetView: () => void;
  clearProjectSelection: () => void;
  dispatch: (cmd: SceneCommand) => void;
  spatialUndo: () => void;
  setPaletteOpen: (v: boolean) => void;
  setInspectSection: (s: 'SUMMARY' | 'ENGINEERING' | 'PROVENANCE' | 'GRAPH') => void;
  setGeomRev: (n: number) => void;
  setAgentWorking: (v: boolean) => void;
  setCadStatus: (s: string | null) => void;
  setActiveVariant: (id: string | null) => void;
}

function pushRecent(recent: string[], id: string): string[] {
  return [id, ...recent.filter((x) => x !== id)].slice(0, 12);
}

export const useUi = create<Ui>((set) => ({
  selectedId: null,
  hoveredId: null,
  trackedIds: [],
  recentIds: [],
  neighborhoodIds: [],
  ghostOthers: false,
  focusId: null,
  view: 'ASSEMBLED',
  spatial: 'ASSEMBLED',
  renderStyle: 'SHADED_WITH_EDGES',
  overlay: 'NONE',
  mode: 'ASSEMBLY',
  explosion: 0,
  strategy: 'SEQUENCE',
  spread: 'ENGINEERING',
  explodeContext: null,
  treeTab: 'ASSEMBLY',
  dockTab: 'BOM',
  isolate: null,
  connected: false,
  sectionOn: false,
  sectionAxis: 'y',
  sectionPos: 0,
  hudOpen: false,
  hudCollapsed: false,
  agentTab: 'CHAT',
  fitNonce: 0,
  fitCenter: [0.4, 0.15, 0],
  fitRadius: 1.4,
  variantMode: 'NONE',
  activeVariant: null,
  geomRev: 0,
  agentWorking: false,
  cadStatus: null,
  paletteOpen: false,
  inspectSection: 'SUMMARY',
  cameraHistory: [],
  spatialHistory: [],
  setSelected: (selectedId) =>
    set((s) => ({
      selectedId,
      recentIds: selectedId ? pushRecent(s.recentIds, selectedId) : s.recentIds,
      isolate: selectedId ? s.isolate : null,
      neighborhoodIds: selectedId ? s.neighborhoodIds : []
    })),
  toggleSelected: (id) =>
    set((s) => {
      if (s.selectedId === id) {
        return { selectedId: null, isolate: null, neighborhoodIds: [] };
      }
      return { selectedId: id, recentIds: pushRecent(s.recentIds, id) };
    }),
  setHovered: (hoveredId) => set({ hoveredId }),
  clearSelection: () => set({ selectedId: null, isolate: null, neighborhoodIds: [], ghostOthers: false, focusId: null }),
  track: (id) => set((s) => ({ trackedIds: s.trackedIds.includes(id) ? s.trackedIds : [...s.trackedIds, id] })),
  untrack: (id) => set((s) => ({ trackedIds: s.trackedIds.filter((x) => x !== id) })),
  setNeighborhood: (neighborhoodIds) => set({ neighborhoodIds }),
  setGhostOthers: (ghostOthers) => set({ ghostOthers }),
  setFocusId: (focusId) => set({ focusId, spatial: focusId ? 'FOCUS' : 'ASSEMBLED' }),
  setView: (view) =>
    set((s) => {
      const composed = composeFromLegacy(view);
      return {
        view,
        spatial: composed.spatial,
        renderStyle: composed.style,
        overlay: composed.overlay,
        explosion:
          composed.spatial === 'ASSEMBLED' || composed.spatial === 'FOCUS' || composed.spatial === 'ISOLATE'
            ? composed.spatial === 'ASSEMBLED'
              ? 0
              : s.explosion
            : Math.max(s.explosion, 0.55),
        isolate: composed.spatial === 'ISOLATE' ? s.selectedId : composed.spatial === 'ASSEMBLED' ? null : s.isolate,
        strategy:
          composed.spatial === 'SERVICE'
            ? 'SERVICE'
            : composed.spatial === 'SYSTEM_EXPLODED'
              ? 'SYSTEM'
              : s.strategy
      };
    }),
  setSpatial: (spatial) =>
    set((s) => ({
      spatial,
      explosion: spatial === 'ASSEMBLED' || spatial === 'FOCUS' ? 0 : Math.max(s.explosion, 0.55),
      isolate: spatial === 'ISOLATE' ? s.selectedId : spatial === 'ASSEMBLED' ? null : s.isolate
    })),
  setRenderStyle: (renderStyle) => set({ renderStyle }),
  setOverlay: (overlay) => set({ overlay }),
  setMode: (mode) => set((s) => ({ mode, hudOpen: mode === 'AGENT' ? true : s.hudOpen })),
  setExplosion: (explosion) => set({ explosion }),
  setStrategy: (strategy) => set({ strategy }),
  setSpread: (spread) => set({ spread }),
  setExplodeContext: (explodeContext) => set({ explodeContext }),
  setTreeTab: (treeTab) => set({ treeTab }),
  setDockTab: (dockTab) => set({ dockTab }),
  setIsolate: (isolate) => set({ isolate, spatial: isolate ? 'ISOLATE' : 'ASSEMBLED', view: isolate ? 'ISOLATE' : 'ASSEMBLED' }),
  setConnected: (connected) => set({ connected }),
  setSectionOn: (sectionOn) => set((s) => ({ sectionOn, overlay: sectionOn ? 'ANALYSIS' : s.overlay })),
  setSectionAxis: (sectionAxis) => set({ sectionAxis }),
  setSectionPos: (sectionPos) => set({ sectionPos }),
  setHudOpen: (hudOpen) => set((s) => ({ hudOpen, hudCollapsed: hudOpen ? false : s.hudCollapsed })),
  setHudCollapsed: (hudCollapsed) => set({ hudCollapsed }),
  setAgentTab: (agentTab) => set({ agentTab }),
  requestFit: (fitCenter, fitRadius) =>
    set((s) => ({
      cameraHistory: [...s.cameraHistory, { center: s.fitCenter, radius: s.fitRadius }].slice(-12),
      fitCenter,
      fitRadius,
      fitNonce: s.fitNonce + 1
    })),
  resetView: () =>
    set((s) => ({
      view: 'ASSEMBLED',
      spatial: 'ASSEMBLED',
      renderStyle: 'SHADED_WITH_EDGES',
      overlay: 'NONE',
      explosion: 0,
      isolate: null,
      ghostOthers: false,
      focusId: null,
      explodeContext: null,
      neighborhoodIds: [],
      fitNonce: s.fitNonce + 1,
      fitCenter: [0.4, 0.15, 0],
      fitRadius: 1.4
    })),
  clearProjectSelection: () =>
    set({
      selectedId: null,
      hoveredId: null,
      neighborhoodIds: [],
      isolate: null,
      ghostOthers: false,
      focusId: null,
      explodeContext: null,
      trackedIds: [],
      recentIds: [],
      variantMode: 'NONE',
      activeVariant: null
    }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setInspectSection: (inspectSection) => set({ inspectSection }),
  setGeomRev: (geomRev) => set({ geomRev }),
  setAgentWorking: (agentWorking) => set({ agentWorking }),
  setCadStatus: (cadStatus) => set({ cadStatus }),
  setActiveVariant: (activeVariant) => set({ activeVariant }),
  spatialUndo: () =>
    set((s) => {
      const prev = s.spatialHistory[s.spatialHistory.length - 1];
      if (!prev) return s;
      return { ...fromSnap(prev), spatialHistory: s.spatialHistory.slice(0, -1), fitNonce: s.fitNonce + 1 };
    }),
  dispatch: (cmd) =>
    set((s) => {
      if (cmd.op === 'previous_view') {
        const prev = s.cameraHistory[s.cameraHistory.length - 1];
        if (!prev) return s;
        return {
          cameraHistory: s.cameraHistory.slice(0, -1),
          fitCenter: prev.center,
          fitRadius: prev.radius,
          fitNonce: s.fitNonce + 1
        };
      }
      let nextCmd = cmd;
      if (cmd.op === 'set_explosion_spread') {
        const raw = (cmd as { spread: string }).spread;
        if (raw === 'up' || raw === 'down') {
          nextCmd = { op: 'set_explosion_spread', spread: nudgeSpread(s.spread, raw === 'up' ? 1 : -1) };
        }
      }
      const snap = toSnap(s);
      const next = applySceneCommand(snap, nextCmd);
      const record = ['restore_display', 'explode_entity', 'explode_system', 'isolate_entity', 'focus_entity', 'ghost_others'].includes(cmd.op);
      return {
        ...fromSnap(next),
        spatialHistory: record ? [...s.spatialHistory, snap].slice(-16) : s.spatialHistory,
        fitNonce: next.fitRequest !== 'none' ? s.fitNonce + 1 : s.fitNonce
      };
    })
}));

function toSnap(s: Ui): SceneSnapshot {
  return {
    selectedId: s.selectedId,
    trackedIds: s.trackedIds,
    neighborhoodIds: s.neighborhoodIds,
    ghostOthers: s.ghostOthers,
    focusId: s.focusId,
    explosion: s.explosion,
    spread: s.spread,
    explodeContext: s.explodeContext,
    isolate: s.isolate,
    overlay: s.overlay,
    spatial: s.spatial,
    variantMode: s.variantMode,
    activeVariant: s.activeVariant,
    cameraAxis: null,
    fitRequest: 'none'
  };
}

function fromSnap(n: SceneSnapshot): Partial<Ui> {
  return {
    selectedId: n.selectedId,
    trackedIds: n.trackedIds,
    neighborhoodIds: n.neighborhoodIds,
    ghostOthers: n.ghostOthers,
    focusId: n.focusId,
    explosion: n.explosion,
    spread: n.spread,
    explodeContext: n.explodeContext,
    isolate: n.isolate,
    overlay: n.overlay as Ui['overlay'],
    spatial: n.spatial as Ui['spatial'],
    variantMode: n.variantMode,
    activeVariant: n.activeVariant
  };
}
