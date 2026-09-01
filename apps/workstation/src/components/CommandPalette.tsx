import { useEffect, useMemo, useState } from 'react';
import { groupPalette, searchPalette, type PaletteItem } from '../services/palette';
import { useUi } from '../store';

interface Props {
  catalog: PaletteItem[];
  onCommand: (item: PaletteItem) => void;
}

export function CommandPalette({ catalog, onCommand }: Props) {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const [q, setQ] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUi.getState().paletteOpen);
      }
      if (e.key === 'Escape' && useUi.getState().paletteOpen) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const grouped = useMemo(() => groupPalette(searchPalette(q, catalog)), [q, catalog]);

  if (!open) return null;
  return (
    <div className="palette-scrim" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <header>COMMAND / SEARCH <small>Ctrl+K</small></header>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="shoulder · REQ-002 · explode · CAD Designer" />
        <div className="palette-body">
          {Object.entries(grouped).map(([kind, items]) => (
            <section key={kind}>
              <h3>{kind}</h3>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onCommand(item);
                    setOpen(false);
                    setQ('');
                  }}
                >
                  <b>{item.label}</b>
                  <small>{item.id}</small>
                </button>
              ))}
            </section>
          ))}
          {Object.keys(grouped).length === 0 && <p className="empty">No matches.</p>}
        </div>
      </div>
    </div>
  );
}
