import { useMemo, useState } from 'react';
import { TREE_TABS, type TreeTab } from '@archeon/spatial-grammar';
import { useUi } from '../store';
import type { Part, Requirement } from '@archeon/design-protocol';

interface Node {
  id: string;
  name: string;
  role?: string;
  prov?: string;
  children?: Node[];
}

interface Props {
  parts: Part[];
  assemblies: { id: string; name: string; parent: string | null; children?: string[]; semantic_role: string }[];
  features: { id: string; part: string; kind: string; semantic_role: string }[];
  interfaces: { id: string; name: string; kind: string; semantic_role: string }[];
  requirements: Requirement[];
}

function glyph(prov?: string): string {
  if (prov === 'UNVERIFIED') return '?';
  if (prov === 'ASSUMED') return '◇';
  if (prov === 'USER_LOCKED') return 'L';
  if (prov === 'DERIVED' || prov === 'SOURCE' || prov === 'GENERATED') return '✓';
  return '·';
}

function TreeNode({ node, depth }: { node: Node; depth: number }) {
  const selected = useUi((s) => s.selectedId);
  const toggle = useUi((s) => s.toggleSelected);
  const [open, setOpen] = useState(depth < 2);
  const has = !!node.children?.length;
  return (
    <div>
      <div
        className={`tree-item ${selected === node.id ? 'sel' : ''}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => toggle(node.id)}
      >
        {has && (
          <button type="button" className="twirl" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
            {open ? '▾' : '▸'}
          </button>
        )}
        <span className="g">{glyph(node.prov)}</span>
        {node.name}
        {node.role && <span className="role">{node.role}</span>}
      </div>
      {has && open && node.children!.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} />)}
    </div>
  );
}

export function Navigator({ parts, assemblies, features, interfaces, requirements, embedded }: Props & { embedded?: boolean }) {
  const tab = useUi((s) => s.treeTab);
  const setTab = useUi((s) => s.setTreeTab);

  const nodes = useMemo<Node[]>(() => {
    if (tab === 'ASSEMBLY' || tab === 'SYSTEM') {
      const byParent = new Map<string | null, typeof assemblies>();
      for (const a of assemblies) {
        const k = a.parent;
        const list = byParent.get(k) ?? [];
        list.push(a);
        byParent.set(k, list);
      }
      const walk = (parent: string | null): Node[] =>
        (byParent.get(parent) ?? []).map((a) => {
          const childAsms = walk(a.id);
          const childParts = parts.filter((p) => p.parent === a.id).map((p) => ({
            id: p.id,
            name: p.name,
            role: p.semantic_role,
            prov: p.provenance.class
          }));
          return {
            id: a.id,
            name: a.name,
            role: a.semantic_role,
            children: [...childAsms, ...childParts]
          };
        });
      const roots = walk(null);
      return roots.length ? roots : assemblies.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.semantic_role,
        children: parts.filter((p) => p.parent === a.id).map((p) => ({
          id: p.id, name: p.name, role: p.semantic_role, prov: p.provenance.class
        }))
      }));
    }
    if (tab === 'FEATURES') return features.map((f) => ({ id: f.id, name: f.id, role: `${f.kind} · ${f.part}` }));
    if (tab === 'JOINTS') return interfaces.filter((i) => i.kind === 'mechanical').map((i) => ({ id: i.id, name: i.name, role: i.semantic_role }));
    if (tab === 'INTERFACES') return interfaces.map((i) => ({ id: i.id, name: i.name, role: i.semantic_role }));
    if (tab === 'ANALYSIS') return [{ id: 'an.reach', name: 'Reach (link-sum)', role: 'DERIVED · not FEA' }];
    if (tab === 'REQUIREMENTS') {
      return requirements.map((r) => ({
        id: r.id,
        name: r.id,
        role: r.satisfied === true ? 'DERIVED/OK' : 'UNVERIFIED',
        prov: r.provenance.class
      }));
    }
    return parts.map((p) => ({ id: p.id, name: p.name, role: p.semantic_role, prov: p.provenance.class }));
  }, [tab, parts, assemblies, features, interfaces, requirements]);

  return (
    <aside className={embedded ? 'tree tree--embed' : 'tree'}>
      {!embedded && <h2>ENGINEERING NAVIGATOR</h2>}
      {!embedded && (
        <div className="tabs">
          {TREE_TABS.map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t as TreeTab)}>{t}</button>
          ))}
        </div>
      )}
      <div className="tree-body">
        {nodes.map((n) => <TreeNode key={n.id} node={n} depth={0} />)}
      </div>
    </aside>
  );
}
