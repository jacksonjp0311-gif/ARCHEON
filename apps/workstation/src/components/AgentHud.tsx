import { useEffect, useState } from 'react';
import { AGENT_TABS, type AgentTab } from '@archeon/spatial-grammar';
import { useUi } from '../store';
import { HudShell } from './HudShell';
import type { ContextAction } from '../services/context';

const AGENTS = [
  ['architect', 'Architect'],
  ['assembly-designer', 'Assembly Designer'],
  ['components', 'Components'],
  ['cad-designer', 'CAD Designer'],
  ['constraint-engineer', 'Constraint Engineer'],
  ['dfm', 'DFM Reviewer'],
  ['critic', 'Critic'],
  ['spatial-director', 'Visual / Spatial Director'],
  ['analysis-engineer', 'Analysis Engineer'],
  ['bom', 'BOM'],
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
  variants?: { id: string; status: string; metrics?: { reach_m?: number | null; mass_kg?: number | null; mass_status?: string; clearance_m?: number | null; clearance_status?: string; note?: string }; assumptions?: string[]; unsupported_checks?: string[]; changed_interfaces?: string[]; changed_features?: string[] }[];
  onStop?: () => void;
  onAction?: (id: string) => void;
  quickActions?: ContextAction[];
}

export function AgentHud(props: Props) {
  const open = useUi((s) => s.hudOpen);
  const tab = useUi((s) => s.agentTab);
  const setOpen = useUi((s) => s.setHudOpen);
  const setTab = useUi((s) => s.setAgentTab);
  const [morph, setMorph] = useState(false);

  useEffect(() => {
    if (!open) {
      setMorph(false);
      return;
    }
    const id = requestAnimationFrame(() => setMorph(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const proposing = props.working ? 'WORKING' : props.proposal ? 'PROPOSAL ACTIVE' : 'IDLE';
  const active = props.working ? 'CAD DESIGNER' : (props.proposal?.transaction.agent_id ?? 'spatial-director');

  if (!open) {
    return (
      <button type="button" className={`agent-fab ${props.working ? 'is-working' : ''} ${props.proposal ? 'is-decide' : ''}`} onClick={() => setOpen(true)} title="Open ARCHEON Agent">
        ◈ ARCHEON{props.working ? ' ●' : props.proposal ? ' !' : ''}
      </button>
    );
  }

  const title = (
    <>
      ◈ ARCHEON
      <small>
        {props.contextName ? `CONTEXT ${props.contextName}` : `ACTIVE ${String(active).toUpperCase()}`} · {proposing}
        {props.cadStatus ? ` · CAD ${props.cadStatus}` : ''}
      </small>
    </>
  );

  return (
    <HudShell id="agent" title={title} className={`agent-hud ${morph ? 'is-open' : ''}`} morph={morph}>
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
                      <li key={s.n}><span className={s.status === 'COMPLETE' ? 'ok' : s.status === 'RUNNING' || s.status === 'WORKING' ? 'run' : 'notes'}>{s.status === 'COMPLETE' ? '✓' : s.status === 'WAITING' || s.status === 'NOT_CHECKED' ? '○' : '●'}</span> {s.name} <small>{s.status}{s.note ? ` · ${s.note}` : ''}</small></li>
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
                <span
                  className={
                    id === 'cad-designer' && props.working
                      ? 'tone-agent'
                      : id === active && props.proposal
                        ? 'tone-agent'
                        : 'idle'
                  }
                >
                  {id === 'cad-designer' && props.working ? 'WORKING' : id === active && props.proposal ? 'PROPOSING' : 'IDLE'}
                </span>
              </div>
            ))}
            {props.variants && props.variants.length > 0 && tab === 'PLAN' && (
              <div className="variant-list">
                {props.variants.map((v) => (
                  <div className="variant-card" key={v.id}>
                    <b>VARIANT {v.id} · {v.status}</b>
                    <span>REACH {v.metrics?.reach_m != null ? `${Math.round(v.metrics.reach_m * 1000)} mm · DERIVED` : 'UNVERIFIED'}</span>
                    <span>MASS {v.metrics?.mass_kg != null ? `${v.metrics.mass_kg.toFixed(3)} kg · ${v.metrics.mass_status ?? 'ASSUMED'}` : 'UNVERIFIED'}</span>
                    <span>CLEARANCE {v.metrics?.clearance_m != null ? `${(v.metrics.clearance_m * 1000).toFixed(2)} mm` : v.metrics?.clearance_status ?? 'UNVERIFIED'}</span>
                    <small>FEATURE CHANGES {v.changed_features?.join(', ') || 'NONE'} · INTERFACE CHANGES {v.changed_interfaces?.join(', ') || 'NONE'}</small>
                    <small>{v.unsupported_checks?.length ? `UNSUPPORTED ${v.unsupported_checks.join(' · ')}` : v.metrics?.note}</small>
                    <div className="row"><button type="button" onClick={() => props.onAction?.(`variant:${v.id}`)}>PREVIEW</button><button className="primary" type="button" onClick={() => props.onAction?.(`propose_variant:${v.id}`)}>PROPOSE FOR APPROVAL</button></div>
                  </div>
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
                <h3>PROPOSAL · {props.proposal.transaction.status}</h3>
                <div className="intent">{props.proposal.transaction.intent}</div>
                <div className="notes">{props.proposal.transaction.reason}</div>
                <div>Affected {props.proposal.transaction.requirements.length ? props.proposal.transaction.requirements.map((r) => <span key={r} className="req"> {r}</span>) : ' —'}</div>
                {props.propReach != null && (
                  <div className="delta">{props.reachMm} → {props.propReach} mm <span className="tone-prov">DERIVED</span></div>
                )}
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
            {(props.quickActions ?? []).slice(0, 6).map((a) => (
              <button
                key={a.id}
                type="button"
                className={a.ask ? 'ask' : ''}
                disabled={props.busy}
                title={a.title}
                onClick={() => (a.id === 'ask' ? props.onSend('what is this') : props.onAction?.(a.id))}
              >
                {a.label}
              </button>
            ))}
          </div>
          <form className="agent-hud__cmd" onSubmit={(e) => { e.preventDefault(); props.onSend(props.msg); }}>
            <input value={props.msg} onChange={(e) => props.setMsg(e.target.value)} placeholder="ASK ARCHEON…" />
            <button className="primary" disabled={props.busy}>SEND</button>
            {props.working && <button type="button" className="danger" onClick={() => props.onStop?.()}>STOP</button>}
          </form>
    </HudShell>
  );
}
