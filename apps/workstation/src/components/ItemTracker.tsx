import { useUi } from '../store';
import type { Part, Requirement } from '@archeon/design-protocol';

interface Props {
  parts: Part[];
  assemblies: { id: string; name: string }[];
  requirements: Requirement[];
  proposalIds: string[];
}

function kindOf(id: string): string {
  if (id.startsWith('req.')) return 'REQUIREMENT';
  if (id.startsWith('asm.')) return 'ASSEMBLY';
  if (id.startsWith('iface.') || id.startsWith('mate.')) return 'INTERFACE';
  if (id.startsWith('an.')) return 'ANALYSIS';
  return 'PART';
}

export function ItemTracker({ parts, assemblies, requirements, proposalIds }: Props) {
  const tracked = useUi((s) => s.trackedIds);
  const selectedId = useUi((s) => s.selectedId);
  const setSelected = useUi((s) => s.setSelected);
  const untrack = useUi((s) => s.untrack);
  const expanded = useUi((s) => s.trackerExpanded);
  const setExpanded = useUi((s) => s.setTrackerExpanded);

  function label(id: string): string {
    return parts.find((p) => p.id === id)?.name
      ?? assemblies.find((a) => a.id === id)?.name
      ?? requirements.find((r) => r.id === id)?.id
      ?? id;
  }

  function status(id: string): string {
    const part = parts.find((p) => p.id === id);
    if (proposalIds.includes(id) || proposalIds.some((x) => id.includes(x))) return 'Δ PROPOSAL';
    if (part?.provenance.class === 'UNVERIFIED' || part?.provenance.class === 'ASSUMED') return part.provenance.class;
    const req = requirements.find((r) => r.id === id);
    if (req) return req.satisfied === true ? 'DERIVED' : req.provenance.class;
    return 'WATCH';
  }

  if (!expanded && tracked.length === 0) {
    return (
      <button type="button" className="tracker-chip" onClick={() => setExpanded(true)}>☆ TRACKED 0</button>
    );
  }

  return (
    <section className="rail-panel tracker">
      <h2>
        ☆ TRACKED {tracked.length}
        <button type="button" onClick={() => setExpanded(false)} title="Collapse">—</button>
      </h2>
      {tracked.length === 0 && <p className="empty">Nothing tracked.<br />Track important parts, requirements, or interfaces while you work.</p>}
      {tracked.map((id) => (
        <button
          key={id}
          type="button"
          className={`tracker-item ${selectedId === id ? 'sel' : ''} ${status(id).includes('PROPOSAL') ? 'delta' : ''}`}
          onClick={() => setSelected(id)}
        >
          <span className="dot" />
          <span>
            <b>{label(id)}</b>
            <small>{kindOf(id)} · {status(id)}</small>
          </span>
          <i onClick={(e) => { e.stopPropagation(); untrack(id); }}>×</i>
        </button>
      ))}
    </section>
  );
}
