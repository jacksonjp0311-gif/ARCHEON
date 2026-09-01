import { create } from 'zustand';
import type { ViewMode, TreeTab, DockTab, SpatialView, RenderStyle, Overlay, WorkstationMode, AgentTab } from '@archeon/spatial-grammar';
import { composeFromLegacy } from '@archeon/spatial-grammar';
import type { ExplosionStrategy, SpreadPreset } from '@archeon/scene-engine';

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
  requestFit: (fitCenter, fitRadius) => set((s) => ({ fitCenter, fitRadius, fitNonce: s.fitNonce + 1 })),
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
      recentIds: []
    })
}));
