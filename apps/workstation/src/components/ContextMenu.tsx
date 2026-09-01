import { contextActions, type ContextKind } from '../services/palette';
import { useUi } from '../store';

interface Props {
  kind: ContextKind;
  onAction: (id: string) => void;
}

export function ContextMenu({ kind, onAction }: Props) {
  const menu = useUi((s) => s.contextMenu);
  const setMenu = useUi((s) => s.setContextMenu);
  if (!menu) return null;
  const actions = contextActions(kind === 'none' ? 'part' : kind);
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
