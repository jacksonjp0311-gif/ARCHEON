import { RAIL_ITEMS } from '../services/hudManager';
import { useUi } from '../store';

const GROUP_LABELS: Record<string, string> = {
  MODEL: 'MODEL',
  ENGINEER: 'ENGINEER',
  KNOWLEDGE: 'KNOWLEDGE'
};

export function EngineeringRail() {
  const huds = useUi((s) => s.huds);
  const browserFilter = useUi((s) => s.browserFilter);
  const selectedId = useUi((s) => s.selectedId);
  const expanded = useUi((s) => s.railExpanded);
  const openHud = useUi((s) => s.openHud);
  const closeHud = useUi((s) => s.closeHud);
  const setFilter = useUi((s) => s.setBrowserFilter);
  const setTab = useUi((s) => s.setTreeTab);
  const setMode = useUi((s) => s.setMode);
  const setExpanded = useUi((s) => s.setRailExpanded);

  const groups = [...new Set(RAIL_ITEMS.map((item) => item.group))];

  function isActive(item: (typeof RAIL_ITEMS)[number]) {
    if (!huds[item.hud].open) return false;
    if (item.id === 'project') return browserFilter === 'ALL';
    if (item.id === 'parts') return browserFilter === 'PARTS';
    if (item.id === 'joints') return browserFilter === 'JOINTS';
    if (item.id === 'interfaces') return browserFilter === 'INTERFACES';
    return true;
  }

  function activate(item: (typeof RAIL_ITEMS)[number]) {
    if (item.id === 'project') { setFilter('ALL'); setTab('ASSEMBLY'); }
    if (item.id === 'parts') { setFilter('PARTS'); setTab('PARTS'); }
    if (item.id === 'joints') { setFilter('JOINTS'); setTab('JOINTS'); }
    if (item.id === 'interfaces') { setFilter('INTERFACES'); setTab('INTERFACES'); }
    if (item.id === 'analyze') setMode('ANALYSIS');
    if (item.id === 'agent') setMode('AGENT');

    if (isActive(item)) closeHud(item.hud);
    else openHud(item.hud);
  }

  return (
    <nav className={`eng-rail ${expanded ? 'is-expanded' : 'is-collapsed'}`} aria-label="Engineering workspace navigation">
      <header className="eng-rail__header">
        <div className="eng-rail__heading">
          <span>WORKSPACE</span>
          <small>SPATIAL ENGINEERING</small>
        </div>
        <button
          type="button"
          className="eng-rail__collapse"
          title={expanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '‹' : '›'}
        </button>
      </header>

      <div className="eng-rail__scroll">
        {groups.map((group) => (
          <section className="eng-rail__group" key={group} aria-label={GROUP_LABELS[group]}>
            <h2>{GROUP_LABELS[group]}</h2>
            {RAIL_ITEMS.filter((item) => item.group === group).map((item) => {
              const active = isActive(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`eng-rail__item ${active ? 'active' : ''} ${item.id === 'agent' ? 'is-agent' : ''}`}
                  title={`${item.label} — ${item.detail}`}
                  aria-label={`${item.label} — ${item.detail}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => activate(item)}
                >
                  <span className="eng-rail__glyph" aria-hidden="true">{item.glyph}</span>
                  <span className="eng-rail__copy">
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span className="eng-rail__state" aria-hidden="true" />
                </button>
              );
            })}
          </section>
        ))}
      </div>

      <footer className="eng-rail__footer">
        <button type="button" className="eng-rail__search" onClick={() => useUi.getState().setPaletteOpen(true)} title="Find anything — Ctrl+K" aria-label="Find anything — Ctrl+K">
          <span className="eng-rail__glyph" aria-hidden="true">⌕</span>
          <span className="eng-rail__copy"><strong>Find anything</strong><small>Ctrl+K</small></span>
        </button>
        <div className="eng-rail__context" title={selectedId ?? 'No geometry selected'}>
          <span className={selectedId ? 'is-live' : ''} />
          <p><small>CONTEXT</small><strong>{selectedId ?? 'No selection'}</strong></p>
        </div>
      </footer>
    </nav>
  );
}
