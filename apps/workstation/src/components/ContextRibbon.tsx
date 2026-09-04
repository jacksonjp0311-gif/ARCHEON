import type { ContextAction } from '../services/context';

interface Props {
  name?: string;
  actions: ContextAction[];
  onAction: (id: string) => void;
}

export function ContextRibbon({ name, actions, onAction }: Props) {
  return (
    <div className="context-ribbon">
      <div className="context-ribbon__who">
        <span>{name ?? 'NO SELECTION'}</span>
      </div>
      <div className="context-ribbon__acts">
        {actions.map((a) => (
          <button key={a.id} type="button" className={a.id === 'ask' ? 'ask' : ''} title={a.title} onClick={() => onAction(a.id)}>{a.label}</button>
        ))}
      </div>
    </div>
  );
}
