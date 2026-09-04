import { useEffect, useMemo, useState } from 'react';
import type { Material } from '@archeon/design-protocol';
import { getJson } from '../api';
import { useUi } from '../store';

interface LibraryPattern {
  id: string;
  name: string;
  domains: string[];
  intent: string;
  required_inputs: string[];
  checks: string[];
  truth: string;
}

interface RefinedPart {
  part?: { id?: string; name?: string; semantic_role?: string; material?: string };
  source?: { project_name?: string; revision_id?: string };
  validation?: { status?: string; note?: string };
  truth?: string;
}

interface LibraryResponse {
  components: unknown[];
  materials: Material[];
  patterns: LibraryPattern[];
  refined_parts: RefinedPart[];
  policy: string;
}

type LibraryTab = 'ALL' | 'REFINED' | 'PATTERNS' | 'MATERIALS';

function objectName(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Record<string, unknown>;
  return String(record.name ?? record.id ?? fallback);
}

export function EngineeringLibrary() {
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<LibraryTab>('ALL');

  useEffect(() => {
    let alive = true;
    getJson<LibraryResponse>('/api/library')
      .then((data) => { if (alive) setLibrary(data); })
      .catch((reason: unknown) => { if (alive) setError(reason instanceof Error ? reason.message : 'Library unavailable'); });
    return () => { alive = false; };
  }, []);

  const q = query.trim().toLowerCase();
  const patterns = useMemo(() => (library?.patterns ?? []).filter((item) => JSON.stringify(item).toLowerCase().includes(q)), [library, q]);
  const refined = useMemo(() => (library?.refined_parts ?? []).filter((item) => JSON.stringify(item).toLowerCase().includes(q)), [library, q]);
  const materials = useMemo(() => (library?.materials ?? []).filter((item) => JSON.stringify(item).toLowerCase().includes(q)), [library, q]);
  const components = useMemo(() => (library?.components ?? []).filter((item) => JSON.stringify(item).toLowerCase().includes(q)), [library, q]);

  function inspectPart(part: RefinedPart) {
    const id = part.part?.id;
    if (!id) return;
    const ui = useUi.getState();
    ui.setSelected(id);
    ui.openHud('inspector');
  }

  if (error) return <div className="library-empty"><b>LIBRARY OFFLINE</b><span>{error}</span></div>;
  if (!library) return <div className="library-empty"><b>INDEXING ENGINEERING CONTEXT…</b></div>;

  return (
    <div className="engineering-library">
      <div className="library-summary">
        <div><strong>{refined.length}</strong><span>REFINED</span></div>
        <div><strong>{patterns.length}</strong><span>PATTERNS</span></div>
        <div><strong>{materials.length}</strong><span>MATERIALS</span></div>
        <div><strong>{components.length}</strong><span>COMPONENTS</span></div>
      </div>
      <div className="library-tools">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search parts, patterns, materials…" aria-label="Search engineering library" />
        <nav aria-label="Library filters">
          {(['ALL', 'REFINED', 'PATTERNS', 'MATERIALS'] as LibraryTab[]).map((item) => (
            <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>
          ))}
        </nav>
      </div>
      <div className="library-policy"><b>CONTEXT, NOT AUTHORITY</b><span>{library.policy}</span></div>

      {(tab === 'ALL' || tab === 'REFINED') && refined.length > 0 && (
        <section className="library-section">
          <h3>REFINED PARTS <span>REVISION LINKED</span></h3>
          {refined.map((item, index) => (
            <button className="library-card" type="button" key={`${item.part?.id ?? 'part'}-${index}`} onClick={() => inspectPart(item)}>
              <span className="library-card__glyph">◇</span>
              <span><strong>{item.part?.name ?? item.part?.id ?? 'Refined part'}</strong><small>{item.part?.semantic_role ?? 'component'} · {item.source?.project_name ?? 'project'} / {item.source?.revision_id ?? 'revision'}</small></span>
              <em className={`truth truth--${(item.validation?.status ?? 'UNVERIFIED').toLowerCase()}`}>{item.validation?.status ?? item.truth ?? 'UNVERIFIED'}</em>
            </button>
          ))}
        </section>
      )}

      {(tab === 'ALL' || tab === 'PATTERNS') && patterns.length > 0 && (
        <section className="library-section">
          <h3>ENGINEERING PATTERNS <span>REVALIDATE ON USE</span></h3>
          {patterns.map((item) => (
            <article className="library-card library-card--detail" key={item.id}>
              <span className="library-card__glyph">▤</span>
              <span><strong>{item.name}</strong><small>{item.intent}</small><i>{item.domains.join(' · ')}</i></span>
              <em>{item.checks.length} CHECKS</em>
            </article>
          ))}
        </section>
      )}

      {(tab === 'ALL' || tab === 'MATERIALS') && materials.length > 0 && (
        <section className="library-section">
          <h3>MATERIALS <span>SOURCE + ASSUMPTIONS</span></h3>
          {materials.map((item) => (
            <article className="library-card" key={item.id}>
              <span className="library-card__glyph">⬡</span>
              <span><strong>{item.name}</strong><small>{item.appearance} · {item.density_kg_m3 == null ? 'density unverified' : `${item.density_kg_m3} kg/m³`}</small></span>
              <em>{item.provenance?.class ?? 'UNVERIFIED'}</em>
            </article>
          ))}
        </section>
      )}

      {tab === 'ALL' && components.length > 0 && (
        <section className="library-section">
          <h3>CATALOG COMPONENTS</h3>
          {components.map((item, index) => <article className="library-card" key={index}><span className="library-card__glyph">□</span><span><strong>{objectName(item, `Component ${index + 1}`)}</strong><small>Reusable candidate component</small></span></article>)}
        </section>
      )}
    </div>
  );
}
