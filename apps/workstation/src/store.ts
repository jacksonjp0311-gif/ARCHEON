import { create } from 'zustand';
import type { ViewMode, TreeTab, DockTab, SpatialView, RenderStyle, Overlay, OverlayFlag, OverlayState, WorkstationMode, AgentTab } from '@archeon/spatial-grammar';
import { composeFromLegacy, emptyOverlays, enableOverlay, primaryOverlayName, toggleOverlayFlag } from '@archeon/spatial-grammar';
import { applySceneCommand, nudgeSpread, type ExplosionStrategy, type SceneCommand, type SceneSnapshot, type SpreadPreset } from '@archeon/scene-engine';
import { applyClose, applyOpen, applyPin, emptyHuds, inspectorAfterSelection, saveHuds, type HudGeom, type HudId, type HudMap } from './services/hudManager';

export type DisplayState = 'VISIBLE' | 'HIDDEN' | 'GHOSTED' | 'ISOLATED';

export interface MechanicalFrame {
  op: string;
  entityId: string | null;
  selectedId: string | null;
  openId: string | null;
  stackIds: string[];
  loadPathIds: string[];
  serviceIds: string[];
  axisJointId: string | null;
  neighborhoodIds: string[];
  ghostOthers: boolean;
  ghostRoles: string[];
  sectionOn: boolean;
  spatial: SpatialView;
  overlay: Overlay;
  isolate: string | null;
  explosion: number;
  explodeContext: string | null;
}

export interface RenderDebug {
  edges: boolean;
  grid: boolean;
  trails: boolean;
  interfaces: boolean;
  datums: boolean;
  cadMeshes: boolean;
  primitives: boolean;
  shadows: boolean;
}

export const DEFAULT_RENDER_DEBUG: RenderDebug = {
  edges: true,
  grid: true,
  trails: true,
  interfaces: true,
  datums: true,
  cadMeshes: true,
  primitives: true,
  shadows: true
};

export interface MeshLocalBounds {
  min: [number, number, number];
  max: [number, number, number];
  triangles: number;
}

export interface RenderStats {
  visibleParts: number;
  cadMeshes: number;
  primitiveFallbacks: number;
  triangles: number;
  drawCalls: number;
  edgesEnabled: boolean;
  sceneSize: [number, number, number];
  largestId: string | null;
  largestSize: [number, number, number];
  geomRev: number;
}

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
  overlays: OverlayState;
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
  ghostRoles: string[];
  hudOpen: boolean;
  hudCollapsed: boolean;
  agentTab: AgentTab;
  fitNonce: number;
  fitEpoch: number;
  fitCenter: [number, number, number];
  fitRadius: number;
  fitSize: [number, number, number];
  cameraAxis: 'x' | 'y' | 'z' | null;
  variantMode: SceneSnapshot['variantMode'];
  activeVariant: string | null;
  geomRev: number;
  agentWorking: boolean;
  cadStatus: string | null;
  paletteOpen: boolean;
  inspectSection: 'SUMMARY' | 'ENGINEERING' | 'PROVENANCE' | 'GRAPH';
  inspectOpen: Record<string, boolean>;
  cameraHistory: { center: [number, number, number]; radius: number }[];
  spatialHistory: SceneSnapshot[];
  huds: HudMap;
  browserFilter: string;
  workbenchOpen: boolean;
  trackerExpanded: boolean;
  contextMenu: { x: number; y: number; id: string } | null;
  radialOpen: boolean;
  renderDebug: RenderDebug;
  meshBounds: Record<string, MeshLocalBounds>;
  jointPositions: Record<string, number>;
  partWorkbenchOpen: boolean;
  railExpanded: boolean;
  expandedNodeIds: string[];
  revealNonce: number;
  openId: string | null;
  stackIds: string[];
  loadPathIds: string[];
  serviceIds: string[];
  axisJointId: string | null;
  mechanicalOp: string | null;
  mechanicalHistory: MechanicalFrame[];
  renderStats: RenderStats;
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
  toggleOverlay: (flag: OverlayFlag) => void;
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
  setGhostRoles: (roles: string[]) => void;
  setHudOpen: (v: boolean) => void;
  setHudCollapsed: (v: boolean) => void;
  setAgentTab: (t: AgentTab) => void;
  requestFit: (center: [number, number, number], radius: number, size?: [number, number, number]) => void;
  bumpFit: () => void;
  resetView: () => void;
  clearProjectSelection: () => void;
  dispatch: (cmd: SceneCommand) => void;
  spatialUndo: () => void;
  setPaletteOpen: (v: boolean) => void;
  setInspectSection: (s: 'SUMMARY' | 'ENGINEERING' | 'PROVENANCE' | 'GRAPH') => void;
  toggleInspect: (section: string) => void;
  setGeomRev: (n: number) => void;
  setAgentWorking: (v: boolean) => void;
  setCadStatus: (s: string | null) => void;
  setActiveVariant: (id: string | null) => void;
  openHud: (id: HudId) => void;
  closeHud: (id: HudId) => void;
  pinHud: (id: HudId, pinned: boolean) => void;
  patchHud: (id: HudId, patch: Partial<HudGeom>) => void;
  setBrowserFilter: (f: string) => void;
  setWorkbenchOpen: (v: boolean) => void;
  setTrackerExpanded: (v: boolean) => void;
  setContextMenu: (m: { x: number; y: number; id: string } | null) => void;
  setRadialOpen: (v: boolean) => void;
  toggleRenderDebug: (k: keyof RenderDebug) => void;
  setMeshBounds: (id: string, b: MeshLocalBounds) => void;
  setJointPosition: (id: string, value: number) => void;
  resetJointPositions: () => void;
  setPartWorkbenchOpen: (open: boolean) => void;
  setRailExpanded: (expanded: boolean) => void;
  revealEntity: (id: string, ancestors: string[]) => void;
  toggleExpanded: (id: string) => void;
  setMechanical: (patch: Partial<Pick<Ui, 'openId' | 'stackIds' | 'loadPathIds' | 'serviceIds' | 'axisJointId' | 'neighborhoodIds' | 'ghostOthers' | 'ghostRoles' | 'mechanicalOp'>>) => void;
  clearMechanical: () => void;
  pushMechanicalFrame: (frame: MechanicalFrame) => void;
  popMechanicalFrame: () => MechanicalFrame | null;
  applyMechanicalFrame: (frame: MechanicalFrame) => void;
  setRenderStats: (s: RenderStats) => void;
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
  overlays: emptyOverlays(),
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
  sectionAxis: 'z',
  sectionPos: 0,
  ghostRoles: [],
  hudOpen: false,
  hudCollapsed: false,
  agentTab: 'CHAT',
  fitNonce: 0,
  fitEpoch: 0,
  fitCenter: [0.4, 0, 0.15],
  fitRadius: 1.4,
  fitSize: [1.2, 0.8, 0.4],
  cameraAxis: null,
  variantMode: 'NONE',
  activeVariant: null,
  geomRev: 0,
  agentWorking: false,
  cadStatus: null,
  paletteOpen: false,
  inspectSection: 'SUMMARY',
  inspectOpen: {},
  cameraHistory: [],
  spatialHistory: [],
  huds: emptyHuds(),
  browserFilter: 'ALL',
  workbenchOpen: false,
  trackerExpanded: false,
  contextMenu: null,
  radialOpen: false,
  renderDebug: DEFAULT_RENDER_DEBUG,
  meshBounds: {},
  jointPositions: {},
  partWorkbenchOpen: false,
  railExpanded: true,
  expandedNodeIds: [],
  revealNonce: 0,
  openId: null,
  stackIds: [],
  loadPathIds: [],
  serviceIds: [],
  axisJointId: null,
  mechanicalOp: null,
  mechanicalHistory: [],
  renderStats: {
    visibleParts: 0,
    cadMeshes: 0,
    primitiveFallbacks: 0,
    triangles: 0,
    drawCalls: 0,
    edgesEnabled: true,
    sceneSize: [0, 0, 0],
    largestId: null,
    largestSize: [0, 0, 0],
    geomRev: 0
  },
  setSelected: (selectedId) =>
    set((s) => {
      const huds = inspectorAfterSelection(s.huds, selectedId);
      saveHuds(huds);
      return {
        selectedId,
        recentIds: selectedId ? pushRecent(s.recentIds, selectedId) : s.recentIds,
        isolate: selectedId ? s.isolate : null,
        neighborhoodIds: selectedId ? s.neighborhoodIds : [],
        radialOpen: false,
        contextMenu: null as Ui['contextMenu'],
        huds
      };
    }),
  toggleSelected: (id) =>
    set((s) => {
      if (s.selectedId === id) {
        const huds = inspectorAfterSelection(s.huds, null);
        saveHuds(huds);
        return { selectedId: null, isolate: null, neighborhoodIds: [], radialOpen: false, huds };
      }
      const huds = inspectorAfterSelection(s.huds, id);
      saveHuds(huds);
      return { selectedId: id, recentIds: pushRecent(s.recentIds, id), huds };
    }),
  setHovered: (hoveredId) => set({ hoveredId }),
  clearSelection: () =>
    set((s) => {
      const huds = inspectorAfterSelection(s.huds, null);
      saveHuds(huds);
      return { selectedId: null, neighborhoodIds: [], ghostOthers: false, focusId: null, huds };
    }),
  track: (id) => set((s) => ({ trackedIds: s.trackedIds.includes(id) ? s.trackedIds : [...s.trackedIds, id], trackerExpanded: true })),
  untrack: (id) => set((s) => ({ trackedIds: s.trackedIds.filter((x) => x !== id) })),
  setNeighborhood: (neighborhoodIds) => set({ neighborhoodIds }),
  setGhostOthers: (ghostOthers) => set({ ghostOthers }),
  setFocusId: (focusId) =>
    set((s) => ({
      focusId,
      spatial:
        s.explosion > 0.02 || s.spatial === 'PART_EXPLODED' || s.spatial === 'SYSTEM_EXPLODED' || s.spatial === 'EXPLODED'
          ? s.spatial
          : focusId
            ? 'FOCUS'
            : 'ASSEMBLED'
    })),
  setView: (view) =>
    set((s) => {
      const composed = composeFromLegacy(view);
      return {
        view,
        spatial: composed.spatial,
        renderStyle: composed.style,
        overlay: composed.overlay,
        overlays: composed.overlay === 'NONE' ? s.overlays : enableOverlay(emptyOverlays(), composed.overlay),
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
  setOverlay: (overlay) =>
    set((s) => {
      const overlays = overlay === 'NONE' ? emptyOverlays() : enableOverlay(s.overlays, overlay);
      return { overlay: primaryOverlayName(overlays), overlays };
    }),
  toggleOverlay: (flag) =>
    set((s) => {
      const overlays = toggleOverlayFlag(s.overlays, flag);
      return { overlays, overlay: primaryOverlayName(overlays) };
    }),
  setMode: (mode) => set((s) => ({ mode, hudOpen: mode === 'AGENT' ? true : s.hudOpen })),
  setExplosion: (explosion) => set({ explosion }),
  setStrategy: (strategy) => set({ strategy }),
  setSpread: (spread) => set({ spread }),
  setExplodeContext: (explodeContext) => set({ explodeContext }),
  setTreeTab: (treeTab) => set({ treeTab }),
  setDockTab: (dockTab) => set({ dockTab }),
  setIsolate: (isolate) => set({
    isolate,
    spatial: isolate ? 'ISOLATE' : 'ASSEMBLED',
    view: isolate ? 'ISOLATE' : 'ASSEMBLED',
    partWorkbenchOpen: !!isolate && isolate.startsWith('part.')
  }),
  setConnected: (connected) => set({ connected }),
  setSectionOn: (sectionOn) =>
    set((s) => {
      const overlays = { ...s.overlays, analysis: sectionOn };
      return { sectionOn, overlays, overlay: primaryOverlayName(overlays) };
    }),
  setGhostRoles: (ghostRoles) => set({ ghostRoles }),
  setSectionAxis: (sectionAxis) => set({ sectionAxis }),
  setSectionPos: (sectionPos) => set({ sectionPos }),
  setHudOpen: (hudOpen) =>
    set((s) => {
      const huds = hudOpen ? applyOpen(s.huds, 'agent') : applyClose(s.huds, 'agent');
      saveHuds(huds);
      return { hudOpen, hudCollapsed: hudOpen ? false : s.hudCollapsed, huds };
    }),
  setHudCollapsed: (hudCollapsed) => set({ hudCollapsed }),
  setAgentTab: (agentTab) => set({ agentTab }),
  requestFit: (fitCenter, fitRadius, fitSize) =>
    set((s) => ({
      cameraHistory: [...s.cameraHistory, { center: s.fitCenter, radius: s.fitRadius }].slice(-12),
      fitCenter,
      fitRadius,
      fitSize: fitSize ?? s.fitSize,
      fitNonce: s.fitNonce + 1
    })),
  bumpFit: () => set((s) => ({ fitEpoch: s.fitEpoch + 1 })),
  resetView: () =>
    set((s) => ({
      view: 'ASSEMBLED',
      spatial: 'ASSEMBLED',
      renderStyle: 'SHADED_WITH_EDGES',
      overlay: 'NONE',
      overlays: emptyOverlays(),
      explosion: 0,
      isolate: null,
      ghostOthers: false,
      focusId: null,
      explodeContext: null,
      neighborhoodIds: [],
      fitNonce: s.fitNonce + 1,
      fitCenter: [0.4, 0, 0.15],
      fitRadius: 1.4,
      cameraAxis: null as Ui['cameraAxis'],
      openId: null,
      stackIds: [],
      loadPathIds: [],
      serviceIds: [],
      axisJointId: null,
      ghostRoles: [],
      mechanicalOp: null,
      mechanicalHistory: []
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
      activeVariant: null,
      jointPositions: {},
      partWorkbenchOpen: false
    }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setInspectSection: (inspectSection) => set({ inspectSection }),
  setGeomRev: (geomRev) => set({ geomRev, meshBounds: {} }),
  setAgentWorking: (agentWorking) => set({ agentWorking }),
  setCadStatus: (cadStatus) => set({ cadStatus }),
  setActiveVariant: (activeVariant) => set({ activeVariant }),
  toggleInspect: (section) => set((s) => ({ inspectOpen: { ...s.inspectOpen, [section]: !s.inspectOpen[section] } })),
  openHud: (id) =>
    set((s) => {
      const huds = applyOpen(s.huds, id);
      saveHuds(huds);
      return { huds, hudOpen: id === 'agent' ? true : s.hudOpen, paletteOpen: id === 'project' && s.browserFilter === 'FIND' ? s.paletteOpen : s.paletteOpen };
    }),
  closeHud: (id) =>
    set((s) => {
      const huds = applyClose(s.huds, id);
      saveHuds(huds);
      return { huds, hudOpen: id === 'agent' ? false : s.hudOpen };
    }),
  pinHud: (id, pinned) =>
    set((s) => {
      const huds = applyPin(s.huds, id, pinned);
      saveHuds(huds);
      return { huds };
    }),
  patchHud: (id, patch) =>
    set((s) => {
      const huds = { ...s.huds, [id]: { ...s.huds[id], ...patch } };
      saveHuds(huds);
      return { huds };
    }),
  setBrowserFilter: (browserFilter) => set({ browserFilter }),
  setWorkbenchOpen: (workbenchOpen) => set({ workbenchOpen }),
  setTrackerExpanded: (trackerExpanded) => set({ trackerExpanded }),
  setContextMenu: (contextMenu) => set({ contextMenu, radialOpen: false }),
  setRadialOpen: (radialOpen) => set({ radialOpen, contextMenu: null }),
  toggleRenderDebug: (k) => set((s) => ({ renderDebug: { ...s.renderDebug, [k]: !s.renderDebug[k] } })),
  setMeshBounds: (id, b) => set((s) => ({ meshBounds: { ...s.meshBounds, [id]: b } })),
  setJointPosition: (id, value) => set((s) => ({ jointPositions: { ...s.jointPositions, [id]: value } })),
  resetJointPositions: () => set({ jointPositions: {} }),
  setPartWorkbenchOpen: (partWorkbenchOpen) => set({ partWorkbenchOpen }),
  setRailExpanded: (railExpanded) => set({ railExpanded }),
  revealEntity: (id, ancestors) =>
    set((s) => ({
      selectedId: id,
      expandedNodeIds: [...new Set([...s.expandedNodeIds, ...ancestors, id])],
      revealNonce: s.revealNonce + 1,
      treeTab: ancestors.some((a) => a.startsWith('asm.')) || id.startsWith('asm.') ? 'ASSEMBLY' : s.treeTab
    })),
  toggleExpanded: (id) =>
    set((s) => ({
      expandedNodeIds: s.expandedNodeIds.includes(id) ? s.expandedNodeIds.filter((x) => x !== id) : [...s.expandedNodeIds, id]
    })),
  setMechanical: (patch) => set(patch),
  clearMechanical: () =>
    set({
      openId: null,
      stackIds: [],
      loadPathIds: [],
      serviceIds: [],
      axisJointId: null,
      ghostRoles: [],
      ghostOthers: false,
      sectionOn: false,
      neighborhoodIds: [],
      mechanicalOp: null,
      mechanicalHistory: []
    }),
  pushMechanicalFrame: (frame) =>
    set((s) => ({ mechanicalHistory: [...s.mechanicalHistory, frame].slice(-16) })),
  popMechanicalFrame: () => {
    let frame: MechanicalFrame | null = null;
    set((s) => {
      if (!s.mechanicalHistory.length) return s;
      frame = s.mechanicalHistory[s.mechanicalHistory.length - 1];
      return { mechanicalHistory: s.mechanicalHistory.slice(0, -1) };
    });
    return frame;
  },
  applyMechanicalFrame: (frame) =>
    set((s) => {
      let overlays = frame.overlay && frame.overlay !== 'NONE' ? enableOverlay(emptyOverlays(), frame.overlay) : emptyOverlays();
      if (frame.sectionOn) overlays = { ...overlays, analysis: true };
      return {
        mechanicalOp: frame.op || null,
        selectedId: frame.selectedId ?? s.selectedId,
        openId: frame.openId,
        stackIds: frame.stackIds,
        loadPathIds: frame.loadPathIds,
        serviceIds: frame.serviceIds,
        axisJointId: frame.axisJointId,
        neighborhoodIds: frame.neighborhoodIds,
        ghostOthers: frame.ghostOthers,
        ghostRoles: frame.ghostRoles,
        sectionOn: frame.sectionOn,
        spatial: frame.spatial,
        overlay: primaryOverlayName(overlays),
        overlays,
        isolate: frame.isolate,
        explosion: frame.explosion,
        explodeContext: frame.explodeContext
      };
    }),
  setRenderStats: (renderStats) => set({ renderStats }),
  spatialUndo: () =>
    set((s) => {
      const prev = s.spatialHistory[s.spatialHistory.length - 1];
      if (!prev) return s;
      return { ...fromSnap(prev), spatialHistory: s.spatialHistory.slice(0, -1), fitEpoch: s.fitEpoch + 1 };
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
      let overlays = s.overlays;
      if (cmd.op === 'show_overlay') overlays = enableOverlay(s.overlays, (cmd as { overlay: string }).overlay);
      else if (cmd.op === 'hide_overlay' || cmd.op === 'restore_display' || cmd.op === 'home_view') overlays = emptyOverlays();
      let huds = s.huds;
      if (cmd.op === 'clear_selection' || cmd.op === 'select_entity') {
        huds = inspectorAfterSelection(s.huds, next.selectedId);
        saveHuds(huds);
      }
      const resetMech = cmd.op === 'restore_display' || cmd.op === 'home_view';
      return {
        ...fromSnap(next),
        overlays,
        overlay: primaryOverlayName(overlays),
        huds,
        spatialHistory: record ? [...s.spatialHistory, snap].slice(-16) : s.spatialHistory,
        fitEpoch: next.fitRequest !== 'none' ? s.fitEpoch + 1 : s.fitEpoch,
        partWorkbenchOpen:
          cmd.op === 'isolate_entity'
            ? !!next.isolate && next.isolate.startsWith('part.')
            : resetMech
              ? false
              : s.partWorkbenchOpen,
        ...(resetMech
          ? {
              openId: null,
              stackIds: [],
              loadPathIds: [],
              serviceIds: [],
              axisJointId: null,
              ghostRoles: [],
              mechanicalOp: null,
              mechanicalHistory: [] as MechanicalFrame[],
              neighborhoodIds: []
            }
          : {})
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
    cameraAxis: s.cameraAxis,
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
    activeVariant: n.activeVariant,
    cameraAxis: n.cameraAxis
  };
}
