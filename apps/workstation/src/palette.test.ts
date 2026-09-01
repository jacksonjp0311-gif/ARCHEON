import { describe, expect, it } from 'vitest';
import { contextActions, searchPalette, type PaletteItem } from './services/palette';

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
});

describe('context actions', () => {
  it('part actions stay compact', () => {
    expect(contextActions('part').length).toBeLessThanOrEqual(6);
    expect(contextActions('proposal').map((a) => a.id)).toContain('approve');
    expect(contextActions('none').length).toBeLessThanOrEqual(3);
  });
});
