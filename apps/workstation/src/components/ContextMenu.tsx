import { useUi } from '../store';
import type { ContextAction } from '../services/context';

interface Props {
  actions: ContextAction[];
  onAction: (id: string) => void;
}

export function ContextMenu({ actions, onAction }: Props) {
  const menu = useUi((s) => s.contextMenu);
  const setMenu = useUi((s) => s.setContextMenu);
  if (!menu) return null;
  return (
    <div
      className="ctx-menu"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          className={a.id === 'ask' ? 'ask' : ''}
          title={a.title}
          onClick={() => {
            onAction(a.id);
            setMenu(null);
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
