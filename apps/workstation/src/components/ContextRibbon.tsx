import { contextActions, type ContextKind } from '../services/palette';

interface Props {
  kind: ContextKind;
  name?: string;
  onAction: (id: string) => void;
}

export function ContextRibbon({ kind, name, onAction }: Props) {
  const actions = contextActions(kind);
  return (
    <div className="context-ribbon">
      <div className="context-ribbon__who">
        <span>{kind === 'none' ? 'NO SELECTION' : name ?? kind.toUpperCase()}</span>
      </div>
      <div className="context-ribbon__acts">
        {actions.map((a) => (
          <button key={a.id} type="button" className={a.id === 'ask' ? 'ask' : ''} title={a.title} onClick={() => onAction(a.id)}>{a.label}</button>
        ))}
      </div>
    </div>
  );
}
