import { create } from 'zustand';
import type { ViewMode, TreeTab, DockTab } from '@archeon/spatial-grammar';
import type { ExplosionStrategy } from '@archeon/scene-engine';

interface Ui {
  selectedId: string;
  view: ViewMode;
  explosion: number;
  strategy: ExplosionStrategy;
  treeTab: TreeTab;
  dockTab: DockTab;
  isolate: string | null;
  connected: boolean;
  setSelected: (id: string) => void;
  setView: (view: ViewMode) => void;
  setExplosion: (n: number) => void;
  setStrategy: (s: ExplosionStrategy) => void;
  setTreeTab: (t: TreeTab) => void;
  setDockTab: (t: DockTab) => void;
  setIsolate: (id: string | null) => void;
  setConnected: (v: boolean) => void;
  resetView: () => void;
}

export const useUi = create<Ui>((set) => ({
  selectedId: 'part.shoulder.housing',
  view: 'ASSEMBLED',
  explosion: 0,
  strategy: 'SEQUENCE',
  treeTab: 'ASSEMBLY',
  dockTab: 'BOM',
  isolate: null,
  connected: false,
  setSelected: (selectedId) => set({ selectedId }),
  setView: (view) =>
    set((s) => ({
      view,
      explosion: view === 'ASSEMBLED' ? 0 : view === 'EXPLODED' || view === 'SERVICE' ? Math.max(s.explosion, 0.7) : s.explosion,
      isolate: view === 'ISOLATE' ? s.selectedId : view === 'ASSEMBLED' ? null : s.isolate,
      strategy: view === 'SERVICE' ? 'SERVICE' : view === 'SYSTEM_EXPLODED' ? 'SYSTEM' : s.strategy
    })),
  setExplosion: (explosion) => set({ explosion }),
  setStrategy: (strategy) => set({ strategy }),
  setTreeTab: (treeTab) => set({ treeTab }),
  setDockTab: (dockTab) => set({ dockTab }),
  setIsolate: (isolate) => set({ isolate, view: isolate ? 'ISOLATE' : 'ASSEMBLED' }),
  setConnected: (connected) => set({ connected }),
  resetView: () => set({ view: 'ASSEMBLED', explosion: 0, isolate: null, selectedId: 'part.base.plate' })
}));
