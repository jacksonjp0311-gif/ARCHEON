import { useUi } from '../store';

const ITEMS: { id: string; label: string; angle: number }[] = [
  { id: 'focus', label: 'FOCUS', angle: -90 },
  { id: 'isolate', label: 'ISOLATE', angle: -140 },
  { id: 'explode', label: 'EXPLODE', angle: -40 },
  { id: 'xray', label: 'XRAY', angle: 180 },
  { id: 'measure', label: 'MEASURE', angle: 0 },
  { id: 'track', label: 'TRACK', angle: 140 },
  { id: 'section', label: 'SECTION', angle: 40 },
  { id: 'ask', label: 'ASK ◈', angle: 90 }
];

interface Props {
  onAction: (id: string) => void;
}

export function RadialMenu({ onAction }: Props) {
  const open = useUi((s) => s.radialOpen);
  const setOpen = useUi((s) => s.setRadialOpen);
  if (!open) return null;
  const r = 92;
  return (
    <div className="radial" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className="radial__core" onClick={() => setOpen(false)}>◈</button>
      {ITEMS.map((it) => {
        const rad = (it.angle * Math.PI) / 180;
        const x = Math.cos(rad) * r;
        const y = Math.sin(rad) * r;
        return (
          <button
            key={it.id}
            type="button"
            className={`radial__item ${it.id === 'ask' ? 'ask' : ''}`}
            style={{ transform: `translate(${x}px, ${y}px)` }}
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
