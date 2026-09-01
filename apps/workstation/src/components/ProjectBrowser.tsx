import { TREE_TABS, type TreeTab } from '@archeon/spatial-grammar';
import { Navigator } from './Navigator';
import { useUi } from '../store';
import type { Part, Requirement } from '@archeon/design-protocol';

const FILTERS = ['ALL', ...TREE_TABS] as const;

interface Props {
  parts: Part[];
  assemblies: { id: string; name: string; parent: string | null; semantic_role: string }[];
  features: { id: string; part: string; kind: string; semantic_role: string }[];
  interfaces: { id: string; name: string; kind: string; semantic_role: string }[];
  requirements: Requirement[];
}

export function ProjectBrowser(props: Props) {
  const filter = useUi((s) => s.browserFilter);
  const setFilter = useUi((s) => s.setBrowserFilter);
  const setTab = useUi((s) => s.setTreeTab);
  const setSelected = useUi((s) => s.setSelected);

  return (
    <div className="browser">
      <input
        className="browser-search"
        placeholder="filter name or id…"
        onChange={(e) => {
          const v = e.target.value.trim().toLowerCase();
          if (!v) return;
          const hit = props.parts.find((p) => p.name.toLowerCase().includes(v) || p.id.includes(v))
            ?? props.assemblies.find((a) => a.name.toLowerCase().includes(v) || a.id.includes(v));
          if (hit) setSelected(hit.id);
        }}
      />
      <div className="browser-filters">
        {FILTERS.map((f) => (
          <button key={f} type="button" className={filter === f ? 'active' : ''} onClick={() => {
            setFilter(f);
            if ((TREE_TABS as readonly string[]).includes(f)) setTab(f as TreeTab);
            if (f === 'ALL') setTab('ASSEMBLY');
          }}>
            {f}
          </button>
        ))}
      </div>
      <div className="browser-tree">
        <Navigator
          embedded
          parts={props.parts}
          assemblies={props.assemblies}
          features={props.features}
          interfaces={props.interfaces}
          requirements={props.requirements}
        />
      </div>
      <p className="notes">Filters, not destinations. The machine is the primary surface.</p>
    </div>
  );
}
