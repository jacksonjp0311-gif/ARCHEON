import { useMemo, useState } from 'react';
import type { DesignDocument } from '@archeon/design-protocol';
import type { TreeTab } from '@archeon/spatial-grammar';
import { groupPalette, searchPalette, semanticCatalog } from '../services/palette';
import { useUi } from '../store';

interface Props {
  document: DesignDocument;
}

type PageId = 'ALL' | TreeTab;

const PAGES: { id: PageId; label: string; detail: string; glyph: string }[] = [
  { id: 'ALL', label: 'Overview', detail: 'Project intelligence', glyph: '▦' },
  { id: 'SYSTEM', label: 'Systems', detail: 'Domain architecture', glyph: '⬡' },
  { id: 'ASSEMBLY', label: 'Assemblies', detail: 'Product structure', glyph: '▣' },
  { id: 'PARTS', label: 'Parts', detail: 'Physical components', glyph: '◇' },
  { id: 'FEATURES', label: 'Features', detail: 'Parametric definition', glyph: '⌗' },
  { id: 'JOINTS', label: 'Joints', detail: 'Kinematics & motion', glyph: '⦿' },
  { id: 'INTERFACES', label: 'Interfaces', detail: 'Ports & connections', glyph: '⇄' },
  { id: 'ANALYSIS', label: 'Analysis', detail: 'Evidence & results', glyph: '△' },
  { id: 'REQUIREMENTS', label: 'Requirements', detail: 'Intent & acceptance', glyph: '✓' }
];

function truthClass(value: string | null | undefined): string {
  const normalized = (value ?? 'UNVERIFIED').toUpperCase();
  if (normalized.includes('VALID') || normalized === 'SOURCE') return 'is-valid';
  if (normalized.includes('ASSUM')) return 'is-assumed';
  if (normalized.includes('UNSUPPORTED')) return 'is-unsupported';
  return 'is-unverified';
}

function PageHeading({ eyebrow, title, detail, count }: { eyebrow: string; title: string; detail: string; count: number }) {
  return (
    <header className="project-page__heading">
      <div><small>{eyebrow}</small><h2>{title}</h2><p>{detail}</p></div>
      <strong>{count}<span>ENTITIES</span></strong>
    </header>
  );
}

function EmptyDomain({ name }: { name: string }) {
  return (
    <div className="project-domain-empty">
      <span>⌁</span>
      <div><b>{name} domain scaffolded</b><p>Schema, agent tools, simulation evidence, and spatial layers will enter here when this discipline is activated.</p></div>
      <em>PLANNED</em>
    </div>
  );
}

export function ProjectBrowser({ document }: Props) {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<'MECHANICAL' | 'ELECTRICAL' | 'HYDRAULICS'>('MECHANICAL');
  const filter = useUi((s) => s.browserFilter) as PageId;
  const setFilter = useUi((s) => s.setBrowserFilter);
  const setTab = useUi((s) => s.setTreeTab);
  const setSelected = useUi((s) => s.setSelected);
  const setFocus = useUi((s) => s.setFocusId);
  const selectedId = useUi((s) => s.selectedId);
  const results = useMemo(() => groupPalette(searchPalette(query, semanticCatalog(document))), [query, document]);
  const activePage = PAGES.find((page) => page.id === filter) ?? PAGES[0];
  const materials = useMemo(() => new Map(document.materials.map((material) => [material.id, material])), [document.materials]);

  const counts: Record<PageId, number> = {
    ALL: document.systems.length + document.assemblies.length + document.parts.length,
    SYSTEM: document.systems.length,
    ASSEMBLY: document.assemblies.length,
    PARTS: document.parts.length,
    FEATURES: document.features.length,
    JOINTS: document.joints.length,
    INTERFACES: document.interfaces.length,
    ANALYSIS: document.analyses.length,
    REQUIREMENTS: document.requirements.length
  };

  function goTo(page: PageId) {
    setFilter(page);
    setTab(page === 'ALL' ? 'ASSEMBLY' : page);
  }

  function select(id: string, focusable = false) {
    setSelected(id);
    if (focusable) setFocus(id);
  }

  function pageContent() {
    if (domain !== 'MECHANICAL') return <EmptyDomain name={domain === 'ELECTRICAL' ? 'Electrical' : 'Hydraulics'} />;

    if (filter === 'SYSTEM') return <>
      <PageHeading eyebrow="ARCHITECTURE" title="Systems" detail="Top-level functional and physical domains in this project." count={document.systems.length} />
      <div className="entity-grid">
        {document.systems.map((system) => <button type="button" className={`entity-card ${selectedId === system.id ? 'is-selected' : ''}`} key={system.id} onClick={() => select(system.id)}>
          <span className="entity-card__glyph">⬡</span><span><small>SYSTEM</small><b>{system.name}</b><p>{system.id}</p></span><em className="is-generated">{system.provenance.class}</em>
        </button>)}
      </div>
    </>;

    if (filter === 'ASSEMBLY') return <>
      <PageHeading eyebrow="PRODUCT STRUCTURE" title="Assemblies" detail="Rigid groups, subassemblies, and their semantic responsibilities." count={document.assemblies.length} />
      <div className="entity-grid">
        {document.assemblies.map((assembly) => <button type="button" className={`entity-card ${selectedId === assembly.id ? 'is-selected' : ''}`} key={assembly.id} onClick={() => select(assembly.id, true)}>
          <span className="entity-card__glyph">▣</span><span><small>{assembly.semantic_role || 'ASSEMBLY'}</small><b>{assembly.name}</b><p>{assembly.children.length} children · {assembly.system ?? 'unassigned system'}</p></span><em>{assembly.provenance.class}</em>
        </button>)}
      </div>
    </>;

    if (filter === 'PARTS') return <>
      <PageHeading eyebrow="PHYSICAL DEFINITION" title="Parts" detail="Manufacturable components, material assignments, and geometry truth." count={document.parts.length} />
      <div className="entity-grid entity-grid--parts">
        {document.parts.map((part) => {
          const material = part.material ? materials.get(part.material) : null;
          const truth = part.spatial.cad?.truth ?? part.provenance.class;
          return <button type="button" className={`entity-card ${selectedId === part.id ? 'is-selected' : ''}`} key={part.id} onClick={() => select(part.id)}>
            <span className="entity-card__glyph">◇</span><span><small>{part.semantic_role || 'PART'}</small><b>{part.name}</b><p>{material?.name ?? 'Material unassigned'} · QTY {part.qty}</p></span><em className={truthClass(truth)}>{truth}</em>
          </button>;
        })}
      </div>
    </>;

    if (filter === 'FEATURES') return <>
      <PageHeading eyebrow="PARAMETRIC GRAPH" title="Features" detail="Dependent geometric operations and their host components." count={document.features.length} />
      <div className="entity-grid">
        {document.features.map((feature) => <button type="button" className={`entity-card ${selectedId === feature.id ? 'is-selected' : ''}`} key={feature.id} onClick={() => select(feature.id)}>
          <span className="entity-card__glyph">⌗</span><span><small>{feature.kind}</small><b>{feature.semantic_role || feature.id}</b><p>Host {feature.part} · {Object.keys(feature.params).length} parameters</p></span><em>{feature.provenance.class}</em>
        </button>)}
      </div>
    </>;

    if (filter === 'JOINTS') return <>
      <PageHeading eyebrow="KINEMATIC RUNTIME" title="Joints" detail="Pose controls, limits, axes, rotating groups, and load paths." count={document.joints.length} />
      <div className="entity-grid entity-grid--wide">
        {document.joints.map((joint) => <button type="button" className={`entity-card entity-card--joint ${selectedId === joint.id ? 'is-selected' : ''}`} key={joint.id} onClick={() => select(joint.id)}>
          <span className="entity-card__glyph">⦿</span><span><small>{joint.joint_type} · {joint.dof} DOF</small><b>{joint.name}</b><p>{joint.parent} → {joint.child}</p><i>AXIS [{joint.axis.join(', ')}] · {joint.limits ? `${joint.limits.lower}…${joint.limits.upper} ${joint.limits.unit}` : 'limits unverified'}</i></span><em className={joint.limits ? 'is-valid' : 'is-unverified'}>{joint.limits ? 'LIMITED' : 'UNVERIFIED'}</em>
        </button>)}
      </div>
    </>;

    if (filter === 'INTERFACES') return <>
      <PageHeading eyebrow="CONNECTION GRAPH" title="Interfaces" detail="Mechanical connections today; electrical and fluid connectivity next." count={document.interfaces.length} />
      <div className="entity-grid entity-grid--wide">
        {document.interfaces.map((item) => <button type="button" className={`entity-card ${selectedId === item.id ? 'is-selected' : ''}`} key={item.id} onClick={() => select(item.id)}>
          <span className="entity-card__glyph">⇄</span><span><small>{item.kind} · {item.semantic_role}</small><b>{item.name}</b><p>{item.a} ↔ {item.b}</p></span><em>{item.provenance.class}</em>
        </button>)}
      </div>
    </>;

    if (filter === 'ANALYSIS') return <>
      <PageHeading eyebrow="ENGINEERING EVIDENCE" title="Analysis" detail="Results remain qualified as validated, assumed, unverified, or unsupported." count={document.analyses.length} />
      <div className="entity-grid entity-grid--wide">
        {document.analyses.map((analysis) => <button type="button" className={`entity-card ${selectedId === analysis.id ? 'is-selected' : ''}`} key={analysis.id} onClick={() => select(analysis.id)}>
          <span className="entity-card__glyph">△</span><span><small>{analysis.kind}</small><b>{analysis.id}</b><p>{analysis.notes}</p></span><em className={truthClass(analysis.status)}>{analysis.status}</em>
        </button>)}
      </div>
    </>;

    if (filter === 'REQUIREMENTS') return <>
      <PageHeading eyebrow="DESIGN INTENT" title="Requirements" detail="Acceptance conditions linked to evidence and design decisions." count={document.requirements.length} />
      <div className="entity-grid entity-grid--wide">
        {document.requirements.map((requirement) => <button type="button" className={`entity-card ${selectedId === requirement.id ? 'is-selected' : ''}`} key={requirement.id} onClick={() => select(requirement.id)}>
          <span className="entity-card__glyph">✓</span><span><small>{requirement.id}</small><b>{requirement.text}</b><p>{requirement.acceptance} · {requirement.evidence.length} evidence links</p></span><em className={requirement.satisfied === true ? 'is-valid' : requirement.satisfied === false ? 'is-unsupported' : 'is-unverified'}>{requirement.satisfied === true ? 'SATISFIED' : requirement.satisfied === false ? 'FAILED' : 'UNVERIFIED'}</em>
        </button>)}
      </div>
    </>;

    return <>
      <PageHeading eyebrow="PROJECT INTELLIGENCE" title={document.project.name} detail={document.project.description || 'Spatial engineering project'} count={counts.ALL} />
      <div className="project-overview-metrics">
        <div><strong>{document.systems.length}</strong><span>SYSTEMS</span></div><div><strong>{document.assemblies.length}</strong><span>ASSEMBLIES</span></div><div><strong>{document.parts.length}</strong><span>PARTS</span></div><div><strong>{document.joints.length}</strong><span>JOINTS</span></div><div><strong>{document.interfaces.length}</strong><span>INTERFACES</span></div>
      </div>
      <section className="project-overview-section"><h3>PROJECT BASIS <span>{document.project.fidelity}</span></h3><dl><dt>Revision</dt><dd>{document.project.revision_id}</dd><dt>Branch</dt><dd>{document.project.branch}</dd><dt>Geometry kernel</dt><dd>{document.project.kernel}</dd><dt>Primary domain</dt><dd>{document.project.domain}</dd></dl></section>
      <section className="project-overview-section"><h3>DISCIPLINE READINESS <span>EXTENSIBLE ARCHITECTURE</span></h3><div className="domain-readiness"><div className="active"><b>MECHANICAL</b><span>ACTIVE · spatial + kinematic</span></div><div><b>ELECTRICAL</b><span>PLANNED · circuits + routing</span></div><div><b>HYDRAULICS</b><span>PLANNED · flow + pressure</span></div></div></section>
    </>;
  }

  return (
    <div className="project-browser">
      <header className="project-browser__top">
        <div><small>PROJECT / {document.project.revision_id}</small><strong>{document.project.name}</strong></div>
        <nav className="project-domains" aria-label="Engineering domains">
          {(['MECHANICAL', 'ELECTRICAL', 'HYDRAULICS'] as const).map((item) => <button key={item} type="button" className={`${domain === item ? 'active' : ''} ${item !== 'MECHANICAL' ? 'is-planned' : ''}`} onClick={() => setDomain(item)}><span>{item === 'MECHANICAL' ? '⚙' : item === 'ELECTRICAL' ? 'ϟ' : '≈'}</span>{item}<em>{item === 'MECHANICAL' ? 'ACTIVE' : 'PLANNED'}</em></button>)}
        </nav>
      </header>
      <div className="project-browser__body">
        <aside className="project-pages" aria-label="Project pages">
          <small>PROJECT PAGES</small>
          {PAGES.map((page) => <button key={page.id} type="button" className={filter === page.id ? 'active' : ''} onClick={() => goTo(page.id)}><span>{page.glyph}</span><span><b>{page.label}</b><em>{page.detail}</em></span><i>{counts[page.id]}</i></button>)}
        </aside>
        <main className="project-page">
          <div className="project-page__toolbar">
            <div><span>{activePage.glyph}</span><b>{activePage.label}</b><small>{domain}</small></div>
            <input aria-label="Search project intelligence" placeholder="Search project intelligence…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="project-page__content">
            {query.trim() ? <div className="project-search-results">
              <PageHeading eyebrow="SEMANTIC SEARCH" title={`Results for “${query}”`} detail="Searches entities, identifiers, roles, and engineering commands." count={Object.values(results).flat().length} />
              {Object.entries(results).map(([kind, items]) => <section key={kind}><h3>{kind}</h3>{items.map((item) => <button key={item.id} type="button" onClick={() => { if (item.focusId) setFocus(item.focusId); setSelected(item.id); }}><span>◇</span><span><b>{item.label}</b><small>{item.id}</small></span></button>)}</section>)}
            </div> : pageContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
