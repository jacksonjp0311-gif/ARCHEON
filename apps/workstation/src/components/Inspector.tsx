import { useUi } from '../store';
import {
  geometryDisplay,
  hasRenderableCad,
  type Analysis,
  type Assembly,
  type Evidence,
  type Feature,
  type Interface,
  type Joint,
  type Mate,
  type Material,
  type Part,
  type Port,
  type Requirement
} from '@archeon/design-protocol';
import { geometryMode } from '@archeon/scene-engine';
import { provenanceTone, type ValueTone } from '../services/tone';

interface Props {
  selectedId: string | null;
  part?: Part;
  assemblies: Assembly[];
  features: Feature[];
  interfaces: Interface[];
  ports: Port[];
  requirements: Requirement[];
  joints: Joint[];
  analyses: Analysis[];
  evidence: Evidence[];
  mates: Mate[];
  materials: Material[];
  revision: string;
}

function Field({ k, v, note, tone }: { k: string; v: string; note?: string; tone?: ValueTone }) {
  const missing = !v || v === 'NOT COMPUTED' || v === 'NOT AVAILABLE' || v === 'UNVERIFIED';
  const cls = missing ? 'muted' : tone ?? 'tone-fact';
  return (
    <div className="insp-row">
      <span>{k}</span>
      <b className={cls.startsWith('tone-') || cls === 'muted' ? cls : `tone-${cls}`}>{v}</b>
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
  joints,
  analyses,
  evidence,
  mates,
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
  const selectedJoint = joints.find((joint) => joint.id === selectedId);
  const selectedFeature = features.find((feature) => feature.id === selectedId);
  const selectedMaterial = materials.find((material) => material.id === selectedId);
  const selectedAnalysis = analyses.find((analysis) => analysis.id === selectedId);
  const selectedEvidence = evidence.find((item) => item.id === selectedId);
  const selectedMate = mates.find((mate) => mate.id === selectedId);

  if (!selectedId || (!part && !assembly && !requirement && !iface && !selectedJoint && !selectedFeature && !selectedMaterial && !selectedAnalysis && !selectedEvidence && !selectedMate)) {
    return (
      <section className="rail-panel inspector">
        <h2>CAD PART INSPECTOR <button type="button" onClick={clear}>×</button></h2>
        <p className="empty">No active selection.<br />Select geometry or choose an item from the navigator.</p>
      </section>
    );
  }

  if (selectedFeature) {
    return (
      <section className="rail-panel inspector">
        <h2>FEATURE INSPECTOR <button type="button" onClick={clear}>×</button></h2>
        <Field k="ID" v={selectedFeature.id} />
        <Field k="KIND" v={selectedFeature.kind} />
        <Field k="ROLE" v={selectedFeature.semantic_role || '—'} />
        <Field k="HOST" v={selectedFeature.frame.host ?? selectedFeature.part} />
        <Field k="DATUM" v={selectedFeature.frame.datum_id ?? 'NONE'} />
        <Field k="ORIGIN" v={selectedFeature.frame.origin_m.join(', ')} note="meters · part local" />
        <Field k="RPY" v={selectedFeature.frame.rpy_rad.join(', ')} note="radians" />
        <Field k="AXIS" v={selectedFeature.frame.axis.join(', ')} note="right-handed · Z-up · X-forward" />
        <Field k="PROVENANCE" v={selectedFeature.provenance.class} />
      </section>
    );
  }

  if (selectedMate) {
    return (
      <section className="rail-panel inspector">
        <h2>MATE INSPECTOR <button type="button" onClick={clear}>×</button></h2>
        <Field k="ID" v={selectedMate.id} />
        <Field k="KIND" v={selectedMate.kind} />
        <Field k="STATE" v={selectedMate.state} />
        <Field k="INTERFACE" v={selectedMate.interface} />
        <Field k="OFFSET" v={`${selectedMate.offset_m} m`} />
        <Field k="PROVENANCE" v={selectedMate.provenance.class} />
      </section>
    );
  }

  if (selectedMaterial) {
    return (
      <section className="rail-panel inspector">
        <h2>MATERIAL INSPECTOR <button type="button" onClick={clear}>×</button></h2>
        <Field k="ID" v={selectedMaterial.id} />
        <Field k="NAME" v={selectedMaterial.name} />
        <Field k="DENSITY" v={selectedMaterial.density_kg_m3 != null ? `${selectedMaterial.density_kg_m3} kg/m³` : 'UNVERIFIED'} />
        <Field k="APPEARANCE" v={selectedMaterial.appearance || '—'} />
        <Field k="NOTES" v={selectedMaterial.notes || '—'} />
      </section>
    );
  }

  if (selectedAnalysis || selectedEvidence) {
    return (
      <section className="rail-panel inspector">
        <h2>{selectedAnalysis ? 'ANALYSIS' : 'EVIDENCE'} INSPECTOR <button type="button" onClick={clear}>×</button></h2>
        <Field k="ID" v={(selectedAnalysis ?? selectedEvidence)!.id} />
        <Field k="KIND" v={(selectedAnalysis ?? selectedEvidence)!.kind} />
        {selectedAnalysis && <Field k="STATUS" v={selectedAnalysis.status || 'UNVERIFIED'} />}
        <Field k="DETAIL" v={selectedAnalysis?.notes ?? selectedEvidence?.text ?? '—'} />
        <Field k="PROVENANCE" v={(selectedAnalysis ?? selectedEvidence)!.provenance.class} />
      </section>
    );
  }

  if (selectedJoint) {
    return (
      <section className="rail-panel inspector">
        <h2>JOINT INSPECTOR <button type="button" onClick={clear} title="Deselect">×</button></h2>
        <Field k="ID" v={selectedJoint.id} />
        <Field k="NAME" v={selectedJoint.name} />
        <Field k="TYPE" v={selectedJoint.joint_type} />
        <Field k="DOF" v={String(selectedJoint.dof)} />
        <Field k="PARENT" v={selectedJoint.parent} />
        <Field k="CHILD" v={selectedJoint.child} />
        <Field k="AXIS" v={selectedJoint.axis.join(', ')} note="right-handed · Z-up · X-forward" />
        <Field k="LIMITS" v={selectedJoint.limits ? `${selectedJoint.limits.lower}…${selectedJoint.limits.upper} ${selectedJoint.limits.unit}` : 'UNVERIFIED'} />
        <Field k="ROTATING GROUP" v={selectedJoint.rotating_group.join(', ') || 'NONE'} />
        <Field k="LOAD PATH" v={selectedJoint.load_path.join(' → ') || 'UNVERIFIED'} />
        <Field k="INTERFACES" v={selectedJoint.interfaces.join(', ') || 'NONE'} />
        <Field k="PROVENANCE" v={selectedJoint.provenance.class} />
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
  const relatedJoints = joints.filter((joint) =>
    joint.parent === part.parent || joint.child === part.parent || joint.rotating_group.includes(part.id) || joint.load_path.includes(part.id)
  );
  const parentName = assemblies.find((a) => a.id === part.parent)?.name ?? part.parent ?? '—';
  const display = geometryDisplay(part.spatial.cad, geometryMode(hasRenderableCad(part.spatial.cad), debug));

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
      <Field k="PARENT" v={parentName} tone="fact" />
      <Field k="ROLE" v={part.semantic_role || '—'} tone="id" />
      <Field k="MATERIAL" v={mat?.name ?? part.material ?? 'UNVERIFIED'} tone="fact" />
      {([
        ['SUMMARY', 'Summary'],
        ['GEOMETRY', 'Geometry'],
        ['JOINT', 'Joint'],
        ['CONNECTIONS', 'Connections'],
        ['FEATURES', 'Features'],
        ['REQUIREMENTS', 'Requirements'],
        ['ANALYSIS', 'Analysis'],
        ['PROVENANCE', 'Provenance'],
        ['HISTORY', 'History']
      ] as const).map(([key, label]) => (
        <div key={key}>
          <button
            type="button"
            className={`insp-acc ${key === 'PROVENANCE' || key === 'ANALYSIS' || key === 'CONNECTIONS' ? 'insp-acc--intel' : ''}`}
            onClick={() => toggleInspect(key)}
          >
            {inspectOpen[key] ? '▾' : '▸'} {label}
          </button>
          {inspectOpen[key] && key === 'GEOMETRY' && (
            <>
              <Field k="PN / ID" v={part.id} tone="id" />
              <Field
                k="DISPLAY"
                v={display}
                note="CAD and primitive are exclusive — never both"
                tone={display === 'GENERATED PREVIEW' || display === 'SEMANTIC ONLY' ? 'prov' : 'fact'}
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
              <Field k="GEOMETRY CLASS" v={part.spatial.cad?.geometry_class ?? 'PRIMITIVE_FALLBACK'} />
              <Field k="CAD TRUTH" v={part.spatial.cad?.truth ?? 'GENERATED'} tone={provenanceTone(part.spatial.cad?.truth ?? 'GENERATED')} />
              <Field k="CAD SOURCE" v={part.spatial.cad?.source ?? '—'} tone={provenanceTone(part.spatial.cad?.source ?? '')} />
            </>
          )}
          {inspectOpen[key] && key === 'SUMMARY' && (
            <>
              <Field k="ROLE" v={part.semantic_role || '—'} />
              <Field k="PARENT" v={parentName} />
              <Field k="STATUS" v={part.provenance.class} />
            </>
          )}
          {inspectOpen[key] && key === 'JOINT' && (
            <>
              <Field k="COUNT" v={String(relatedJoints.length)} />
              <Field k="JOINTS" v={relatedJoints.map((joint) => joint.id).join(', ') || 'NONE'} />
            </>
          )}
          {inspectOpen[key] && key === 'CONNECTIONS' && (
            <>
              <Field k="PORTS" v={String(portN)} />
              <Field k="INTERFACES" v={String(relatedIfaces.length)} />
            </>
          )}
          {inspectOpen[key] && key === 'REQUIREMENTS' && (
            <Field k="LINKED" v={linkedReqs.map((r) => r.id).join(', ') || 'NONE'} tone="id" />
          )}
          {inspectOpen[key] && key === 'FEATURES' && (
            <Field k="FEATURES" v={features.filter((feature) => feature.part === part.id).map((feature) => feature.id).join(', ') || 'NONE'} />
          )}
          {inspectOpen[key] && key === 'ANALYSIS' && (
            <>
              <Field k="VALIDATION" v="GRAPH + CONTRACTS" note="not FEA · collision NOT CHECKED" tone="graph" />
              <Field k="RECORDS" v={analyses.map((analysis) => `${analysis.kind}:${analysis.status}`).join(', ') || 'NONE'} />
            </>
          )}
          {inspectOpen[key] && key === 'PROVENANCE' && (
            <>
              <Field k="CLASS" v={part.provenance.class} tone={provenanceTone(part.provenance.class)} />
              <Field k="CREATED BY" v={part.provenance.created_by} tone="agent" />
              <Field k="REASON" v={part.provenance.reason || '—'} tone="fact" />
              <Field k="AGENT" v={part.provenance.agent_id ?? '—'} tone="agent" />
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
