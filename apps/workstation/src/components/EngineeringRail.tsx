import { RAIL_ITEMS } from '../services/hudManager';
import { useUi } from '../store';

export function EngineeringRail() {
  const huds = useUi((s) => s.huds);
  const openHud = useUi((s) => s.openHud);
  const closeHud = useUi((s) => s.closeHud);
  const setPalette = useUi((s) => s.setPaletteOpen);
  const setFilter = useUi((s) => s.setBrowserFilter);
  const setTab = useUi((s) => s.setTreeTab);

  return (
    <nav className="eng-rail" aria-label="Engineering rail">
      {RAIL_ITEMS.map((item) => {
        const active = item.hud ? huds[item.hud].open : false;
        return (
          <button
            key={item.id}
            type="button"
            className={active ? 'active' : ''}
            title={item.label}
            onClick={() => {
              if (item.id === 'find') {
                setPalette(true);
                return;
              }
              if (!item.hud) return;
              if (item.id === 'system') { setFilter('SYSTEM'); setTab('SYSTEM'); }
              if (item.id === 'project') setFilter('ALL');
              if (huds[item.hud].open && item.id !== 'system') closeHud(item.hud);
              else openHud(item.hud);
            }}
          >
            <span className="glyph">{item.glyph}</span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
