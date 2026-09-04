import { useUi, type RenderDebug } from '../store';

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
  geometrySummary?: string;
}

const DEBUG_TOGGLES: { key: keyof RenderDebug; label: string }[] = [
  { key: 'edges', label: 'EDGES' },
  { key: 'grid', label: 'GRID' },
  { key: 'trails', label: 'TRAILS' },
  { key: 'interfaces', label: 'INTERFACES' },
  { key: 'datums', label: 'DATUMS' },
  { key: 'cadMeshes', label: 'CAD MESHES' },
  { key: 'primitives', label: 'PRIMITIVES' },
  { key: 'shadows', label: 'SHADOWS' }
];

function fmtSize(s: [number, number, number]): string {
  return `${s[0].toFixed(3)} × ${s[1].toFixed(3)} × ${s[2].toFixed(3)} m`;
}

export function HealthHud(props: Props) {
  const ok = props.connected && (props.errorCount ?? 0) === 0;
  const debug = useUi((s) => s.renderDebug);
  const stats = useUi((s) => s.renderStats);
  const overlays = useUi((s) => s.overlays);
  const toggle = useUi((s) => s.toggleRenderDebug);
  const activeOverlays = (Object.keys(overlays) as (keyof typeof overlays)[])
    .filter((k) => overlays[k])
    .join(', ');
  return (
    <div className="health-body">
      <div className={ok ? 'ok' : 'warn'}>{ok ? 'GRAPH OK · API' : 'CHECK SYSTEM'}</div>
      <p>Version {props.version}</p>
      <p>Revision {props.revision ?? '—'} · branch {props.branch ?? 'main'}</p>
      <p>Kernel {props.kernel ?? '—'} {props.build123d ? '(build123d)' : '(primitive / optional OCCT)'}</p>
      <p>Memory LOCAL · Agents 11 · Reach {props.reachMm} mm DERIVED</p>
      <p>Provider {props.provider ?? 'local'}</p>
      <p className="notes">{props.cadNote || 'CAD truth: viewport is a spatial projection, not manufacturing BREP.'}</p>
      <p>Geometry truth {props.geometrySummary ?? 'PRIMITIVE_FALLBACK'}</p>
      <p>World frame RIGHT_HANDED · Z-UP · X-FORWARD · m</p>
      <div className="health-diag">
        <h3>RENDER DIAGNOSTICS</h3>
        <p>Visible parts {stats.visibleParts}</p>
        <p>CAD meshes {stats.cadMeshes} · primitive fallbacks {stats.primitiveFallbacks}</p>
        <p>Draw calls {stats.drawCalls} · triangles {stats.triangles}</p>
        <p>Edges {stats.edgesEnabled ? 'ON' : 'OFF'}</p>
        <p>Active overlays {activeOverlays || 'none'}</p>
        <p>Scene bounds {fmtSize(stats.sceneSize)}</p>
        <p>Largest {stats.largestId ?? '—'} {fmtSize(stats.largestSize)}</p>
        <p>Geometry revision {stats.geomRev}</p>
        <p className="notes">Debug gates isolate render layers. They are not product chrome.</p>
        <div className="debug-toggles">
          {DEBUG_TOGGLES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={debug[t.key] ? 'on' : ''}
              onClick={() => toggle(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
