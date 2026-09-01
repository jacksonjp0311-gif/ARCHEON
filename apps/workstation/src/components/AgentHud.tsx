import { useEffect, useRef, useState } from 'react';
import { AGENT_TABS, type AgentTab } from '@archeon/spatial-grammar';
import { LOCAL_COMMANDS } from '@archeon/design-protocol';
import { useUi } from '../store';

const AGENTS = [
  ['architect', 'Architect'],
  ['cad-designer', 'CAD Designer'],
  ['assembly-designer', 'Assembly Designer'],
  ['constraint-engineer', 'Constraint Engineer'],
  ['analysis-engineer', 'Analysis Engineer'],
  ['dfm', 'DFM Reviewer'],
  ['components', 'Components'],
  ['bom', 'BOM'],
  ['spatial-director', 'Spatial Director'],
  ['critic', 'Critic'],
  ['memory-curator', 'Memory Curator']
] as const;

type ChatLine = { who: string; text: string };

interface Props {
  chat: ChatLine[];
  msg: string;
  setMsg: (v: string) => void;
  busy: boolean;
  onSend: (text: string) => void;
  proposal: null | {
    transaction: {
      transaction_id: string;
      intent: string;
      status: string;
      agent_id: string;
      reason: string;
      operations: unknown[];
      requirements: string[];
    };
    reach_m: number | null;
  };
  reachMm: string | number;
  propReach: number | null;
  findings: { severity: string; code: string; entity?: string; message: string }[];
  plan: string[];
  activity: string[];
  onApprove: () => void;
  onReject: () => void;
  onValidate: () => void;
  contextName?: string;
  working?: boolean;
  cadStatus?: string | null;
  card?: {
    kind: string;
    title: string;
    happened: string;
    why: string;
    changed: string;
    attention: string;
    actions: { id: string; label: string }[];
  } | null;
  steps?: { n: number; name: string; status: string; note?: string | null }[];
  variants?: { id: string; status: string; metrics?: { reach_m?: number | null; note?: string } }[];
  onStop?: () => void;
  onAction?: (id: string) => void;
}

const HUD_KEY = 'archeon.agentHud.v1';

type HudGeom = { x: number; y: number; w: number; h: number; open?: boolean; collapsed?: boolean };

function loadPersist(): HudGeom {
  try {
    const raw = sessionStorage.getItem(HUD_KEY);
    if (raw) return JSON.parse(raw) as HudGeom;
  } catch { /* session only */ }
  return { x: -1, y: 10, w: 360, h: 460, open: false, collapsed: false };
}

export function AgentHud(props: Props) {
  const open = useUi((s) => s.hudOpen);
  const collapsed = useUi((s) => s.hudCollapsed);
  const tab = useUi((s) => s.agentTab);
  const setOpen = useUi((s) => s.setHudOpen);
  const setCollapsed = useUi((s) => s.setHudCollapsed);
  const setTab = useUi((s) => s.setAgentTab);
  const boot = useRef(loadPersist());
  const [geom, setGeom] = useState<HudGeom>(boot.current);
  const [morph, setMorph] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (boot.current.open) setOpen(true);
    if (boot.current.collapsed) setCollapsed(true);
  }, [setOpen, setCollapsed]);

  useEffect(() => {
    sessionStorage.setItem(HUD_KEY, JSON.stringify({ ...geom, open, collapsed }));
  }, [geom, open, collapsed]);

  useEffect(() => {
    if (!open) {
      setMorph(false);
      return;
    }
    const id = requestAnimationFrame(() => setMorph(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open || geom.x >= 0) return;
    const parent = panel.current?.offsetParent as HTMLElement | null;
    const pw = parent?.clientWidth ?? 720;
    setGeom((g) => ({ ...g, x: Math.max(8, pw - g.w - 10), y: 10 }));
  }, [open, geom.x]);

  function clampGeom(next: HudGeom): HudGeom {
    const parent = panel.current?.offsetParent as HTMLElement | null;
    const pw = parent?.clientWidth ?? window.innerWidth;
    const ph = parent?.clientHeight ?? window.innerHeight;
    return {
      ...next,
      x: Math.min(pw - 48, Math.max(-next.w + 64, next.x)),
      y: Math.min(ph - 40, Math.max(0, next.y)),
      w: Math.min(560, Math.max(280, next.w)),
      h: Math.min(720, Math.max(280, next.h))
    };
  }

  function snap(next: HudGeom): HudGeom {
    const parent = panel.current?.offsetParent as HTMLElement | null;
    const pw = parent?.clientWidth ?? window.innerWidth;
    const ph = parent?.clientHeight ?? window.innerHeight;
    const EDGE = 28;
    let { x, y } = next;
    if (x < EDGE) x = 8;
    if (x + next.w > pw - EDGE) x = Math.max(8, pw - next.w - 8);
    if (y + (collapsed ? 40 : next.h) > ph - EDGE) y = Math.max(8, ph - (collapsed ? 48 : next.h) - 8);
    return { ...next, x, y };
  }

  function onTitleDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const parent = panel.current?.offsetParent as HTMLElement | null;
    const prect = parent?.getBoundingClientRect();
    const rect = panel.current?.getBoundingClientRect();
    const x = rect && prect ? rect.left - prect.left : geom.x;
    const y = rect && prect ? rect.top - prect.top : geom.y;
    if (geom.x < 0) setGeom((g) => ({ ...g, x, y }));
    drag.current = { dx: e.clientX - x, dy: e.clientY - y };
  }
  function onTitleMove(e: React.PointerEvent) {
    if (!drag.current) return;
    e.stopPropagation();
    setGeom((g) => clampGeom({ ...g, x: e.clientX - drag.current!.dx, y: e.clientY - drag.current!.dy }));
  }
  function onTitleUp() {
    drag.current = null;
    setGeom((g) => snap(g));
  }

  function dock(edge: 'LEFT' | 'RIGHT' | 'BOTTOM') {
    const parent = panel.current?.offsetParent as HTMLElement | null;
    const pw = parent?.clientWidth ?? 720;
    const ph = parent?.clientHeight ?? 520;
    if (edge === 'LEFT') setGeom((g) => ({ ...g, x: 8, y: 10 }));
    if (edge === 'RIGHT') setGeom((g) => ({ ...g, x: Math.max(8, pw - g.w - 8), y: 10 }));
    if (edge === 'BOTTOM') setGeom((g) => ({ ...g, x: Math.max(8, (pw - g.w) / 2), y: Math.max(8, ph - g.h - 8) }));
  }

  const proposing = props.working ? 'WORKING' : props.proposal ? 'PROPOSAL ACTIVE' : 'IDLE';
  const active = props.working ? 'CAD DESIGNER' : (props.proposal?.transaction.agent_id ?? 'spatial-director');

  if (!open) {
    return (
      <button type="button" className={`agent-fab ${props.working ? 'is-working' : ''} ${props.proposal ? 'is-decide' : ''}`} onClick={() => setOpen(true)} title="Open ARCHEON Agent">
        ◈ ARCHEON{props.working ? ' ●' : props.proposal ? ' !' : ''}
      </button>
    );
  }

  return (
    <div
      ref={panel}
      className={`agent-hud ${morph ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}
      style={{
        ...(geom.x < 0 ? { right: 10, top: 10 } : { left: geom.x, top: geom.y }),
        width: geom.w,
        height: collapsed ? undefined : geom.h
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <header
        className="agent-hud__title"
        onPointerDown={onTitleDown}
        onPointerMove={onTitleMove}
        onPointerUp={onTitleUp}
      >
        <span>◈ ARCHEON</span>
        <small>
          {props.contextName ? `CONTEXT ${props.contextName}` : `ACTIVE ${active.toUpperCase()}`} · {proposing}
          {props.cadStatus ? ` · CAD ${props.cadStatus}` : ''}
        </small>
        <button type="button" onClick={() => setCollapsed(!collapsed)} title="Collapse">{collapsed ? '▢' : '—'}</button>
        <button type="button" onClick={() => dock('RIGHT')} title="Dock right">⊞</button>
        <button type="button" onClick={() => setOpen(false)} title="Morph closed">×</button>
      </header>
      {!collapsed && (
        <>
          <div className="agent-hud__tabs">
            {AGENT_TABS.map((t) => (
              <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t as AgentTab)}>{t}</button>
            ))}
          </div>
          <div className="agent-hud__body">
            {tab === 'CHAT' && (
              <>
                {props.card && (
                  <div className={`reply-card kind-${props.card.kind}`}>
                    <h3>{props.card.title}</h3>
                    <p>{props.card.happened}</p>
                    <p className="notes">{props.card.why}</p>
                    <p>{props.card.changed}</p>
                    <p className="warn">{props.card.attention}</p>
                    <div className="row">
                      {props.card.actions.map((a) => (
                        <button key={a.id} type="button" onClick={() => props.onAction?.(a.id)}>{a.label}</button>
                      ))}
                    </div>
                  </div>
                )}
                {props.steps && props.steps.length > 0 && (
                  <ol className="live-steps">
                    {props.steps.map((s) => (
                      <li key={s.n}><span className={s.status === 'COMPLETE' ? 'ok' : s.status === 'RUNNING' || s.status === 'WORKING' ? 'warn' : 'notes'}>{s.status === 'COMPLETE' ? '✓' : s.status === 'WAITING' || s.status === 'NOT_CHECKED' ? '○' : '●'}</span> {s.name} <small>{s.status}{s.note ? ` · ${s.note}` : ''}</small></li>
                    ))}
                  </ol>
                )}
                {props.chat.map((c, i) => (
                  <div className="log" key={i}><span className="who">{c.who}</span> {c.text}</div>
                ))}
              </>
            )}
            {tab === 'AGENTS' && AGENTS.map(([id, name]) => (
              <div className="agent-row" key={id}>
                <b>{name}</b>
                <span className={id === 'cad-designer' && props.working ? 'warn' : id === active && props.proposal ? 'warn' : 'ok'}>
                  {id === 'cad-designer' && props.working ? 'WORKING' : id === active && props.proposal ? 'PROPOSING' : 'IDLE'}
                </span>
              </div>
            ))}
            {props.variants && props.variants.length > 0 && tab === 'PLAN' && (
              <div className="variant-list">
                {props.variants.map((v) => (
                  <button key={v.id} type="button" onClick={() => props.onAction?.(`variant:${v.id}`)}>
                    Variant {v.id} · {v.status} · reach {v.metrics?.reach_m != null ? `${Math.round(v.metrics.reach_m * 1000)} mm` : '—'}
                  </button>
                ))}
              </div>
            )}
            {tab === 'PLAN' && (
              <div className="notes">
                {(props.plan.length ? props.plan : ['No structured plan. Local commands map directly to Spatial Director / DTP.']).map((n, i) => <p key={i}>{n}</p>)}
              </div>
            )}
            {tab === 'PROPOSAL' && props.proposal && (
              <div className="proposal">
                <h3>{props.proposal.transaction.status} · {props.proposal.transaction.transaction_id}</h3>
                <div>{props.proposal.transaction.intent}</div>
                <div className="notes">{props.proposal.transaction.reason}</div>
                <div>Affected req: {props.proposal.transaction.requirements.join(', ') || '—'}</div>
                {props.propReach != null && <div>Derived reach: {props.reachMm} → {props.propReach} mm (DERIVED)</div>}
                <div className="row">
                  <button className="primary" onClick={props.onApprove}>APPROVE</button>
                  <button className="danger" onClick={props.onReject}>REJECT</button>
                  <button onClick={props.onValidate}>VALIDATE</button>
                </div>
              </div>
            )}
            {tab === 'PROPOSAL' && !props.proposal && <div className="notes">No active design transaction.</div>}
            {tab === 'VALIDATION' && (
              (props.findings?.length ? props.findings : [{ severity: 'INFO', code: 'graph', message: 'Graph validators: no findings. Not FEA.' }]).map((f, i) => (
                <div key={i} className={f.severity === 'ERROR' ? 'err' : 'notes'}>{f.severity} {f.code} {f.message}</div>
              ))
            )}
            {tab === 'ACTIVITY' && (
              <div className="notes">{(props.activity.length ? props.activity : ['No activity this session.']).slice(-16).map((n, i) => <p key={i}>{n}</p>)}</div>
            )}
          </div>
          <div className="quick">
            {LOCAL_COMMANDS.slice(0, 6).map((c) => (
              <button key={c} type="button" disabled={props.busy} onClick={() => props.onSend(c)}>{c}</button>
            ))}
          </div>
          <form className="agent-hud__cmd" onSubmit={(e) => { e.preventDefault(); props.onSend(props.msg); }}>
            <input value={props.msg} onChange={(e) => props.setMsg(e.target.value)} placeholder="engineering command…" />
            <button className="primary" disabled={props.busy}>SEND</button>
            {props.working && <button type="button" className="danger" onClick={() => props.onStop?.()}>STOP</button>}
          </form>
          <div
            className="agent-hud__resize"
            onPointerDown={(e) => {
              e.stopPropagation();
              const start = { x: e.clientX, y: e.clientY, w: geom.w, h: geom.h };
              function move(ev: PointerEvent) {
                setGeom((g) => clampGeom({ ...g, w: start.w + ev.clientX - start.x, h: start.h + ev.clientY - start.y }));
              }
              function up() {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
              }
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          />
        </>
      )}
    </div>
  );
}
