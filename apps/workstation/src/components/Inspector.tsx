import { useUi } from '../store';
import { geometryDisplay, type Part, type Requirement } from '@archeon/design-protocol';
import { geometryMode } from '@archeon/scene-engine';

interface Assembly {
  id: string;
  name: string;
  parent: string | null;
  semantic_role: string;
}

interface Iface {
  id: string;
  a: string;
  b: string;
  name: string;
  kind?: string;
  semantic_role?: string;
}

interface Props {
  selectedId: string | null;
  part?: Part;
  assemblies: Assembly[];
  features: { id: string; part: string; kind?: string }[];
  interfaces: Iface[];
  ports: { id: string; host: string }[];
  requirements: Requirement[];
  materials: { id: string; name: string; density_kg_m3: number | null }[];
  revision: string;
}

function Field({ k, v, note }: { k: string; v: string; note?: string }) {
  const missing = !v || v === 'NOT COMPUTED' || v === 'NOT AVAILABLE' || v === 'UNVERIFIED' || v === 'GRAPH ONLY';
  return (
    <div className="insp-row">
      <span>{k}</span>
      <b className={missing ? 'muted' : ''}>{v}</b>
      {note && <i>{note}</i>}
    </div>
  );
}

export function Inspector({
  selectedId,
  part,
  assemblies,
  features,
  interfaces,
  ports,
  requirements,
  materials,
  revision
}: Props) {
  const clear = useUi((s) => s.clearSelection);
  const setSelected = useUi((s) => s.setSelected);
  const setIsolate = useUi((s) => s.setIsolate);
  const setView = useUi((s) => s.setView);
  const setGhost = useUi((s) => s.setGhostOthers);
  const setFocus = useUi((s) => s.setFocusId);
  const track = useUi((s) => s.track);
  const inspectOpen = useUi((s) => s.inspectOpen);
  const toggleInspect = useUi((s) => s.toggleInspect);
  const debug = useUi((s) => s.renderDebug);

  const assembly = assemblies.find((a) => a.id === selectedId);
  const requirement = requirements.find((r) => r.id === selectedId);
  const iface = interfaces.find((i) => i.id === selectedId);

  if (!selectedId || (!part && !assembly && !requirement && !iface)) {
    return (
      <section className="rail-panel inspector">
        <h2>CAD PART INSPECTOR <button type="button" onClick={clear}>×</button></h2>
        <p className="empty">No active selection.<br />Select geometry or choose an item from the navigator.</p>
      </section>
    );
  }

  if (requirement) {
    return (
      <section className="rail-panel inspector">
        <h2>REQUIREMENT <button type="button" onClick={clear} title="Deselect">×</button></h2>
        <Field k="ID" v={requirement.id} />
        <Field k="TEXT" v={requirement.text} />
        <Field k="QUANTITY" v={requirement.quantity ?? 'NOT AVAILABLE'} />
        <Field k="VALUE" v={requirement.value != null ? `${requirement.value} ${requirement.unit ?? ''}` : 'NOT AVAILABLE'} />
        <Field k="SATISFIED" v={requirement.satisfied == null ? 'UNVERIFIED' : requirement.satisfied ? 'YES' : 'NO'} />
        <Field k="PROVENANCE" v={requirement.provenance.class} />
        <Field k="ACCEPTANCE" v={requirement.acceptance || 'NOT AVAILABLE'} />
        <div className="insp-actions">
          <button type="button" onClick={() => track(requirement.id)}>TRACK</button>
        </div>
      </section>
    );
  }

  if (iface) {
    const aHost = ports.find((p) => p.id === iface.a)?.host ?? iface.a;
    const bHost = ports.find((p) => p.id === iface.b)?.host ?? iface.b;
    return (
      <section className="rail-panel inspector">
        <h2>INTERFACE <button type="button" onClick={clear} title="Deselect">×</button></h2>
        <Field k="ID" v={iface.id} />
        <Field k="NAME" v={iface.name} />
        <Field k="KIND" v={iface.kind ?? '—'} />
        <Field k="ROLE" v={iface.semantic_role ?? '—'} />
        <Field k="A" v={aHost} />
        <Field k="B" v={bHost} />
        <div className="insp-actions">
          <button type="button" onClick={() => setSelected(aHost)}>FOCUS A</button>
          <button type="button" onClick={() => setSelected(bHost)}>FOCUS B</button>
          <button type="button" onClick={() => track(iface.id)}>TRACK</button>
        </div>
      </section>
    );
  }

  if (assembly && !part) {
    const children = assemblies.filter((a) => a.parent === assembly.id);
    return (
      <section className="rail-panel inspector">
        <h2>ASSEMBLY INSPECTOR <button type="button" onClick={clear} title="Deselect">×</button></h2>
        <Field k="ID" v={assembly.id} />
        <Field k="NAME" v={assembly.name} />
        <Field k="PARENT" v={assemblies.find((a) => a.id === assembly.parent)?.name ?? assembly.parent ?? '—'} />
        <Field k="SEMANTIC ROLE" v={assembly.semantic_role || '—'} />
        <Field k="REVISION" v={revision} />
        <Field k="CHILD ASSEMBLIES" v={String(children.length)} />
        <Field k="MASS" v="NOT COMPUTED" note="kernel mass properties not on the UI clock" />
        <Field k="CENTER OF MASS" v="NOT COMPUTED" />
        <div className="insp-actions">
          <button type="button" onClick={() => { setFocus(assembly.id); setGhost(true); }}>FOCUS</button>
          <button type="button" onClick={() => setIsolate(assembly.id)}>ISOLATE</button>
          <button type="button" onClick={() => { useUi.getState().setStrategy('SYSTEM'); useUi.getState().dispatch({ op: 'explode_entity', entity_id: assembly.id, factor: 0.85 }); }}>EXPLODE</button>
          <button type="button" onClick={() => setView('X_RAY')}>X-RAY</button>
          <button type="button" onClick={() => setGhost(true)}>GHOST</button>
          <button type="button" onClick={() => track(assembly.id)}>TRACK</button>
        </div>
      </section>
    );
  }

  if (!part) {
    return (
      <section className="rail-panel inspector">
        <h2>CAD PART INSPECTOR <button type="button" onClick={clear}>×</button></h2>
        <p className="empty">NO ACTIVE SELECTION</p>
      </section>
    );
  }

  const mat = materials.find((m) => m.id === part.material);
  const prim = part.spatial.primitive;
  const bbox = prim.kind === 'box'
    ? `${prim.sx.toFixed(3)} × ${prim.sy.toFixed(3)} × ${prim.sz.toFixed(3)} m`
    : `⌀ ${(prim.radius * 2).toFixed(3)} × ${prim.height.toFixed(3)} m`;
  const volume = prim.kind === 'box'
    ? prim.sx * prim.sy * prim.sz
    : Math.PI * prim.radius * prim.radius * prim.height;
  const dens = mat?.density_kg_m3 ?? null;
  const mass = dens != null ? volume * dens : null;
  const featN = features.filter((f) => f.part === part.id).length;
  const portN = ports.filter((p) => p.host === part.id).length;
  const relatedIfaces = interfaces.filter((i) => {
    const pa = ports.find((p) => p.id === i.a);
    const pb = ports.find((p) => p.id === i.b);
    return pa?.host === part.id || pb?.host === part.id;
  });
  const linkedReqs = requirements.filter((r) => part.provenance.requirement_ids.includes(r.id));
  const parentName = assemblies.find((a) => a.id === part.parent)?.name ?? part.parent ?? '—';

  return (
    <section className="rail-panel inspector">
      <h2>CAD PART INSPECTOR <button type="button" onClick={clear} title="Deselect">×</button></h2>
      <div className="insp-name">
        <strong>{part.name}</strong>
        <small>{part.id}</small>
      </div>
      <div className="insp-summary">
        {mat?.name ?? part.material ?? 'UNVERIFIED'} · {relatedIfaces.length} interfaces · {featN} features · GRAPH ONLY
      </div>
      <Field k="PARENT" v={parentName} />
      <Field k="ROLE" v={part.semantic_role || '—'} />
      <Field k="MATERIAL" v={mat?.name ?? part.material ?? 'UNVERIFIED'} />
      {([
        ['GEOMETRY', 'Geometry'],
        ['CONNECTIONS', 'Connections'],
        ['REQUIREMENTS', 'Requirements'],
        ['ANALYSIS', 'Analysis'],
        ['PROVENANCE', 'Provenance'],
        ['HISTORY', 'History']
      ] as const).map(([key, label]) => (
        <div key={key}>
          <button type="button" className="insp-acc" onClick={() => toggleInspect(key)}>
            {inspectOpen[key] ? '▾' : '▸'} {label}
          </button>
          {inspectOpen[key] && key === 'GEOMETRY' && (
            <>
              <Field k="PN / ID" v={part.id} />
              <Field
                k="DISPLAY"
                v={geometryDisplay(part.spatial.cad, geometryMode(!!(part.spatial.cad?.preview || part.spatial.cad?.path), debug))}
                note="CAD and primitive are exclusive — never both"
              />
              <Field k="CAD FRAME" v={part.spatial.cad?.coordinate_frame ?? 'CAD_LOCAL'} note="viewer does not recenter or Y-up rotate meshes" />
              <Field k="UP AXIS" v={part.spatial.cad?.up_axis ?? 'Z'} note="ARCHEON world is Z-UP" />
              <Field k="HANDEDNESS" v={part.spatial.cad?.handedness ?? 'RIGHT_HANDED'} />
              <Field k="CAD UNITS" v={part.spatial.cad?.units ?? 'm'} />
              <Field k="BBOX" v={bbox} note="DERIVED from DesignIR primitive — not BREP" />
              <Field k="VOLUME" v={`${volume.toExponential(3)} m³`} note="DERIVED from primitive envelope" />
              <Field k="MASS" v={mass != null ? `${mass.toFixed(3)} kg` : 'NOT COMPUTED'} note={mass != null ? 'HEURISTIC · density × primitive volume' : 'no density'} />
              <Field k="CENTER OF MASS" v="NOT COMPUTED" />
              <Field k="CAD FORMAT" v={part.spatial.cad?.format?.toUpperCase() ?? 'PRIMITIVE'} />
              <Field k="CAD TRUTH" v={part.spatial.cad?.truth ?? 'GENERATED'} />
              <Field k="CAD SOURCE" v={part.spatial.cad?.source ?? '—'} />
            </>
          )}
          {inspectOpen[key] && key === 'CONNECTIONS' && (
            <>
              <Field k="PORTS" v={String(portN)} />
              <Field k="INTERFACES" v={String(relatedIfaces.length)} />
            </>
          )}
          {inspectOpen[key] && key === 'REQUIREMENTS' && (
            <Field k="LINKED" v={linkedReqs.map((r) => r.id).join(', ') || 'NONE'} />
          )}
          {inspectOpen[key] && key === 'ANALYSIS' && (
            <Field k="VALIDATION" v="GRAPH ONLY" note="not FEA · collision NOT CHECKED" />
          )}
          {inspectOpen[key] && key === 'PROVENANCE' && (
            <>
              <Field k="CLASS" v={part.provenance.class} />
              <Field k="CREATED BY" v={part.provenance.created_by} />
              <Field k="REASON" v={part.provenance.reason || '—'} />
              <Field k="AGENT" v={part.provenance.agent_id ?? '—'} />
            </>
          )}
          {inspectOpen[key] && key === 'HISTORY' && (
            <Field k="REVISION" v={part.provenance.revision_id || revision} />
          )}
        </div>
      ))}

      <div className="insp-counts">
        <span>FEATURES {featN}</span>
        <span>PORTS {portN}</span>
        <span>INTERFACES {relatedIfaces.length}</span>
        <span>REQUIREMENTS {linkedReqs.length}</span>
        <span>ANALYSES 0</span>
        <span>EVIDENCE {part.provenance.evidence_ids.length}</span>
      </div>

      {relatedIfaces.length > 0 && (
        <div className="insp-rels">
          {relatedIfaces.map((i) => {
            const pa = ports.find((p) => p.id === i.a)?.host;
            const pb = ports.find((p) => p.id === i.b)?.host;
            const other = pa === part.id ? pb : pa;
            return (
              <button key={i.id} type="button" onClick={() => other && setSelected(other)}>
                {i.name} → {other}
              </button>
            );
          })}
        </div>
      )}
      {linkedReqs.length > 0 && (
        <div className="insp-rels">
          {linkedReqs.map((r) => (
            <button key={r.id} type="button" onClick={() => setSelected(r.id)}>{r.id}</button>
          ))}
        </div>
      )}

      <div className="insp-actions">
        <button type="button" onClick={() => { setFocus(part.id); setGhost(true); }}>FOCUS</button>
        <button type="button" onClick={() => setIsolate(part.id)}>ISOLATE</button>
        <button type="button" onClick={() => {
          const scope = part.parent ?? part.id;
          useUi.getState().setStrategy('SYSTEM');
          useUi.getState().dispatch({ op: 'explode_entity', entity_id: scope, factor: 0.85 });
        }}>EXPLODE</button>
        <button type="button" onClick={() => setView('X_RAY')}>X-RAY</button>
        <button type="button" onClick={() => setGhost(true)}>GHOST</button>
        <button type="button" onClick={() => track(part.id)}>TRACK</button>
      </div>
    </section>
  );
}
