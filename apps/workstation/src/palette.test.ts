import { describe, expect, it } from 'vitest';
import { contextActions, searchPalette, semanticCatalog, type PaletteItem } from './services/palette';
import type { DesignDocument } from '@archeon/design-protocol';

const catalog: PaletteItem[] = [
  { id: 'part.shoulder.housing', label: 'Shoulder Housing', kind: 'PART' },
  { id: 'asm.shoulder', label: 'ShoulderAssembly', kind: 'ASSEMBLY' },
  { id: 'req.reach', label: 'REQ-002 Reach', kind: 'REQUIREMENT' },
  { id: 'cmd.explode', label: 'explode', kind: 'COMMAND', hint: 'explode selected assembly' },
  { id: 'cad-designer', label: 'CAD Designer', kind: 'AGENT' },
  { id: 'view.section', label: 'section', kind: 'VIEW' }
];

describe('command palette', () => {
  it('groups geometry before agents on exact-ish match', () => {
    const r = searchPalette('shoulder', catalog);
    expect(r[0].id).toMatch(/shoulder/);
  });

  it('finds commands and agents', () => {
    expect(searchPalette('explode', catalog).some((x) => x.kind === 'COMMAND')).toBe(true);
    expect(searchPalette('CAD Designer', catalog)[0].kind).toBe('AGENT');
    expect(searchPalette('REQ-002', catalog)[0].id).toBe('req.reach');
  });

  it('groups semantic bearing matches without collapsing to one part', () => {
    const doc = {
      parts: [{ id: 'part.bearing', name: 'Bearing', semantic_role: 'bearing', provenance: { requirement_ids: [] } }],
      assemblies: [],
      features: [{ id: 'feat.bearing.seat', semantic_role: 'bearing seat', kind: 'bearing_seat', part: 'part.housing' }],
      joints: [{ id: 'joint.a', name: 'Pitch joint', joint_type: 'REVOLUTE', load_role: 'bearing supported', child: 'asm.link' }],
      interfaces: [], ports: [], mates: [], requirements: [], materials: [], analyses: [], evidence: []
    } as unknown as DesignDocument;
    const found = searchPalette('bearing', semanticCatalog(doc));
    expect(found.map((item) => item.kind)).toEqual(expect.arrayContaining(['PART', 'FEATURE', 'JOINT']));
    expect(found.find((item) => item.kind === 'FEATURE')?.focusId).toBe('part.housing');
  });
});

describe('context actions', () => {
  it('proposal and idle lists stay human-first', () => {
    expect(contextActions('proposal').map((a) => a.id)).toContain('approve');
    expect(contextActions('none').map((a) => a.id)).toEqual(expect.arrayContaining(['home', 'fit']));
  });
});
