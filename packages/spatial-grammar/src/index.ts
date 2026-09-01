export const SPATIAL_VIEWS = [
  'ASSEMBLED',
  'EXPLODED',
  'SYSTEM_EXPLODED',
  'PART_EXPLODED',
  'SERVICE',
  'ISOLATE',
  'FOCUS'
] as const;
export type SpatialView = (typeof SPATIAL_VIEWS)[number];

export const RENDER_STYLES = ['SHADED', 'SHADED_WITH_EDGES', 'WIREFRAME', 'XRAY', 'GHOST', 'HIDDEN_LINE'] as const;
export type RenderStyle = (typeof RENDER_STYLES)[number];

export const OVERLAYS = [
  'NONE',
  'INTERFACES',
  'CONSTRAINTS',
  'REQUIREMENTS',
  'PROVENANCE',
  'EXPLODE_LINES',
  'AGENT_DIFF',
  'ANALYSIS'
] as const;
export type Overlay = (typeof OVERLAYS)[number];

export const WORKSTATION_MODES = [
  'DESIGN',
  'ASSEMBLY',
  'ANALYSIS',
  'SIMULATION',
  'DIAGNOSTICS',
  'REVIEW',
  'MANUFACTURING',
  'AGENT'
] as const;
export type WorkstationMode = (typeof WORKSTATION_MODES)[number];

/** Backward-compatible view labels used by existing commands. */
export const VIEW_MODES = [
  'ASSEMBLED',
  'EXPLODED',
  'SYSTEM_EXPLODED',
  'PART_EXPLODED',
  'SERVICE',
  'ISOLATE',
  'X_RAY',
  'CUTAWAY',
  'HEAT-MAP',
  'PROVENANCE',
  'INTERFACES',
  'CONSTRAINTS',
  'REQUIREMENTS',
  'AGENT_PROPOSAL',
  'DIFF'
] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const TREE_TABS = [
  'SYSTEM',
  'ASSEMBLY',
  'PARTS',
  'FEATURES',
  'JOINTS',
  'INTERFACES',
  'ANALYSIS',
  'REQUIREMENTS'
] as const;
export type TreeTab = (typeof TREE_TABS)[number];

export const DOCK_TABS = [
  'FEATURE TREE',
  'BOM',
  'MATES',
  'ANALYSIS',
  'TRANSACTIONS',
  'VALIDATION',
  'TIMELINE'
] as const;
export type DockTab = (typeof DOCK_TABS)[number];

export const AGENT_TABS = ['CHAT', 'AGENTS', 'PLAN', 'PROPOSAL', 'VALIDATION', 'ACTIVITY'] as const;
export type AgentTab = (typeof AGENT_TABS)[number];

export function composeFromLegacy(view: ViewMode): { spatial: SpatialView; style: RenderStyle; overlay: Overlay } {
  switch (view) {
    case 'EXPLODED':
      return { spatial: 'EXPLODED', style: 'SHADED_WITH_EDGES', overlay: 'EXPLODE_LINES' };
    case 'SYSTEM_EXPLODED':
      return { spatial: 'SYSTEM_EXPLODED', style: 'SHADED_WITH_EDGES', overlay: 'EXPLODE_LINES' };
    case 'PART_EXPLODED':
      return { spatial: 'PART_EXPLODED', style: 'SHADED_WITH_EDGES', overlay: 'EXPLODE_LINES' };
    case 'SERVICE':
      return { spatial: 'SERVICE', style: 'SHADED_WITH_EDGES', overlay: 'NONE' };
    case 'ISOLATE':
      return { spatial: 'ISOLATE', style: 'SHADED_WITH_EDGES', overlay: 'NONE' };
    case 'X_RAY':
      return { spatial: 'ASSEMBLED', style: 'XRAY', overlay: 'NONE' };
    case 'CUTAWAY':
      return { spatial: 'ASSEMBLED', style: 'SHADED_WITH_EDGES', overlay: 'ANALYSIS' };
    case 'PROVENANCE':
      return { spatial: 'ASSEMBLED', style: 'SHADED_WITH_EDGES', overlay: 'PROVENANCE' };
    case 'INTERFACES':
      return { spatial: 'ASSEMBLED', style: 'SHADED_WITH_EDGES', overlay: 'INTERFACES' };
    case 'CONSTRAINTS':
      return { spatial: 'ASSEMBLED', style: 'SHADED_WITH_EDGES', overlay: 'CONSTRAINTS' };
    case 'REQUIREMENTS':
      return { spatial: 'ASSEMBLED', style: 'SHADED_WITH_EDGES', overlay: 'REQUIREMENTS' };
    case 'AGENT_PROPOSAL':
    case 'DIFF':
      return { spatial: 'ASSEMBLED', style: 'SHADED_WITH_EDGES', overlay: 'AGENT_DIFF' };
    default:
      return { spatial: 'ASSEMBLED', style: 'SHADED_WITH_EDGES', overlay: 'NONE' };
  }
}
