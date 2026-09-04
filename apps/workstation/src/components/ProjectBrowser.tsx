import { TREE_TABS, type TreeTab } from '@archeon/spatial-grammar';
import { Navigator } from './Navigator';
import { useUi } from '../store';
import type { DesignDocument } from '@archeon/design-protocol';
import { groupPalette, searchPalette, semanticCatalog } from '../services/palette';
import { useMemo, useState } from 'react';

const FILTERS = ['ALL', ...TREE_TABS] as const;

interface Props {
  document: DesignDocument;
}

export function ProjectBrowser(props: Props) {
  const { document } = props;
  const [query, setQuery] = useState('');
  const filter = useUi((s) => s.browserFilter);
  const setFilter = useUi((s) => s.setBrowserFilter);
  const setTab = useUi((s) => s.setTreeTab);
  const setSelected = useUi((s) => s.setSelected);
  const setFocus = useUi((s) => s.setFocusId);
  const results = useMemo(
    () => groupPalette(searchPalette(query, semanticCatalog(document))),
    [query, document]
  );

  return (
    <div className="browser">
      <input
        className="browser-search"
        placeholder="filter name or id…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
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
      {query.trim() ? (
        <div className="browser-tree semantic-results">
          {Object.entries(results).map(([kind, items]) => (
            <section key={kind}>
              <h3>{kind}</h3>
              {items.map((item) => (
                <button key={item.id} type="button" onClick={() => {
                  if (item.focusId) setFocus(item.focusId);
                  setSelected(item.id);
                }}>
                  <b>{item.label}</b><small>{item.id}</small>
                </button>
              ))}
            </section>
          ))}
        </div>
      ) : <div className="browser-tree">
        <Navigator
          embedded
          parts={document.parts}
          assemblies={document.assemblies}
          features={document.features}
          interfaces={document.interfaces}
          requirements={document.requirements}
        />
      </div>}
      <p className="notes">Filters, not destinations. The machine is the primary surface.</p>
    </div>
  );
}
