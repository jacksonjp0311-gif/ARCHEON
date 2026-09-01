import { breadcrumbs } from '../services/hudManager';
import { useUi } from '../store';

interface Props {
  projectName: string;
  parts: { id: string; name: string; parent: string | null }[];
  assemblies: { id: string; name: string; parent: string | null }[];
}

export function Breadcrumbs({ projectName, parts, assemblies }: Props) {
  const selectedId = useUi((s) => s.selectedId);
  const setSelected = useUi((s) => s.setSelected);
  const crumbs = breadcrumbs(selectedId, projectName, parts, assemblies);
  return (
    <nav className="crumbs" aria-label="location">
      {crumbs.map((c, i) => (
        <span key={c.id + i}>
          {i > 0 && <i>›</i>}
          <button type="button" onClick={() => c.id !== 'project' && setSelected(c.id)}>{c.name}</button>
        </span>
      ))}
    </nav>
  );
}
