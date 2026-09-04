import type { DesignDocument } from '@archeon/design-protocol';

export type EntityKind =
  | 'part'
  | 'assembly'
  | 'joint'
  | 'interface'
  | 'requirement'
  | 'feature'
  | 'mate'
  | 'proposal'
  | 'none';

export interface ContextAction {
  id: string;
  label: string;
  title: string;
  ask?: boolean;
}

export interface EntityContext {
  kind: EntityKind;
  id: string | null;
  name: string;
  role: string;
}

export interface ReasoningSummary {
  action: string;
  why: string;
  affected: string[];
  validation: string;
  next: string[];
}

function roleOf(part: { semantic_role?: string; id: string; name: string }): string {
  return `${part.semantic_role ?? ''} ${part.id} ${part.name}`.toLowerCase();
}

export function classifyEntity(id: string | null, doc: DesignDocument | null, proposal = false): EntityContext {
  if (proposal) return { kind: 'proposal', id, name: 'Proposal', role: 'dtp' };
  if (!id || !doc) return { kind: 'none', id: null, name: '', role: '' };
  const part = doc.parts.find((p) => p.id === id);
  if (part) return { kind: 'part', id, name: part.name, role: part.semantic_role };
  const asm = doc.assemblies.find((a) => a.id === id);
  if (asm) return { kind: 'assembly', id, name: asm.name, role: asm.semantic_role };
  const joint = doc.joints.find((j) => j.id === id);
  if (joint) return { kind: 'joint', id, name: joint.name, role: joint.joint_type };
  const iface = doc.interfaces.find((i) => i.id === id);
  if (iface) return { kind: 'interface', id, name: iface.name, role: iface.kind };
  const req = doc.requirements.find((r) => r.id === id);
  if (req) return { kind: 'requirement', id, name: req.text, role: req.quantity ?? '' };
  const feat = doc.features.find((f) => f.id === id);
  if (feat) return { kind: 'feature', id, name: feat.semantic_role || feat.id, role: feat.kind };
  const mate = doc.mates.find((m) => m.id === id);
  if (mate) return { kind: 'mate', id, name: `${mate.kind} mate`, role: mate.state };
  return { kind: 'none', id, name: id, role: '' };
}

function unique(actions: ContextAction[]): ContextAction[] {
  const seen = new Set<string>();
  return actions.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

function ask(): ContextAction {
  return { id: 'ask', label: 'ASK ARCHEON', title: 'Ask ARCHEON about this object.', ask: true };
}

export function contextActionsFor(ctx: EntityContext, doc: DesignDocument | null): ContextAction[] {
  if (ctx.kind === 'proposal') {
    return [
      { id: 'compare', label: 'COMPARE', title: 'Overlay proposal geometry.' },
      { id: 'validate', label: 'VALIDATE', title: 'Run graph validators. Not FEA.' },
      { id: 'approve', label: 'APPROVE', title: 'Human COMMIT.' },
      { id: 'reject', label: 'REJECT', title: 'Discard the proposal. Canonical unchanged.' }
    ];
  }
  if (ctx.kind === 'none' || !ctx.id) {
    return [
      { id: 'home', label: 'HOME', title: 'Assembled home view.' },
      { id: 'fit', label: 'FIT', title: 'Fit the whole machine.' },
      ask()
    ];
  }
  if (ctx.kind === 'joint') {
    return unique([
      { id: 'show-axis', label: 'SHOW AXIS', title: 'Draw the declared joint axis. DECLARED, not solved kinematics.' },
      { id: 'show-motion', label: 'SHOW MOTION', title: 'Highlight the rotating group. DECLARED.' },
      { id: 'show-load', label: 'SHOW LOAD PATH', title: 'Declared load path. Not FEA.' },
      { id: 'show-stack', label: 'OPEN STACK', title: 'Isolate the declared component stack.' },
      { id: 'explode', label: 'EXPLODE', title: 'Explode the joint context.' },
      { id: 'focus', label: 'INSPECT', title: 'Frame the joint child.' },
      ask()
    ]);
  }
  if (ctx.kind === 'requirement') {
    return unique([
      { id: 'affected', label: 'SHOW AFFECTED', title: 'Ghost unrelated systems.' },
      { id: 'show-evidence', label: 'SHOW EVIDENCE', title: 'Open provenance / evidence.' },
      { id: 'track', label: 'TRACK', title: 'Watch this requirement.' },
      ask()
    ]);
  }
  if (ctx.kind === 'interface' || ctx.kind === 'mate') {
    return unique([
      { id: 'interfaces', label: 'CONNECTIONS', title: 'Show the local interface neighborhood.' },
      { id: 'show-mate', label: 'SHOW MATE', title: 'Highlight connected hosts.' },
      { id: 'track', label: 'TRACK', title: 'Watch this connection.' },
      ask()
    ]);
  }
  if (ctx.kind === 'assembly') {
    return unique([
      { id: 'focus', label: 'FOCUS', title: 'Frame this assembly.' },
      { id: 'explode', label: 'EXPLODE', title: 'Explode this assembly only.' },
      { id: 'open', label: 'OPEN', title: 'Ghost the housing and reveal internals. Display only.' },
      { id: 'show-stack', label: 'SHOW INTERNALS', title: 'Isolate the internal stack.' },
      { id: 'interfaces', label: 'CONNECTIONS', title: 'Show local connections.' },
      { id: 'service', label: 'SERVICE', title: 'Declared service cover and extraction path.' },
      ask()
    ]);
  }

  const part = doc?.parts.find((p) => p.id === ctx.id);
  const hay = part ? roleOf(part) : ctx.role.toLowerCase();
  const actions: ContextAction[] = [
    { id: 'focus', label: 'FOCUS', title: 'Frame selected object.' },
    { id: 'isolate', label: 'ISOLATE', title: 'Hide unrelated objects temporarily.' }
  ];
  if (hay.includes('hous') || hay.includes('cover') || hay.includes('shell')) {
    actions.push({ id: 'open', label: 'OPEN', title: 'Ghost this housing and reveal internals. Display only.' });
    actions.push({ id: 'show-stack', label: 'SHOW INTERNALS', title: 'Isolate the internal stack.' });
    actions.push({ id: 'section', label: 'SECTION', title: 'Visualization clip plane. Does not modify CAD.' });
  }
  if (hay.includes('bearing')) {
    actions.push({ id: 'show-stack', label: 'SHOW SHAFT', title: 'Isolate shaft / bearing stack. DECLARED.' });
    actions.push({ id: 'show-mate', label: 'SHOW MATE', title: 'Highlight bearing seats and journals.' });
    actions.push({ id: 'measure', label: 'MEASURE SEAT', title: 'DesignIR envelope. Not a CMM.' });
    actions.push({ id: 'show-load', label: 'WHY THIS BEARING?', title: 'Declared load role. Not FEA.' });
  }
  if (hay.includes('motor') || hay.includes('gearbox') || hay.includes('shaft')) {
    actions.push({ id: 'show-stack', label: 'SHOW STACK', title: 'Motor → gearbox → shaft → bearings. DECLARED.' });
    actions.push({ id: 'service', label: 'SERVICE', title: 'Declared cover, fasteners, extraction path.' });
  }
  if (hay.includes('bolt') || hay.includes('fastener') || hay.includes('screw')) {
    actions.push({ id: 'show-fasteners', label: 'SHOW HOST', title: 'Highlight the fastener group host.' });
  }
  if (hay.includes('cover')) {
    actions.push({ id: 'show-fasteners', label: 'WHAT HOLDS THIS?', title: 'Declared fastener group. ASSUMED threads.' });
    actions.push({ id: 'service', label: 'SERVICE', title: 'Removal direction if declared.' });
  }
  actions.push(
    { id: 'measure', label: 'MEASURE', title: 'Envelope dimensions from DesignIR. Not a CMM.' },
    { id: 'interfaces', label: 'CONNECTIONS', title: 'Show local connections.' },
    { id: 'track', label: 'TRACK', title: 'Keep this engineering entity monitored.' },
    ask()
  );
  return unique(actions);
}

/** Backward-compatible kind-only list used by older call sites. */
export function contextActions(kind: EntityKind): ContextAction[] {
  const ctx: EntityContext = { kind, id: kind === 'none' ? null : kind, name: kind, role: kind };
  return contextActionsFor(ctx, null);
}

export function primaryActions(actions: ContextAction[], limit = 6): ContextAction[] {
  const askLast = actions.filter((a) => a.ask);
  const rest = actions.filter((a) => !a.ask);
  const head = rest.slice(0, Math.max(1, limit - (askLast.length ? 1 : 0) - 1));
  const out = [...head];
  if (rest.length > head.length) out.push({ id: 'more', label: 'MORE', title: 'Open the inspector for the full graph.' });
  out.push(...askLast);
  return unique(out);
}

export function ancestorIds(
  id: string | null,
  parts: { id: string; parent: string | null }[],
  assemblies: { id: string; parent: string | null }[]
): string[] {
  if (!id) return [];
  const out: string[] = [];
  let pid: string | null = id;
  const seen = new Set<string>();
  while (pid && !seen.has(pid) && out.length < 12) {
    seen.add(pid);
    out.push(pid);
    const part = parts.find((p) => p.id === pid);
    const asm = assemblies.find((a) => a.id === pid);
    pid = part?.parent ?? asm?.parent ?? null;
  }
  return out;
}

export function jointFor(doc: DesignDocument | null, id: string | null) {
  if (!doc || !id) return null;
  const kids = new Set(doc.parts.filter((p) => p.parent === id).map((p) => p.id));
  return (
    doc.joints.find(
      (j) =>
        j.id === id ||
        j.parent === id ||
        j.child === id ||
        j.rotating_group.includes(id) ||
        j.load_path.includes(id) ||
        [...j.rotating_group, ...j.load_path].some((m) => kids.has(m))
    ) ?? null
  );
}

export function componentStack(doc: DesignDocument | null, id: string | null): string[] {
  const joint = jointFor(doc, id);
  if (joint?.load_path.length) return joint.load_path;
  if (!doc || !id) return [];
  const parent = doc.parts.find((p) => p.id === id)?.parent ?? id;
  return doc.parts
    .filter((p) => p.parent === parent)
    .sort((a, b) => a.spatial.assembly_stage - b.spatial.assembly_stage)
    .map((p) => p.id);
}

export function declaredLoadPath(doc: DesignDocument | null, id: string | null): string[] {
  return jointFor(doc, id)?.load_path ?? [];
}

export function rotatingGroup(doc: DesignDocument | null, id: string | null): string[] {
  return jointFor(doc, id)?.rotating_group ?? [];
}

export function serviceSequence(doc: DesignDocument | null, id: string | null): string[] {
  if (!doc || !id) return [];
  const scope = doc.parts.find((p) => p.id === id)?.parent ?? id;
  return doc.parts
    .filter((p) => {
      const role = `${p.semantic_role} ${p.id}`.toLowerCase();
      return (
        p.parent === scope &&
        (role.includes('cover') ||
          role.includes('service') ||
          role.includes('bolt') ||
          role.includes('fastener') ||
          p.spatial.service_path.length >= 2)
      );
    })
    .sort((a, b) => a.spatial.assembly_stage - b.spatial.assembly_stage)
    .map((p) => p.id);
}

export function fastenerHosts(doc: DesignDocument | null, id: string | null): string[] {
  if (!doc || !id) return [];
  const groups = doc.fastener_groups ?? [];
  const hit = groups.filter(
    (g) => g.host === id || g.instance_ids.includes(id) || (g.host && id.includes('cover') && g.id.includes('cover'))
  );
  if (!hit.length) {
    return doc.parts.filter((p) => p.id.includes('bolt') && (p.parent === doc.parts.find((x) => x.id === id)?.parent || p.id === id)).map((p) => p.id);
  }
  const ids = new Set<string>();
  for (const g of hit) {
    ids.add(g.host);
    for (const inst of g.instance_ids) ids.add(inst);
  }
  return [...ids];
}

export function openTargets(doc: DesignDocument | null, id: string | null): string[] {
  if (!doc || !id) return [];
  const part = doc.parts.find((p) => p.id === id);
  const scope = part?.parent ?? (doc.assemblies.some((a) => a.id === id) ? id : null);
  if (!scope) return part && roleOf(part).includes('hous') ? [part.id] : [];
  return doc.parts
    .filter((p) => p.parent === scope && /hous|cover|shell/.test(roleOf(p)))
    .map((p) => p.id);
}

export function reasoningSummary(ctx: EntityContext, doc: DesignDocument | null): ReasoningSummary {
  const joint = jointFor(doc, ctx.id);
  const part = ctx.id ? doc?.parts.find((p) => p.id === ctx.id) : undefined;
  const next = primaryActions(contextActionsFor(ctx, doc)).map((a) => a.label);
  if (ctx.kind === 'joint' && joint) {
    return {
      action: `${joint.name} selected.`,
      why: joint.load_role || 'Declared kinematic relationship.',
      affected: [joint.parent, joint.child, ...joint.rotating_group.slice(0, 4)],
      validation: `DOF ${joint.dof} ${joint.joint_type} · ${joint.provenance.class} — not solved kinematics.`,
      next
    };
  }
  if (part && roleOf(part).includes('bearing') && joint) {
    return {
      action: `${part.name} selected.`,
      why: joint.load_role || 'Supports joint loads. DECLARED.',
      affected: joint.load_path.slice(0, 6),
      validation: 'Seat geometry GRAPH ONLY · Fit class UNVERIFIED',
      next
    };
  }
  if (ctx.kind === 'assembly') {
    return {
      action: `${ctx.name} selected.`,
      why: ctx.role ? `Semantic role ${ctx.role}.` : 'Assembly context.',
      affected: doc?.parts.filter((p) => p.parent === ctx.id).map((p) => p.id).slice(0, 8) ?? [],
      validation: 'Graph only. Not FEA.',
      next
    };
  }
  return {
    action: ctx.name ? `${ctx.name} selected.` : 'No selection.',
    why: part?.provenance.reason || ctx.role || 'No declared mechanical role.',
    affected: part ? [part.parent ?? '', ...((doc?.interfaces ?? []).filter((i) => i.a === ctx.id || i.b === ctx.id).map((i) => i.id))].filter(Boolean) : [],
    validation: part ? `${part.provenance.class}` : 'UNVERIFIED',
    next
  };
}
