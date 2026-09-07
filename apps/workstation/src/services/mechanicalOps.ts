import { resolveExplodeContext } from '@archeon/scene-engine';
import type { DesignDocument } from '@archeon/design-protocol';
import { useUi } from '../store';
import {
  ancestorIds,
  componentStack,
  declaredLoadPath,
  fastenerHosts,
  jointFor,
  openTargets,
  rotatingGroup,
  serviceSequence
} from './context';

/** Single spatial/mechanical operation used by click, radial, menus, and language views. */
export function applyMechanicalOp(op: string, entityId: string | null, doc: DesignDocument | null): void {
  const ui = useUi.getState();
  const sid = entityId ?? ui.selectedId;
  const parts = doc?.parts ?? [];
  const assemblies = doc?.assemblies ?? [];

  function reveal(id: string) {
    ui.revealEntity(id, ancestorIds(id, parts, assemblies));
  }

  if (op === 'restore' || op === 'close' || op === 'home') {
    ui.clearMechanical();
    ui.dispatch({ op: op === 'home' ? 'home_view' : 'restore_display' });
    return;
  }
  if (op === 'previous') {
    ui.dispatch({ op: 'previous_view' });
    return;
  }
  if (op === 'focus' && sid) {
    reveal(sid);
    ui.dispatch({ op: 'focus_entity', entity_id: sid, ghost_others: true });
    return;
  }
  if (op === 'isolate' && sid) {
    reveal(sid);
    ui.dispatch({ op: 'isolate_entity', entity_id: sid });
    return;
  }
  if (op === 'track' && sid) {
    ui.dispatch({ op: 'track_entity', entity_id: sid });
    return;
  }
  if (op === 'explode') {
    const scope = resolveExplodeContext(sid, parts, assemblies);
    ui.setStrategy('SYSTEM');
    ui.dispatch({ op: 'explode_entity', entity_id: scope, factor: 0.85 });
    return;
  }
  if (op === 'fit') {
    ui.dispatch({ op: 'fit_scene' });
    return;
  }
  if (op === 'interfaces' || op === 'show-mate') {
    if (sid) reveal(sid);
    ui.dispatch({ op: 'show_overlay', overlay: 'INTERFACES' });
    return;
  }
  if (op === 'affected' && sid) {
    ui.dispatch({ op: 'select_entity', entity_id: sid });
    ui.dispatch({ op: 'show_affected' });
    return;
  }
  if (op === 'section') {
    ui.setSectionOn(true);
    ui.openHud('section');
    return;
  }
  if (op === 'measure') {
    ui.openHud('measure');
    return;
  }
  if (op === 'more') {
    ui.openHud('inspector');
    return;
  }
  if (op === 'xray') {
    ui.setView('X_RAY');
    return;
  }

  if (!sid || !doc) return;

  if (op === 'open') {
    reveal(sid);
    const shells = openTargets(doc, sid);
    const part = doc.parts.find((p) => p.id === sid);
    const asm = doc.assemblies.find((a) => a.id === sid);
    const scope = part?.parent ?? asm?.id ?? sid;
    ui.setMechanical({
      openId: sid,
      ghostRoles: ['housing', 'cover', 'shell'],
      ghostOthers: false,
      stackIds: [],
      loadPathIds: [],
      serviceIds: [],
      axisJointId: null
    });
    ui.setSectionOn(true);
    ui.dispatch({ op: 'focus_entity', entity_id: scope, ghost_others: false });
    const internals = doc.parts.filter((p) => p.parent === scope && !shells.includes(p.id)).map((p) => p.id);
    if (internals.length) ui.setNeighborhood(internals);
    return;
  }

  if (op === 'show-stack') {
    const stack = componentStack(doc, sid);
    reveal(sid);
    ui.setMechanical({
      stackIds: stack,
      neighborhoodIds: stack,
      ghostOthers: true,
      ghostRoles: [],
      openId: null,
      loadPathIds: [],
      serviceIds: []
    });
    ui.dispatch({ op: 'focus_entity', entity_id: sid, ghost_others: true });
    return;
  }

  if (op === 'show-load') {
    const path = declaredLoadPath(doc, sid);
    reveal(sid);
    ui.setMechanical({
      loadPathIds: path,
      neighborhoodIds: path,
      ghostOthers: true,
      stackIds: [],
      serviceIds: []
    });
    ui.dispatch({ op: 'show_overlay', overlay: 'INTERFACES' });
    return;
  }

  if (op === 'show-axis') {
    const joint = jointFor(doc, sid);
    reveal(joint?.id ?? sid);
    ui.setMechanical({
      axisJointId: joint?.id ?? sid,
      neighborhoodIds: rotatingGroup(doc, sid)
    });
    ui.dispatch({ op: 'show_overlay', overlay: 'DATUMS' });
    return;
  }

  if (op === 'show-motion') {
    const joint = jointFor(doc, sid);
    const group = rotatingGroup(doc, sid);
    reveal(joint?.id ?? sid);
    ui.setMechanical({
      neighborhoodIds: group,
      ghostOthers: true,
      axisJointId: joint?.id ?? null,
      stackIds: [],
      loadPathIds: []
    });
    ui.dispatch({ op: 'show_overlay', overlay: 'DATUMS' });
    return;
  }

  if (op === 'service') {
    const seq = serviceSequence(doc, sid);
    reveal(sid);
    ui.setMechanical({
      serviceIds: seq,
      neighborhoodIds: seq,
      ghostOthers: true,
      stackIds: [],
      loadPathIds: []
    });
    ui.setSpatial('SERVICE');
    return;
  }

  if (op === 'show-fasteners') {
    const ids = fastenerHosts(doc, sid);
    reveal(sid);
    ui.setMechanical({ neighborhoodIds: ids, ghostOthers: true, serviceIds: ids });
    return;
  }

  if (op === 'show-evidence') {
    reveal(sid);
    ui.openHud('inspector');
  }
}

/** Map legacy language view kinds onto the same ops click / radial already use. */
export function mechanicalOpFromView(kind: string): string | null {
  switch (kind) {
    case 'mechanical':
      return null;
    case 'explode_stack':
      return 'open';
    case 'show_joint':
      return 'show-motion';
    case 'show_load_path':
    case 'show_load_paths':
      return 'show-load';
    case 'explode_context':
      return 'explode';
    case 'restore_display':
      return 'restore';
    case 'home_view':
    case 'reset_view':
      return 'home';
    case 'previous_view':
      return 'previous';
    default:
      return null;
  }
}

export const SHOULDER_CONVERSATION_OPS = [
  'open',
  'show-motion',
  'show-stack',
  'show-load',
  'show-fasteners',
  'service',
  'restore',
  'previous'
] as const;
