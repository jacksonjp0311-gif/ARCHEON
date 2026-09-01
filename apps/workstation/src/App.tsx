import { useEffect, useState } from 'react';
import { VIEW_MODES, DOCK_TABS, WORKSTATION_MODES, type ViewMode, type WorkstationMode } from '@archeon/spatial-grammar';
import { neighborhoodOf, type Part, type Requirement } from '@archeon/design-protocol';
import type { SpreadPreset } from '@archeon/scene-engine';
import { ArmScene } from './scene/ArmScene';
import { AgentHud } from './components/AgentHud';
import { Inspector } from './components/Inspector';
import { ItemTracker } from './components/ItemTracker';
import { Navigator } from './components/Navigator';
import { getJson, postJson } from './api';
import { useUi } from './store';
import { ARCHEON_PRODUCT, ARCHEON_VERSION } from './version';

interface DesignDoc {
  project: { id: string; name: string; revision_id: string; branch: string; kernel: string };
  parts: Part[];
  assemblies: { id: string; name: string; parent: string | null; semantic_role: string }[];
  features: { id: string; part: string; kind: string; semantic_role: string }[];
  interfaces: { id: string; name: string; kind: string; a: string; b: string; semantic_role: string }[];
  ports: { id: string; host: string; role: string; origin_m: [number, number, number] }[];
  requirements: Requirement[];
  materials: { id: string; name: string; density_kg_m3: number | null; notes: string }[];
  parameters: Record<string, { name: string; value: number; unit: string }>;
}

interface ProjectMeta {
  project: DesignDoc['project'];
  hash: string;
  reach_m: number | null;
  proposal: null | {
    transaction: {
      transaction_id: string;
      intent: string;
      status: string;
      agent_id: string;
      reason: string;
      operations: unknown[];
      validation_results: unknown[];
      requirements: string[];
    };
    preview_hash: string;
    reach_m: number | null;
    preview_parts: Part[];
  };
  provider: { id: string; model: string; configured: boolean; note: string };
  logs: string[];
}

interface ChatOut {
  reply: string;
  views?: { kind: string; factor?: number; id?: string; layer?: string; mode?: string; enabled?: boolean; strategy?: string }[];
  notes?: string[];
  transaction?: { transaction_id: string };
}

export default function App() {
  const [doc, setDoc] = useState<DesignDoc | null>(null);
  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [preview, setPreview] = useState<DesignDoc | null>(null);
  const [health, setHealth] = useState<{ version?: string; status?: string } | null>(null);
  const [cad, setCad] = useState<{ kernel?: string; build123d?: boolean; note?: string } | null>(null);
  const [val, setVal] = useState<{ findings?: { severity: string; code: string; entity?: string; message: string }[]; error_count?: number } | null>(null);
  const [ledger, setLedger] = useState<{ items: { transaction_id: string; status: string; intent: string; agent_id: string }[] }>({ items: [] });
  const [chat, setChat] = useState<{ who: string; text: string }[]>([
    { who: 'SYSTEM', text: 'ARCHEON Phase 1. Geometry on screen is a DesignIR spatial projection. Exact BREP lives in the CAD worker.' }
  ]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [displayVersion, setDisplayVersion] = useState(ARCHEON_VERSION);
  const [projects, setProjects] = useState<{ id: string; name: string; folder: string; revision: string; parts: number }[]>([]);
  const [currentFolder, setCurrentFolder] = useState('archeon-arm');

  const selectedId = useUi((s) => s.selectedId);
  const view = useUi((s) => s.view);
  const explosion = useUi((s) => s.explosion);
  const spread = useUi((s) => s.spread);
  const mode = useUi((s) => s.mode);
  const overlay = useUi((s) => s.overlay);
  const dockTab = useUi((s) => s.dockTab);
  const connected = useUi((s) => s.connected);

  async function refresh() {
    try {
      const [d, p, h, c, v, t, plist] = await Promise.all([
        getJson<DesignDoc>('/api/design'),
        getJson<ProjectMeta>('/api/project'),
        getJson<{ version: string; status: string }>('/api/health'),
        getJson<{ kernel: string; build123d: boolean; note: string }>('/api/cad/status'),
        getJson<{ findings: never[]; error_count: number }>('/api/validation'),
        getJson<{ items: never[] }>('/api/transactions'),
        getJson<{ projects: { id: string; name: string; folder: string; revision: string; parts: number }[]; current?: string }>('/api/projects')
      ]);
      setDoc(d);
      setMeta(p);
      setHealth(h);
      if (h.version) setDisplayVersion(h.version);
      setCad(c);
      setVal(v);
      setLedger(t);
      setProjects(plist.projects ?? []);
      if (plist.current) setCurrentFolder(plist.current);
      useUi.getState().setConnected(true);
      if (p.proposal?.preview_parts) {
        setPreview({ ...(d as DesignDoc), parts: p.proposal.preview_parts });
      } else {
        setPreview(null);
      }
    } catch {
      useUi.getState().setConnected(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') useUi.getState().clearSelection();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function applyViews(views: ChatOut['views'], design: DesignDoc | null) {
    const ui = useUi.getState();
    for (const v of views || []) {
      if (v.kind === 'explode') {
        ui.setExplosion(v.factor ?? 0.7);
        ui.setView('EXPLODED');
        if (v.strategy) ui.setStrategy(v.strategy as 'SEQUENCE' | 'RADIAL' | 'AXIAL' | 'SYSTEM' | 'BOM_FOCUS' | 'SERVICE' | 'GRAPH' | 'CUSTOM');
      }
      if (v.kind === 'isolate' && v.id) ui.setIsolate(v.id);
      if (v.kind === 'select' && v.id) ui.setSelected(v.id);
      if (v.kind === 'reset_view') ui.resetView();
      if (v.kind === 'set_mode' && v.mode) ui.setView(v.mode as ViewMode);
      if (v.kind === 'show' && v.layer === 'interfaces') ui.setOverlay('INTERFACES');
      if (v.kind === 'focus' && v.id) {
        ui.setSelected(v.id);
        ui.setFocusId(v.id);
        ui.setGhostOthers(true);
        ui.setHudOpen(true);
      }
      if (v.kind === 'ghost') ui.setGhostOthers(v.enabled !== false);
      if (v.kind === 'clear_selection') ui.clearSelection();
      if (v.kind === 'track' && v.id) ui.track(v.id);
      if (v.kind === 'open_hud') ui.setHudOpen(true);
      if (v.kind === 'explode_context') {
        ui.setExplodeContext(v.id || ui.selectedId);
        ui.setSpatial('PART_EXPLODED');
        ui.setExplosion(v.factor ?? 0.85);
      }
      if (v.kind === 'neighborhood') {
        const seed = v.id || ui.selectedId;
        if (seed && design) {
          const seeds = [seed, ...design.parts.filter((p) => p.parent === seed).map((p) => p.id)];
          const ids = [...new Set(seeds.flatMap((s) => neighborhoodOf(s, design.ports, design.interfaces)))];
          ui.setSelected(seed);
          ui.setNeighborhood(ids);
          ui.setOverlay('INTERFACES');
          ui.setGhostOthers(true);
        } else if (seed) {
          ui.setSelected(seed);
          ui.setOverlay('INTERFACES');
        }
      }
      if (v.kind === 'weakest_assumption' && v.id) {
        ui.setSelected(v.id);
        ui.setOverlay('PROVENANCE');
        ui.setHudOpen(true);
      }
    }
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setChat((c) => [...c, { who: 'YOU', text }]);
    setMsg('');
    try {
      const out = await postJson<ChatOut>('/api/commands', { message: text });
      applyViews(out.views, doc);
      setChat((c) => [...c, { who: 'ARCHEON', text: out.reply }]);
      if (out.notes?.length) setChat((c) => [...c, { who: 'NOTES', text: out.notes!.join('\n') }]);
      await refresh();
    } catch (e) {
      setChat((c) => [...c, { who: 'ERROR', text: String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  async function hardReset() {
    if (resetting) return;
    setResetting(true);
    try {
      const response = await fetch('/api/control/reset', { method: 'POST' });
      const body = await response.json().catch(() => ({})) as {
        compiler?: { queued?: boolean; version?: string };
        error?: string;
      };
      if (!response.ok || body.compiler?.queued !== true) {
        throw new Error(body.error ?? `update compiler unavailable (${response.status})`);
      }
      const url = new URL('/boot.html', window.location.origin);
      url.searchParams.set('v', body.compiler.version ?? displayVersion);
      url.searchParams.set('r', String(Date.now()));
      url.searchParams.set('force', '1');
      window.location.replace(url.toString());
    } catch (err) {
      setChat((c) => [...c, { who: 'ERROR', text: `HARD RESET failed · ${err instanceof Error ? err.message : 'compiler unavailable'}` }]);
      setResetting(false);
    }
  }

  async function loadProject(id: string) {
    setBusy(true);
    try {
      await postJson('/api/projects/load', { id });
      useUi.getState().clearProjectSelection();
      await refresh();
      setChat((c) => [...c, { who: 'SYSTEM', text: `Loaded project ${id}. CAD meshes attach from cad/ and generated/.` }]);
    } catch (e) {
      setChat((c) => [...c, { who: 'ERROR', text: String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  async function importCad(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      if (selectedId) body.append('part_id', selectedId);
      const r = await fetch('/api/cad/import', { method: 'POST', body });
      const out = await r.json() as { ok?: boolean; part_id?: string; note?: string; error?: string };
      if (!r.ok) throw new Error(out.error ?? `import failed ${r.status}`);
      if (out.part_id) useUi.getState().setSelected(out.part_id);
      await refresh();
      setChat((c) => [...c, { who: 'CAD', text: `${file.name} → ${out.part_id}\n${out.note ?? ''}` }]);
    } catch (e) {
      setChat((c) => [...c, { who: 'ERROR', text: String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  async function decide(kind: 'commit' | 'reject') {
    const id = meta?.proposal?.transaction.transaction_id;
    if (!id) return;
    await postJson(`/api/transactions/${kind}`, { transaction_id: id, agent_id: 'operator' });
    await refresh();
  }

  const selected = doc?.parts.find((p) => p.id === selectedId);
  const reachMm = meta?.reach_m != null ? Math.round(meta.reach_m * 1000) : '—';
  const propReach = meta?.proposal?.reach_m != null ? Math.round(meta.proposal.reach_m * 1000) : null;
  const proposalIds = [
    ...(meta?.proposal?.transaction.requirements ?? []),
    selectedId ?? ''
  ].filter(Boolean);
  const plan = chat.filter((c) => c.who === 'NOTES' || c.who === 'ARCHEON').slice(-6).map((c) => c.text);
  const activity = (meta?.logs ?? []).slice(-12);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand__mark" src="/archeon.png" alt="" />
          <div>
            <strong>{ARCHEON_PRODUCT}</strong>
            <small>{displayVersion}</small>
          </div>
        </div>
        <div className="meta">
          <div className="chip"><span>PROJECT</span>
            <select className="project-select" value={currentFolder} disabled={busy} onChange={(e) => void loadProject(e.target.value)}>
              {(projects.length ? projects : [{ folder: currentFolder, name: doc?.project.name ?? currentFolder, id: currentFolder, revision: '', parts: 0 }]).map((p) => (
                <option key={p.folder} value={p.folder}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="chip"><span>REVISION</span><b>{doc?.project.revision_id ?? '—'}</b></div>
          <div className="chip"><span>BRANCH</span><b>{doc?.project.branch ?? 'main'}</b></div>
          <div className="chip"><span>KERNEL</span><b className={cad?.build123d ? 'ok' : 'warn'}>{cad?.kernel ?? doc?.project.kernel ?? '—'}</b></div>
          <div className="chip"><span>MODE</span>
            <select className="project-select" value={mode} onChange={(e) => useUi.getState().setMode(e.target.value as WorkstationMode)}>
              {WORKSTATION_MODES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="chip"><span>AGENTS</span><b>11</b></div>
          <div className="chip"><span>VALIDATION</span><b className={(val?.error_count ?? 0) === 0 ? 'ok' : 'err'}>{(val?.error_count ?? '—') === 0 ? 'GRAPH OK' : `${val?.error_count} ERR`}</b></div>
          <div className="chip"><span>MEMORY</span><b>LOCAL</b></div>
          <div className="chip"><span>CONNECTION</span><b className={connected ? 'ok' : 'off'}>{connected ? 'API' : 'OFFLINE'}</b></div>
          <div className="chip"><span>REACH</span><b>{reachMm} mm</b></div>
        </div>
        <div className="views">
          <select value={view} onChange={(e) => useUi.getState().setView(e.target.value as ViewMode)}>
            {VIEW_MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select value={spread} onChange={(e) => useUi.getState().setSpread(e.target.value as SpreadPreset)} title="Explosion spread">
            {(['COMPACT', 'NORMAL', 'ENGINEERING', 'WIDE', 'EXTREME'] as SpreadPreset[]).map((s) => <option key={s}>{s}</option>)}
          </select>
          <span>EXPLODE</span>
          <input type="range" min={0} max={1} step={0.01} value={explosion} onChange={(e) => {
            const n = Number(e.target.value);
            useUi.getState().setExplosion(n);
            if (n > 0 && view === 'ASSEMBLED') useUi.getState().setView('EXPLODED');
          }} />
          <button type="button" className={overlay === 'EXPLODE_LINES' ? 'active' : ''} onClick={() => useUi.getState().setOverlay(overlay === 'EXPLODE_LINES' ? 'NONE' : 'EXPLODE_LINES')}>LINES</button>
          <label className="top-btn">
            IMPORT CAD
            <input type="file" hidden accept=".stl,.step,.stp,.glb,.gltf,.obj" onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importCad(f);
            }} />
          </label>
          <button type="button" className="top-btn" disabled={busy} onClick={() => void postJson('/api/cad/regenerate', {}).then(() => refresh())}>REGEN CAD</button>
          <button type="button" className="top-btn top-btn--reset" disabled={resetting} onClick={() => void hardReset()}>
            {resetting ? 'RESET…' : 'HARD RESET'}
          </button>
        </div>
      </header>

      {doc && (
        <Navigator
          parts={doc.parts}
          assemblies={doc.assemblies}
          features={doc.features}
          interfaces={doc.interfaces}
          requirements={doc.requirements}
        />
      )}

      <section className="viewport">
        <div className="hud">
          <div className="tag">SPATIAL PROJECTION · NOT MANUFACTURING CAD</div>
          <h1>{selected?.name ?? 'NO SELECTION'}</h1>
          <div>{selectedId ?? 'click empty space or Esc to deselect'} · {view} · {spread}</div>
          {selected?.spatial.cad && (
            <div className="cad-flag">{selected.spatial.cad.format.toUpperCase()} · {selected.spatial.cad.truth} · {selected.spatial.cad.note}</div>
          )}
        </div>
        {doc && (
          <ArmScene
            parts={doc.parts}
            ports={doc.ports}
            interfaces={doc.interfaces}
            assemblies={doc.assemblies}
            proposalParts={preview?.parts ?? null}
          />
        )}
        <div className="legend">v{displayVersion} · hash {meta?.hash?.slice(0, 10) ?? '—'}</div>
        <AgentHud
          chat={chat}
          msg={msg}
          setMsg={setMsg}
          busy={busy}
          onSend={send}
          proposal={meta?.proposal ?? null}
          reachMm={reachMm}
          propReach={propReach}
          findings={val?.findings ?? []}
          plan={plan}
          activity={activity}
          onApprove={() => void decide('commit')}
          onReject={() => void decide('reject')}
          onValidate={() => void send('validate proposal')}
        />
      </section>

      <aside className="inspector-rail">
        <ItemTracker
          parts={doc?.parts ?? []}
          assemblies={doc?.assemblies ?? []}
          requirements={doc?.requirements ?? []}
          proposalIds={proposalIds}
        />
        <Inspector
          selectedId={selectedId}
          part={selected}
          assemblies={doc?.assemblies ?? []}
          features={doc?.features ?? []}
          interfaces={doc?.interfaces ?? []}
          ports={doc?.ports ?? []}
          requirements={doc?.requirements ?? []}
          materials={doc?.materials ?? []}
          revision={doc?.project.revision_id ?? 'rev.0001'}
        />
      </aside>

      <footer className="dock">
        <div className="tabs">
          {DOCK_TABS.map((t) => (
            <button key={t} className={dockTab === t ? 'active' : ''} onClick={() => useUi.getState().setDockTab(t)}>{t}</button>
          ))}
        </div>
        <div className="dock-body">
          {dockTab === 'BOM' && (
            <table>
              <thead><tr><th>PN / ID</th><th>NAME</th><th>QTY</th><th>MATERIAL</th><th>ROLE</th><th>COST</th></tr></thead>
              <tbody>
                {doc?.parts.map((p) => (
                  <tr key={p.id} onClick={() => useUi.getState().setSelected(p.id)}>
                    <td>{p.id}</td><td>{p.name}</td><td>{p.qty}</td><td>{p.material ?? '—'}</td><td>{p.semantic_role}</td>
                    <td className="warn">UNVERIFIED · catalog not connected</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {dockTab === 'MATES' && (
            <table>
              <thead><tr><th>INTERFACE</th><th>KIND</th><th>ROLE</th><th>A</th><th>B</th></tr></thead>
              <tbody>
                {doc?.interfaces.map((i) => (
                  <tr key={i.id} onClick={() => useUi.getState().setSelected(i.id)}>
                    <td>{i.name}</td><td>{i.kind}</td><td>{i.semantic_role}</td><td>{i.a}</td><td>{i.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {dockTab === 'ANALYSIS' && (
            <div className="notes">
              Reach DERIVED from link lengths: {reachMm} mm. Payload 3 kg is a requirement (UNVERIFIED). No FEA, no motion envelope, no interference Boolean in this build.
              <div>
                <button type="button" onClick={() => useUi.getState().setSectionOn(!useUi.getState().sectionOn)}>
                  SECTION PLANE {useUi.getState().sectionOn ? 'ON' : 'OFF'}
                </button>
                <span> visualization only — does not modify CAD</span>
              </div>
            </div>
          )}
          {dockTab === 'FEATURE TREE' && (
            <table>
              <thead><tr><th>FEATURE</th><th>PART</th><th>KIND</th><th>ROLE</th></tr></thead>
              <tbody>
                {doc?.features.map((f) => (
                  <tr key={f.id}><td>{f.id}</td><td>{f.part}</td><td>{f.kind}</td><td>{f.semantic_role}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {dockTab === 'TRANSACTIONS' && (
            <table>
              <thead><tr><th>ID</th><th>STATUS</th><th>AGENT</th><th>INTENT</th></tr></thead>
              <tbody>
                {ledger.items.map((t) => (
                  <tr key={t.transaction_id}><td>{t.transaction_id}</td><td>{t.status}</td><td>{t.agent_id}</td><td>{t.intent}</td></tr>
                ))}
                {ledger.items.length === 0 && <tr><td colSpan={4} className="notes">No transactions this session.</td></tr>}
              </tbody>
            </table>
          )}
          {dockTab === 'VALIDATION' && (
            <table>
              <thead><tr><th>SEV</th><th>CODE</th><th>ENTITY</th><th>MESSAGE</th></tr></thead>
              <tbody>
                {(val?.findings ?? []).map((f, i) => (
                  <tr key={i}><td className={f.severity === 'ERROR' ? 'err' : 'warn'}>{f.severity}</td><td>{f.code}</td><td>{f.entity}</td><td>{f.message}</td></tr>
                ))}
                {(val?.findings?.length ?? 0) === 0 && <tr><td colSpan={4} className="ok">Graph validators: no findings. Not FEA. Not collision.</td></tr>}
              </tbody>
            </table>
          )}
          {dockTab === 'TIMELINE' && (
            <div className="notes">
              Revision {doc?.project.revision_id}. Design hash {meta?.hash}. Provider {meta?.provider.id} / {meta?.provider.model}. {meta?.provider.note}
            </div>
          )}
          {dockTab === 'CONSOLE' && (
            <pre className="notes">{(meta?.logs ?? []).slice(-20).join('\n') || 'no structured logs yet'}</pre>
          )}
        </div>
      </footer>
    </div>
  );
}
