import { useUi } from '../store';
import type { Part, Requirement } from '@archeon/design-protocol';

const TABS = ['FEATURES', 'BOM', 'MATES', 'ANALYSIS', 'VALIDATION', 'TRANSACTIONS', 'HISTORY'] as const;

interface Props {
  doc: {
    parts: Part[];
    features: { id: string; part: string; kind: string; semantic_role: string }[];
    interfaces: { id: string; name: string; kind: string; a: string; b: string; semantic_role: string }[];
    requirements: Requirement[];
    project: { revision_id: string };
  } | null;
  reachMm: string | number;
  val: { findings?: { severity: string; code: string; entity?: string; message: string }[]; error_count?: number } | null;
  ledger: { items: { transaction_id: string; status: string; intent: string; agent_id: string }[] };
  hash?: string;
  provider?: string;
}

export function Workbench({ doc, reachMm, val, ledger, hash, provider }: Props) {
  const open = useUi((s) => s.workbenchOpen);
  const setOpen = useUi((s) => s.setWorkbenchOpen);
  const dockTab = useUi((s) => s.dockTab);
  const setDock = useUi((s) => s.setDockTab);
  const setSelected = useUi((s) => s.setSelected);
  const sectionOn = useUi((s) => s.sectionOn);
  const setSectionOn = useUi((s) => s.setSectionOn);

  const tab = (TABS as readonly string[]).includes(dockTab) ? dockTab : dockTab === 'FEATURE TREE' ? 'FEATURES' : dockTab === 'TIMELINE' ? 'HISTORY' : 'BOM';

  return (
    <footer className={`workbench ${open ? 'is-open' : ''}`}>
      <button type="button" className="workbench__toggle" onClick={() => setOpen(!open)}>
        WORKBENCH {open ? '▾' : '▴'} · {tab}
      </button>
      {open && (
        <>
          <div className="tabs">
            {TABS.map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setDock(t === 'FEATURES' ? 'FEATURE TREE' : t === 'HISTORY' ? 'TIMELINE' : t)}>{t}</button>
            ))}
          </div>
          <div className="dock-body">
            {tab === 'BOM' && (
              <table>
                <thead><tr><th>NAME</th><th>PN / ID</th><th>QTY</th><th>MATERIAL</th><th>COST</th></tr></thead>
                <tbody>
                  {doc?.parts.map((p) => (
                    <tr key={p.id} onClick={() => setSelected(p.id)}>
                      <td>{p.name}</td><td>{p.id}</td><td>{p.qty}</td><td>{p.material ?? '—'}</td>
                      <td className="warn">UNVERIFIED · catalog not connected</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'MATES' && (
              <table>
                <thead><tr><th>INTERFACE</th><th>KIND</th><th>A</th><th>B</th></tr></thead>
                <tbody>
                  {doc?.interfaces.map((i) => (
                    <tr key={i.id} onClick={() => setSelected(i.id)}>
                      <td>{i.name}</td><td>{i.kind}</td><td>{i.a}</td><td>{i.b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'FEATURES' && (
              <table>
                <thead><tr><th>FEATURE</th><th>PART</th><th>KIND</th></tr></thead>
                <tbody>
                  {doc?.features.map((f) => (
                    <tr key={f.id} onClick={() => setSelected(f.part)}><td>{f.id}</td><td>{f.part}</td><td>{f.kind}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'ANALYSIS' && (
              <div className="notes">
                Reach DERIVED from link lengths: {reachMm} mm. Payload 3 kg is UNVERIFIED. No FEA in this build.
                <div>
                  <button type="button" onClick={() => setSectionOn(!sectionOn)}>SECTION PLANE {sectionOn ? 'ON' : 'OFF'}</button>
                  <span> visualization only</span>
                </div>
              </div>
            )}
            {tab === 'TRANSACTIONS' && (
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
            {tab === 'VALIDATION' && (
              <table>
                <thead><tr><th>SEV</th><th>CODE</th><th>ENTITY</th><th>MESSAGE</th></tr></thead>
                <tbody>
                  {(val?.findings ?? []).map((f, i) => (
                    <tr key={i}><td className={f.severity === 'ERROR' ? 'err' : 'warn'}>{f.severity}</td><td>{f.code}</td><td>{f.entity}</td><td>{f.message}</td></tr>
                  ))}
                  {(val?.findings?.length ?? 0) === 0 && <tr><td colSpan={4} className="ok">Graph validators: no findings. Not FEA.</td></tr>}
                </tbody>
              </table>
            )}
            {tab === 'HISTORY' && (
              <div className="notes">Revision {doc?.project.revision_id}. Hash {hash}. {provider}</div>
            )}
          </div>
        </>
      )}
    </footer>
  );
}
