import { useEffect, useState } from 'react';
import { type ViewMode } from '@archeon/spatial-grammar';
import { neighborhoodOf, type DesignDocument, type Part } from '@archeon/design-protocol';
import { resolveExplodeContext, type SpreadPreset } from '@archeon/scene-engine';
import { ArmScene } from './scene/ArmScene';
import { AgentHud } from './components/AgentHud';
import { Breadcrumbs } from './components/Breadcrumbs';
import { CommandPalette } from './components/CommandPalette';
import { ContextMenu } from './components/ContextMenu';
import { EngineeringRail } from './components/EngineeringRail';
import { FloatingHud } from './components/FloatingHud';
import { HealthHud } from './components/HealthHud';
import { Inspector } from './components/Inspector';
import { ItemTracker } from './components/ItemTracker';
import { ObjectHud } from './components/ObjectHud';
import { ProjectBrowser } from './components/ProjectBrowser';
import { RadialMenu } from './components/RadialMenu';
import { ViewNav } from './components/ViewNav';
import { Workbench } from './components/Workbench';
import { semanticCatalog, type PaletteItem } from './services/palette';
import type { ContextKind } from './services/palette';
import { fromWorkstationMode, HUMAN_MODES, loadHuds, toWorkstationMode } from './services/hudManager';
import { getJson, postJson } from './api';
import { useUi } from './store';
import { ARCHEON_PRODUCT, ARCHEON_VERSION } from './version';

type DesignDoc = DesignDocument;

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
  live?: { geom_rev?: number };
}

interface ChatOut {
  reply: string;
  views?: { kind: string; factor?: number; id?: string; layer?: string; mode?: string; enabled?: boolean; strategy?: string; spread?: string; prompt?: string }[];
  notes?: string[];
  transaction?: { transaction_id: string };
  card?: { kind: string; title: string; happened: string; why: string; changed: string; attention: string; actions: { id: string; label: string }[] } | null;
  steps?: { n: number; name: string; status: string; note?: string | null }[];
  session?: { session_id: string; status: string; operations?: ChatOut['steps'] };
  cad_job?: { id: string; status: string };
  variants?: { id: string; status: string; metrics?: { reach_m?: number | null }; preview_parts?: Part[] }[];
  best?: string;
  preview_parts?: Part[];
}

function spatialLabel(spatial: string): string {
  if (spatial.includes('EXPLOD')) return 'EXPLODED';
  if (spatial === 'ISOLATE') return 'ISOLATE';
  if (spatial === 'FOCUS') return 'FOCUS';
  if (spatial === 'SERVICE') return 'SERVICE';
  return 'ASSEMBLED';
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
    { who: 'SYSTEM', text: 'ARCHEON v0.6.0 Executable Mechanical Intelligence. Geometry is one DesignIR projection; exact BREP lives in the CAD worker.' }
  ]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [displayVersion, setDisplayVersion] = useState(ARCHEON_VERSION);
  const [projects, setProjects] = useState<{ id: string; name: string; folder: string; revision: string; parts: number }[]>([]);
  const [currentFolder, setCurrentFolder] = useState('archeon-arm');
  const [card, setCard] = useState<ChatOut['card']>(null);
  const [steps, setSteps] = useState<ChatOut['steps']>([]);
  const [variants, setVariants] = useState<NonNullable<ChatOut['variants']>>([]);
  const [cadStatus, setCadStatus] = useState<string | null>(null);

  const selectedId = useUi((s) => s.selectedId);
  const spatial = useUi((s) => s.spatial);
  const view = useUi((s) => s.view);
  const explosion = useUi((s) => s.explosion);
  const spread = useUi((s) => s.spread);
  const mode = useUi((s) => s.mode);
  const overlays = useUi((s) => s.overlays);
  const connected = useUi((s) => s.connected);
  const workbenchOpen = useUi((s) => s.workbenchOpen);
  const huds = useUi((s) => s.huds);

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
      if (p.live?.geom_rev != null) useUi.getState().setGeomRev(p.live.geom_rev);
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
    const loaded = loadHuds();
    useUi.setState({ huds: loaded, hudOpen: loaded.agent.open });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape') {
        useUi.getState().clearSelection();
        useUi.getState().setRadialOpen(false);
        useUi.getState().setContextMenu(null);
      }
      if (e.code === 'Space' && !typing && !e.repeat) {
        e.preventDefault();
        const ui = useUi.getState();
        if (ui.selectedId) ui.setRadialOpen(!ui.radialOpen);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function applyViews(views: ChatOut['views'], design: DesignDoc | null) {
    const ui = useUi.getState();
    for (const v of views || []) {
      if (v.kind === 'explode') {
        ui.dispatch({ op: 'explode_system', factor: v.factor ?? 0.7 });
        if (v.strategy) ui.setStrategy(v.strategy as 'SEQUENCE' | 'RADIAL' | 'AXIAL' | 'SYSTEM' | 'BOM_FOCUS' | 'SERVICE' | 'GRAPH' | 'CUSTOM');
      }
      if (v.kind === 'isolate' && v.id) ui.dispatch({ op: 'isolate_entity', entity_id: v.id });
      if (v.kind === 'select' && v.id) ui.dispatch({ op: 'select_entity', entity_id: v.id });
      if (v.kind === 'reset_view' || v.kind === 'home_view') {
        ui.dispatch({ op: 'home_view' });
        ui.setGhostRoles([]);
        ui.setSectionOn(false);
      }
      if (v.kind === 'set_mode' && v.mode) ui.setView(v.mode as ViewMode);
      if (v.kind === 'show' && v.layer === 'interfaces') ui.dispatch({ op: 'show_overlay', overlay: 'INTERFACES' });
      if (v.kind === 'focus' && v.id) {
        ui.dispatch({ op: 'focus_entity', entity_id: v.id, ghost_others: true });
        ui.setHudOpen(true);
      }
      if (v.kind === 'ghost') ui.dispatch({ op: 'ghost_others', enabled: v.enabled !== false });
      if (v.kind === 'clear_selection') ui.dispatch({ op: 'clear_selection' });
      if (v.kind === 'track' && v.id) ui.dispatch({ op: 'track_entity', entity_id: v.id });
      if (v.kind === 'open_hud') ui.setHudOpen(true);
      if (v.kind === 'explode_context') {
        const scope = resolveExplodeContext(v.id || ui.selectedId, design?.parts ?? [], design?.assemblies ?? []);
        ui.setStrategy('SYSTEM');
        ui.dispatch({ op: 'explode_entity', entity_id: scope, factor: v.factor ?? 0.85 });
      }
      if (v.kind === 'restore_display') ui.dispatch({ op: 'restore_display' });
      if (v.kind === 'previous_view') ui.dispatch({ op: 'previous_view' });
      if (v.kind === 'set_explosion') ui.dispatch({ op: 'set_explosion', progress: v.factor ?? 0.7 });
      if (v.kind === 'set_spread' && v.spread) ui.dispatch({ op: 'set_explosion_spread', spread: v.spread as 'COMPACT' });
      if (v.kind === 'compare_variants' && v.mode) ui.dispatch({ op: 'compare_variants', mode: v.mode as 'SPREAD' });
      if (v.kind === 'select_variant' && v.id) ui.dispatch({ op: 'select_variant', id: v.id });
      if (v.kind === 'show_affected') ui.dispatch({ op: 'show_affected' });
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
      if (v.kind === 'show_joint' && v.id) {
        ui.setSelected(v.id);
        ui.setOverlay('DATUMS');
        ui.setHudOpen(true);
      }
      if (v.kind === 'show_load_path' && v.id && design) {
        const scopeId = v.id;
        const joint = design.joints.find((candidate) =>
          candidate.id === scopeId || candidate.parent === scopeId || candidate.child === scopeId || candidate.rotating_group.includes(scopeId)
        );
        ui.setNeighborhood(joint?.load_path ?? []);
        ui.setGhostOthers(true);
        ui.setOverlay('INTERFACES');
      }
      if (v.kind === 'explode_stack') {
        const scope = v.id || ui.selectedId;
        if (scope) {
          ui.setStrategy('STACK');
          ui.dispatch({ op: 'explode_entity', entity_id: scope, factor: v.factor ?? 0.9 });
        }
      }
      if (v.kind === 'cutaway') {
        ui.setSectionOn(v.enabled !== false);
        ui.setView('CUTAWAY');
      }
      if (v.kind === 'show_load_paths') {
        ui.setOverlay('INTERFACES');
        ui.setNeighborhood([...(design?.joints ?? []).flatMap((joint) => joint.load_path)]);
        ui.setGhostOthers(true);
      }
      if (v.kind === 'restore_display') {
        ui.setGhostRoles([]);
        ui.setSectionOn(false);
      }
    }
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    useUi.getState().setAgentWorking(true);
    setChat((c) => [...c, { who: 'YOU', text }]);
    setMsg('');
    try {
      const ui = useUi.getState();
      const out = await postJson<ChatOut>('/api/commands', {
        message: text,
        selected_id: ui.selectedId,
        focused_id: ui.focusId,
        tracked_ids: ui.trackedIds
      });
      applyViews(out.views, doc);
      setChat((c) => [...c, { who: 'ARCHEON', text: out.reply }]);
      if (out.notes?.length) setChat((c) => [...c, { who: 'NOTES', text: out.notes!.join('\n') }]);
      setCard(out.card ?? null);
      setSteps(out.steps ?? out.session?.operations ?? []);
      if (out.variants) setVariants(out.variants);
      if (out.best) useUi.getState().setActiveVariant(out.best);
      if (out.preview_parts) setPreview({ ...(doc as DesignDoc), parts: out.preview_parts });
      if (out.cad_job) setCadStatus(out.cad_job.status);
      if (out.views?.some((v) => v.kind === 'open_hud' || v.kind === 'focus')) useUi.getState().setHudOpen(true);
      await refresh();
    } catch (e) {
      setChat((c) => [...c, { who: 'ERROR', text: String(e) }]);
    } finally {
      setBusy(false);
      useUi.getState().setAgentWorking(false);
    }
  }

  useEffect(() => {
    const es = new EventSource('/api/events/stream');
    es.addEventListener('CAD_JOB_STARTED', () => setCadStatus('RUNNING'));
    es.addEventListener('CAD_JOB_COMPLETE', () => {
      setCadStatus('COMPLETE');
      void refresh();
    });
    es.addEventListener('CAD_JOB_FAILED', () => setCadStatus('FAILED'));
    return () => es.close();
  }, []);

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
      setChat((c) => [...c, { who: 'CAD', text: `${file.name} â†’ ${out.part_id}\n${out.note ?? ''}` }]);
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
  const selectedAsm = doc?.assemblies.find((a) => a.id === selectedId);
  const selectedReq = doc?.requirements.find((r) => r.id === selectedId);
  const selectedIface = doc?.interfaces.find((i) => i.id === selectedId);
  const contextKind: ContextKind = meta?.proposal
    ? 'proposal'
    : selected
      ? 'part'
      : selectedAsm
        ? 'assembly'
        : selectedReq
          ? 'requirement'
          : selectedIface
            ? 'interface'
            : 'none';
  const contextName = selected?.name ?? selectedAsm?.name ?? selectedReq?.id ?? selectedIface?.name;
  const reachMm = meta?.reach_m != null ? Math.round(meta.reach_m * 1000) : '—';
  const propReach = meta?.proposal?.reach_m != null ? Math.round(meta.proposal.reach_m * 1000) : null;
  const proposalIds = [
    ...(meta?.proposal?.transaction.requirements ?? []),
    selectedId ?? ''
  ].filter(Boolean);
  const plan = chat.filter((c) => c.who === 'NOTES' || c.who === 'ARCHEON').slice(-6).map((c) => c.text);
  const activity = (meta?.logs ?? []).slice(-12);

  const paletteCatalog: PaletteItem[] = [
    ...(doc ? semanticCatalog(doc) : []),
    { id: 'cmd.explode', label: 'explode', kind: 'COMMAND', hint: 'explode selected' },
    { id: 'cmd.restore', label: 'restore display', kind: 'COMMAND' },
    { id: 'cmd.home', label: 'home view', kind: 'COMMAND' },
    { id: 'cmd.section', label: 'section', kind: 'VIEW' },
    { id: 'cad-designer', label: 'CAD Designer', kind: 'AGENT' },
    { id: 'spatial-director', label: 'Spatial Director', kind: 'AGENT' }
  ];

  function onContextAction(id: string) {
    const ui = useUi.getState();
    const sid = ui.selectedId;
    if (id === 'focus' && sid) ui.dispatch({ op: 'focus_entity', entity_id: sid, ghost_others: true });
    else if (id === 'isolate' && sid) ui.dispatch({ op: 'isolate_entity', entity_id: sid });
    else if (id === 'track' && sid) ui.dispatch({ op: 'track_entity', entity_id: sid });
    else if (id === 'explode') {
      const scope = resolveExplodeContext(sid, doc?.parts ?? [], doc?.assemblies ?? []);
      ui.setStrategy('SYSTEM');
      ui.dispatch({ op: 'explode_entity', entity_id: scope, factor: 0.85 });
    }
    else if (id === 'xray') ui.setView('X_RAY');
    else if (id === 'interfaces') ui.dispatch({ op: 'show_overlay', overlay: 'INTERFACES' });
    else if (id === 'affected') ui.dispatch({ op: 'show_affected' });
    else if (id === 'home') ui.dispatch({ op: 'home_view' });
    else if (id === 'fit') ui.dispatch({ op: 'fit_scene' });
    else if (id === 'compare') ui.setView('DIFF');
    else if (id === 'validate') void send('validate proposal');
    else if (id === 'approve') void decide('commit');
    else if (id === 'reject') void decide('reject');
    else if (id === 'restore') ui.dispatch({ op: 'restore_display' });
    else if (id.startsWith('variant:')) ui.dispatch({ op: 'select_variant', id: id.slice(8) });
    else if (id === 'measure') ui.openHud('measure');
    else if (id === 'section') {
      ui.setSectionOn(true);
      ui.openHud('section');
    }
    else if (id === 'ask') {
      ui.setHudOpen(true);
      if (sid) setMsg('what is this');
    }
    else if (id === 'more') ui.openHud('inspector');
  }

  function onPalette(item: PaletteItem) {
    const ui = useUi.getState();
    if (item.kind === 'COMMAND') {
      if (item.id === 'cmd.explode') {
        const scope = resolveExplodeContext(ui.selectedId, doc?.parts ?? [], doc?.assemblies ?? []);
        ui.setStrategy('SYSTEM');
        ui.dispatch({ op: 'explode_entity', entity_id: scope, factor: 0.85 });
      }
      else if (item.id === 'cmd.restore') ui.dispatch({ op: 'restore_display' });
      else if (item.id === 'cmd.home') ui.dispatch({ op: 'home_view' });
    } else if (item.kind === 'VIEW') {
      ui.setSectionOn(true);
    } else if (item.kind === 'AGENT') {
      ui.setHudOpen(true);
    } else {
      if (item.focusId) ui.setFocusId(item.focusId);
      ui.setSelected(item.id);
      if (item.kind === 'FEATURE' || item.kind === 'JOINT') ui.setOverlay('DATUMS');
    }
  }

  const healthy = connected && (val?.error_count ?? 0) === 0;
  const geometrySummary = Object.entries(
    (doc?.parts ?? []).reduce<Record<string, number>>((counts, part) => {
      const key = part.spatial.cad?.geometry_class ?? 'PRIMITIVE_FALLBACK';
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {})
  ).map(([kind, count]) => `${kind} ${count}`).join(' · ');
  const humanMode = fromWorkstationMode(mode);

  return (
    <div className={`app ${workbenchOpen ? 'app--bench' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <img className="brand__mark" src="/archeon.png" alt="" />
          <div>
            <strong>{ARCHEON_PRODUCT}</strong>
            <small>{displayVersion}</small>
          </div>
        </div>
        <div className="human-modes">
          {HUMAN_MODES.map((m) => (
            <button key={m} type="button" className={humanMode === m ? 'active' : ''} onClick={() => useUi.getState().setMode(toWorkstationMode(m))}>{m}</button>
          ))}
        </div>
        <div className="meta meta--slim">
          <select className="project-select" value={currentFolder} disabled={busy} onChange={(e) => void loadProject(e.target.value)}>
            {(projects.length ? projects : [{ folder: currentFolder, name: doc?.project.name ?? currentFolder, id: currentFolder, revision: '', parts: 0 }]).map((p) => (
              <option key={p.folder} value={p.folder}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="views">
          <span>EXPLODE</span>
          <input type="range" min={0} max={1} step={0.01} value={explosion} onChange={(e) => {
            const n = Number(e.target.value);
            useUi.getState().dispatch({ op: 'set_explosion', progress: n });
          }} onPointerUp={() => useUi.getState().bumpFit()} />
          <select value={spread} onChange={(e) => useUi.getState().setSpread(e.target.value as SpreadPreset)} title="Explosion spread">
            {(['COMPACT', 'NORMAL', 'ENGINEERING', 'WIDE', 'EXTREME'] as SpreadPreset[]).map((s) => <option key={s}>{s}</option>)}
          </select>
          <button type="button" className={overlays.explodeTrails ? 'active' : ''} onClick={() => useUi.getState().toggleOverlay('explodeTrails')}>LINES</button>
          <button type="button" className="top-btn" onClick={() => useUi.getState().setPaletteOpen(true)}>FIND Ctrl+K</button>
          <button
            type="button"
            className={`health-chip ${healthy ? 'ok' : 'warn'}`}
            onClick={() => useUi.getState().openHud('health')}
          >
            {healthy ? '✓ HEALTHY' : '! CHECK'}
          </button>
        </div>
      </header>

      <EngineeringRail />

      <section className="viewport">
        <div className="hud">
          {doc && <Breadcrumbs projectName={doc.project.name} parts={doc.parts} assemblies={doc.assemblies} />}
          <div className="state">{spatialLabel(spatial)} · ENGINEERING</div>
          <div className="layer">DesignIR projection</div>
          {!selectedId && <div className="hint">Click geometry to inspect</div>}
        </div>
        {doc && (
          <ArmScene
            parts={doc.parts}
            ports={doc.ports}
            interfaces={doc.interfaces}
            joints={doc.joints}
            features={doc.features}
            assemblies={doc.assemblies}
            proposalParts={preview?.parts ?? null}
            variantSets={variants.map((v) => ({ id: v.id, parts: v.preview_parts ?? [] }))}
          />
        )}
        <div className="legend">v{displayVersion} · {meta?.hash?.slice(0, 10) ?? '—'}</div>
        <ViewNav />
        <div className="tracker-anchor">
          <ItemTracker
            parts={doc?.parts ?? []}
            assemblies={doc?.assemblies ?? []}
            requirements={doc?.requirements ?? []}
            proposalIds={proposalIds}
          />
        </div>
        <ObjectHud kind={contextKind === 'proposal' ? (selected ? 'part' : 'assembly') : contextKind} name={contextName} onAction={onContextAction} />
        <RadialMenu onAction={onContextAction} />
        <ContextMenu kind={contextKind} onAction={onContextAction} />
        {doc && (
          <FloatingHud id="project" title="PROJECT BROWSER">
            <ProjectBrowser document={doc} />
          </FloatingHud>
        )}
        <FloatingHud id="inspector" title="INSPECTOR">
          <Inspector
            selectedId={selectedId}
            part={selected}
            assemblies={doc?.assemblies ?? []}
            features={doc?.features ?? []}
            interfaces={doc?.interfaces ?? []}
            ports={doc?.ports ?? []}
            requirements={doc?.requirements ?? []}
            joints={doc?.joints ?? []}
            analyses={doc?.analyses ?? []}
            evidence={doc?.evidence ?? []}
            mates={doc?.mates ?? []}
            materials={doc?.materials ?? []}
            revision={doc?.project.revision_id ?? 'rev.0001'}
          />
        </FloatingHud>
        <FloatingHud id="health" title="SYSTEM HEALTH">
          <HealthHud
            version={displayVersion}
            revision={doc?.project.revision_id}
            branch={doc?.project.branch}
            kernel={cad?.kernel ?? doc?.project.kernel}
            build123d={cad?.build123d}
            connected={connected}
            reachMm={reachMm}
            errorCount={val?.error_count}
            provider={meta?.provider ? `${meta.provider.id} / ${meta.provider.model}` : undefined}
            cadNote={cad?.note}
            geometrySummary={geometrySummary}
          />
          <div className="insp-actions">
            <label className="top-btn">IMPORT CAD
              <input type="file" hidden accept=".stl,.step,.stp,.glb,.gltf,.obj" onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void importCad(f);
              }} />
            </label>
            <button type="button" disabled={busy} onClick={() => void postJson('/api/cad/regenerate', {}).then(() => refresh())}>REGEN CAD</button>
            <button type="button" className="top-btn--reset" disabled={resetting} onClick={() => void hardReset()}>{resetting ? 'RESET…' : 'HARD RESET'}</button>
          </div>
        </FloatingHud>
        <FloatingHud id="analysis" title="ANALYSIS">
          <div className="notes">Reach {reachMm} mm DERIVED from link lengths. Payload UNVERIFIED. No FEA. Section plane is visualization only.</div>
          <button type="button" onClick={() => useUi.getState().setSectionOn(!useUi.getState().sectionOn)}>SECTION {useUi.getState().sectionOn ? 'ON' : 'OFF'}</button>
        </FloatingHud>
        <FloatingHud id="measure" title="MEASURE">
          <div className="notes">
            {selected ? `${selected.name}: envelope ${selected.spatial.primitive.kind === 'box' ? `${selected.spatial.primitive.sx.toFixed(3)} × ${selected.spatial.primitive.sy.toFixed(3)} × ${selected.spatial.primitive.sz.toFixed(3)} m` : 'cylinder'} · DERIVED from DesignIR primitive. Not a CMM. Not BREP mass properties.` : 'Select a part to measure its DesignIR envelope.'}
          </div>
        </FloatingHud>
        <FloatingHud id="section" title="SECTION">
          <div className="notes">Visualization clip plane. Does not modify CAD.</div>
          <button type="button" onClick={() => useUi.getState().setSectionOn(!useUi.getState().sectionOn)}>PLANE {useUi.getState().sectionOn ? 'ON' : 'OFF'}</button>
        </FloatingHud>
        <FloatingHud id="history" title="HISTORY">
          <div className="notes">Revision {doc?.project.revision_id}. Hash {meta?.hash}. {meta?.provider?.note}</div>
        </FloatingHud>
        <FloatingHud id="bom" title="BOM" wide>
          <table>
            <thead><tr><th>NAME</th><th>ID</th><th>QTY</th></tr></thead>
            <tbody>
              {doc?.parts.map((p) => (
                <tr key={p.id} onClick={() => useUi.getState().setSelected(p.id)}><td>{p.name}</td><td>{p.id}</td><td>{p.qty}</td></tr>
              ))}
            </tbody>
          </table>
        </FloatingHud>
        <FloatingHud id="interfaces" title="INTERFACES">
          <table>
            <thead><tr><th>NAME</th><th>KIND</th></tr></thead>
            <tbody>
              {doc?.interfaces.map((i) => (
                <tr key={i.id} onClick={() => useUi.getState().setSelected(i.id)}><td>{i.name}</td><td>{i.kind}</td></tr>
              ))}
            </tbody>
          </table>
        </FloatingHud>
        <FloatingHud id="compare" title="COMPARE">
          <div className="notes">{variants.length ? 'Proposal / variant overlay is orange PREVIEW geometry. Not exact CAD.' : 'No active proposal or variants.'}</div>
        </FloatingHud>
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
          contextName={contextName}
          working={busy}
          cadStatus={cadStatus}
          card={card}
          steps={steps}
          variants={variants}
          onStop={() => { useUi.getState().setAgentWorking(false); setBusy(false); void postJson('/api/live-design/cancel', {}); }}
          onAction={onContextAction}
        />
      </section>
      <CommandPalette catalog={paletteCatalog} onCommand={onPalette} />

      <Workbench
        doc={doc}
        reachMm={reachMm}
        val={val}
        ledger={ledger}
        hash={meta?.hash}
        provider={meta?.provider ? `${meta.provider.id} / ${meta.provider.model}` : undefined}
      />
    </div>
  );
}
