import { useRef } from 'react';
import { useUi } from '../store';
import { clampHud, type HudId } from '../services/hudManager';

interface Props {
  id: HudId;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
  workspace?: boolean;
  morph?: boolean;
}

export function HudShell({ id, title, children, className, wide, workspace, morph }: Props) {
  const geom = useUi((s) => s.huds[id]);
  const patch = useUi((s) => s.patchHud);
  const close = useUi((s) => s.closeHud);
  const pin = useUi((s) => s.pinHud);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  if (!geom?.open) return null;

  const style: React.CSSProperties = {
    width: workspace ? Math.max(820, geom.w) : geom.w,
    height: geom.collapsed ? undefined : workspace ? Math.max(560, geom.h) : geom.h,
    maxWidth: 'calc(100% - 24px)',
    maxHeight: 'calc(100% - 56px)',
    ...(geom.x < 0 ? { right: 12, left: 'auto' } : { left: geom.x }),
    ...(geom.y < 0 ? { bottom: 44, top: 'auto' } : { top: geom.y })
  };

  function clampPatch(next: { x?: number; y?: number; w?: number; h?: number }) {
    const parent = panel.current?.offsetParent as HTMLElement | null;
    const vw = parent?.clientWidth ?? window.innerWidth;
    const vh = parent?.clientHeight ?? window.innerHeight;
    const merged = clampHud({ ...geom, ...next }, vw, vh, geom.pinned);
    patch(id, merged);
  }

  return (
    <div
      ref={panel}
      className={`${className ?? 'float-hud'} ${wide ? 'float-hud--wide' : ''} ${workspace ? 'float-hud--workspace' : ''} ${geom.pinned ? 'is-pinned' : ''} ${morph ? 'is-open' : ''} ${geom.collapsed ? 'is-collapsed' : ''}`}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header
        className={className?.includes('agent') ? 'agent-hud__title' : 'float-hud__title'}
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
          clampPatch({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <span>{title}</span>
        <button type="button" className={geom.pinned ? 'active' : ''} title="Pin" onClick={() => pin(id, !geom.pinned)}>
          ⊞
        </button>
        <button type="button" title="Collapse" onClick={() => patch(id, { collapsed: !geom.collapsed })}>
          {geom.collapsed ? '▢' : '—'}
        </button>
        <button type="button" title="Close" onClick={() => close(id)}>
          ×
        </button>
      </header>
      {!geom.collapsed && <div className={className?.includes('agent') ? 'agent-hud__body-wrap' : 'float-hud__body'}>{children}</div>}
      {!geom.collapsed && (
        <div
          className="agent-hud__resize"
          onPointerDown={(e) => {
            e.stopPropagation();
            const start = { x: e.clientX, y: e.clientY, w: geom.w, h: geom.h };
            function move(ev: PointerEvent) {
              clampPatch({
                w: Math.min(workspace ? 1180 : wide ? 960 : 560, Math.max(workspace ? 760 : 240, start.w + ev.clientX - start.x)),
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
