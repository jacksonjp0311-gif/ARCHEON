import { primaryActions, type ContextAction } from '../services/context';

interface Props {
  name?: string;
  actions: ContextAction[];
  summary?: { action: string; why: string; validation: string } | null;
  onAction: (id: string) => void;
}

export function ObjectHud({ name, actions, summary, onAction }: Props) {
  const visible = primaryActions(actions, 6);
  if (!visible.length && !name) return null;
  return (
    <div className="object-hud" aria-label="object actions">
      {name && <span className="object-hud__name">{name}</span>}
      {visible.map((a) => (
        <button key={a.id} type="button" className={a.ask ? 'ask' : ''} title={a.title} onClick={() => onAction(a.id)}>
          {a.label}
        </button>
      ))}
      {summary && (
        <div className="reason-card">
          <b>{summary.action}</b>
          <small>{summary.why}</small>
          <i>{summary.validation}</i>
        </div>
      )}
    </div>
  );
}
