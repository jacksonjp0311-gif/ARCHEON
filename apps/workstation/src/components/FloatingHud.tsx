import { useRef } from 'react';
import { useUi } from '../store';
import type { HudId } from '../services/hudManager';

interface Props {
  id: HudId;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}

export function FloatingHud({ id, title, children, wide }: Props) {
  const geom = useUi((s) => s.huds[id]);
  const patch = useUi((s) => s.patchHud);
  const close = useUi((s) => s.closeHud);
  const pin = useUi((s) => s.pinHud);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  if (!geom?.open) return null;

  const style: React.CSSProperties = {
    width: geom.w,
    height: geom.collapsed ? undefined : geom.h,
    ...(geom.x < 0 ? { right: 12, left: 'auto' } : { left: geom.x }),
    ...(geom.y < 0 ? { bottom: 44, top: 'auto' } : { top: geom.y })
  };

  return (
    <div
      ref={panel}
      className={`float-hud ${wide ? 'float-hud--wide' : ''} ${geom.pinned ? 'is-pinned' : ''}`}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header
        className="float-hud__title"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          const rect = panel.current?.getBoundingClientRect();
          const parent = panel.current?.offsetParent?.getBoundingClientRect();
          const x = rect && parent ? rect.left - parent.left : geom.x;
          const y = rect && parent ? rect.top - parent.top : geom.y;
          if (geom.x < 0 || geom.y < 0) patch(id, { x, y });
          drag.current = { dx: e.clientX - x, dy: e.clientY - y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          patch(id, { x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
        }}
        onPointerUp={() => { drag.current = null; }}
      >
        <span>{title}</span>
        <button type="button" className={geom.pinned ? 'active' : ''} title="Pin" onClick={() => pin(id, !geom.pinned)}>⊞</button>
        <button type="button" title="Collapse" onClick={() => patch(id, { collapsed: !geom.collapsed })}>{geom.collapsed ? '▢' : '—'}</button>
        <button type="button" title="Close" onClick={() => close(id)}>×</button>
      </header>
      {!geom.collapsed && <div className="float-hud__body">{children}</div>}
      {!geom.collapsed && (
        <div
          className="agent-hud__resize"
          onPointerDown={(e) => {
            e.stopPropagation();
            const start = { x: e.clientX, y: e.clientY, w: geom.w, h: geom.h };
            function move(ev: PointerEvent) {
              patch(id, {
                w: Math.min(wide ? 720 : 560, Math.max(240, start.w + ev.clientX - start.x)),
                h: Math.min(720, Math.max(140, start.h + ev.clientY - start.y))
              });
            }
            function up() {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            }
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
        />
      )}
    </div>
  );
}
