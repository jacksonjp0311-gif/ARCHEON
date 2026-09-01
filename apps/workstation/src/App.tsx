import { useEffect, useMemo, useState } from 'react';
import { VIEW_MODES, TREE_TABS, DOCK_TABS, type ViewMode } from '@archeon/spatial-grammar';
import { LOCAL_COMMANDS, type Part, type Requirement } from '@archeon/design-protocol';
import { ArmScene } from './scene/ArmScene';
import { getJson, postJson } from './api';
import { useUi } from './store';

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
  views?: { kind: string; factor?: number; id?: string; layer?: string; mode?: string }[];
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

  const selectedId = useUi((s) => s.selectedId);
  const view = useUi((s) => s.view);
  const explosion = useUi((s) => s.explosion);
  const treeTab = useUi((s) => s.treeTab);
  const dockTab = useUi((s) => s.dockTab);
  const connected = useUi((s) => s.connected);

  async function refresh() {
    try {
      const [d, p, h, c, v, t] = await Promise.all([
        getJson<DesignDoc>('/api/design'),
        getJson<ProjectMeta>('/api/project'),
        getJson<{ version: string; status: string }>('/api/health'),
        getJson<{ kernel: string; build123d: boolean; note: string }>('/api/cad/status'),
        getJson<{ findings: never[]; error_count: number }>('/api/validation'),
        getJson<{ items: never[] }>('/api/transactions')
      ]);
      setDoc(d);
      setMeta(p);
      setHealth(h);
      setCad(c);
      setVal(v);
      setLedger(t);
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

  function applyViews(views: ChatOut['views']) {
    const ui = useUi.getState();
    for (const v of views || []) {
      if (v.kind === 'explode') {
        ui.setExplosion(v.factor ?? 0.7);
        ui.setView('EXPLODED');
      }
      if (v.kind === 'isolate' && v.id) ui.setIsolate(v.id);
      if (v.kind === 'select' && v.id) ui.setSelected(v.id);
      if (v.kind === 'reset_view') ui.resetView();
      if (v.kind === 'set_mode' && v.mode) ui.setView(v.mode as ViewMode);
      if (v.kind === 'show' && v.layer === 'interfaces') ui.setView('INTERFACES');
    }
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setChat((c) => [...c, { who: 'YOU', text }]);
    setMsg('');
    try {
      const out = await postJson<ChatOut>('/api/commands', { message: text });
      applyViews(out.views);
      setChat((c) => [...c, { who: 'ARCHEON', text: out.reply }]);
      if (out.notes?.length) setChat((c) => [...c, { who: 'NOTES', text: out.notes!.join('\n') }]);
      await refresh();
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
  const treeItems = useMemo(() => {
    if (!doc) return [];
    switch (treeTab) {
      case 'SYSTEM':
        return doc.assemblies.filter((a) => !a.parent).map((a) => ({ id: a.id, name: a.name, role: a.semantic_role, prov: '' }));
      case 'ASSEMBLY':
        return doc.assemblies.map((a) => ({ id: a.id, name: a.name, role: a.semantic_role, prov: '' }));
      case 'FEATURES':
        return doc.features.map((f) => ({ id: f.id, name: f.id, role: `${f.kind} · ${f.part}`, prov: '' }));
      case 'INTERFACES':
        return doc.interfaces.map((i) => ({ id: i.id, name: i.name, role: i.semantic_role, prov: i.kind }));
      case 'REQUIREMENTS':
        return doc.requirements.map((r) => ({
          id: r.id,
          name: r.id,
          role: r.satisfied === true ? 'DERIVED/OK' : r.satisfied === false ? 'FAIL' : 'UNVERIFIED',
          prov: r.provenance.class
        }));
      default:
        return doc.parts.map((p) => ({ id: p.id, name: p.name, role: p.semantic_role, prov: p.provenance.class }));
    }
  }, [doc, treeTab]);

  const reachMm = meta?.reach_m != null ? Math.round(meta.reach_m * 1000) : '—';
  const propReach = meta?.proposal?.reach_m != null ? Math.round(meta.proposal.reach_m * 1000) : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>ARCHEON</strong>
          <small>SPATIAL ENGINEERING OS</small>
        </div>
        <div className="meta">
          <div className="chip"><span>PROJECT</span><b>{doc?.project.name ?? '…'}</b></div>
          <div className="chip"><span>REVISION</span><b>{doc?.project.revision_id ?? '—'}</b></div>
          <div className="chip"><span>BRANCH</span><b>{doc?.project.branch ?? 'main'}</b></div>
          <div className="chip"><span>KERNEL</span><b className={cad?.build123d ? 'ok' : 'warn'}>{cad?.kernel ?? doc?.project.kernel ?? '—'}</b></div>
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
          <span>EXPLODE</span>
          <input type="range" min={0} max={1} step={0.01} value={explosion} onChange={(e) => {
            const n = Number(e.target.value);
            useUi.getState().setExplosion(n);
            if (n > 0 && view === 'ASSEMBLED') useUi.getState().setView('EXPLODED');
          }} />
        </div>
      </header>

      <aside className="tree">
        <h2>DESIGN TREE</h2>
        <div className="tabs">
          {TREE_TABS.map((t) => (
            <button key={t} className={treeTab === t ? 'active' : ''} onClick={() => useUi.getState().setTreeTab(t)}>{t}</button>
          ))}
        </div>
        <div className="tree-body">
          {treeItems.map((item) => (
            <div
              key={item.id}
              className={`tree-item ${selectedId === item.id ? 'sel' : ''}`}
              onClick={() => useUi.getState().setSelected(item.id)}
            >
              {item.name}
              <span className="prov">{item.prov}</span>
              <span className="role">{item.role}</span>
            </div>
          ))}
        </div>
      </aside>

      <section className="viewport">
        <div className="hud">
          <div className="tag">SPATIAL PROJECTION · NOT MANUFACTURING CAD</div>
          <h1>{selected?.name ?? 'ARCHEON ARM'}</h1>
          <div>{selectedId} · {view}</div>
        </div>
        {doc && (
          <ArmScene
            parts={doc.parts}
            ports={doc.ports}
            proposalParts={preview?.parts ?? null}
          />
        )}
        <div className="legend">v{health?.version ?? '0.1.0'} · hash {meta?.hash?.slice(0, 10) ?? '—'}</div>
      </section>

      <aside className="agent">
        <h2>AGENT CONSOLE</h2>
        <div className="agent-body">
          {meta?.proposal && (
            <div className="proposal">
              <h3>PROPOSAL · {meta.proposal.transaction.status}</h3>
              <div>{meta.proposal.transaction.intent}</div>
              <div className="notes">{meta.proposal.transaction.reason}</div>
              <div>Affected req: {meta.proposal.transaction.requirements.join(', ') || '—'}</div>
              {propReach != null && <div>Derived reach: {reachMm} → {propReach} mm (DERIVED, not measured)</div>}
              <div className="row">
                <button className="primary" onClick={() => decide('commit')}>APPROVE</button>
                <button className="danger" onClick={() => decide('reject')}>REJECT</button>
                <button onClick={() => send('validate proposal')}>VALIDATE</button>
              </div>
            </div>
          )}
          {chat.map((c, i) => (
            <div className="log" key={i}><span className="who">{c.who}</span> {c.text}</div>
          ))}
        </div>
        <div className="quick">
          {LOCAL_COMMANDS.map((c) => (
            <button key={c} onClick={() => send(c)}>{c}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(msg); }}>
          <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="engineering command…" />
          <button className="primary" disabled={busy}>SEND</button>
        </form>
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
