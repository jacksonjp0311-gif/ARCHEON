export const VIEW_MODES = [
  'ASSEMBLED',
  'EXPLODED',
  'SYSTEM_EXPLODED',
  'PART_EXPLODED',
  'SERVICE',
  'ISOLATE',
  'X_RAY',
  'CUTAWAY',
  'PROVENANCE',
  'INTERFACES',
  'CONSTRAINTS',
  'REQUIREMENTS',
  'AGENT_PROPOSAL',
  'DIFF'
] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

export const TREE_TABS = ['SYSTEM', 'ASSEMBLY', 'PARTS', 'FEATURES', 'INTERFACES', 'REQUIREMENTS'] as const;
export type TreeTab = (typeof TREE_TABS)[number];

export const DOCK_TABS = ['FEATURE TREE', 'BOM', 'TRANSACTIONS', 'VALIDATION', 'TIMELINE', 'CONSOLE'] as const;
export type DockTab = (typeof DOCK_TABS)[number];
