import { useUi } from '../store';
import type { ContextAction } from '../services/context';

interface Props {
  actions: ContextAction[];
  onAction: (id: string) => void;
}

export function RadialMenu({ actions, onAction }: Props) {
  const open = useUi((s) => s.radialOpen);
  const setOpen = useUi((s) => s.setRadialOpen);
  if (!open) return null;
  const items = actions.slice(0, 8);
  const r = 92;
  return (
    <div className="radial" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className="radial__core" onClick={() => setOpen(false)}>◈</button>
      {items.map((it, i) => {
        const angle = -90 + (360 / Math.max(items.length, 1)) * i;
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * r;
        const y = Math.sin(rad) * r;
        return (
          <button
            key={it.id}
            type="button"
            className={`radial__item ${it.ask ? 'ask' : ''}`}
            style={{ transform: `translate(${x}px, ${y}px)` }}
            title={it.title}
            onClick={() => {
              onAction(it.id);
              setOpen(false);
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
