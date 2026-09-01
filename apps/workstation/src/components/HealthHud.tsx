interface Props {
  version: string;
  revision?: string;
  branch?: string;
  kernel?: string;
  build123d?: boolean;
  connected: boolean;
  reachMm: string | number;
  errorCount?: number;
  provider?: string;
  cadNote?: string;
}

export function HealthHud(props: Props) {
  const ok = props.connected && (props.errorCount ?? 0) === 0;
  return (
    <div className="health-body">
      <div className={ok ? 'ok' : 'warn'}>{ok ? 'GRAPH OK · API' : 'CHECK SYSTEM'}</div>
      <p>Version {props.version}</p>
      <p>Revision {props.revision ?? '—'} · branch {props.branch ?? 'main'}</p>
      <p>Kernel {props.kernel ?? '—'} {props.build123d ? '(build123d)' : '(primitive / optional OCCT)'}</p>
      <p>Memory LOCAL · Agents 11 · Reach {props.reachMm} mm DERIVED</p>
      <p>Provider {props.provider ?? 'local'}</p>
      <p className="notes">{props.cadNote || 'CAD truth: viewport is a spatial projection, not manufacturing BREP.'}</p>
    </div>
  );
}
