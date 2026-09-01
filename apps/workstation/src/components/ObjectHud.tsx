import { objectHudActions, type ContextKind } from '../services/palette';

interface Props {
  kind: ContextKind;
  name?: string;
  onAction: (id: string) => void;
}

export function ObjectHud({ kind, name, onAction }: Props) {
  const actions = objectHudActions(kind);
  if (!actions.length) return null;
  return (
    <div className="object-hud" aria-label="object actions">
      {name && <span className="object-hud__name">{name}</span>}
      {actions.map((a) => (
        <button key={a.id} type="button" className={a.id === 'ask' ? 'ask' : ''} onClick={() => onAction(a.id)}>{a.label}</button>
      ))}
    </div>
  );
}
