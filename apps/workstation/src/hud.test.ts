import { describe, expect, it } from 'vitest';
import {
  applyClose,
  applyOpen,
  applyPin,
  breadcrumbs,
  emptyHuds,
  inspectorAfterSelection,
  primaryOpen,
  utilityOpen
} from './services/hudManager';

describe('HudManager clutter limits', () => {
  it('keeps agent independent of primary limit', () => {
    let h = emptyHuds();
    h = applyOpen(h, 'project');
    h = applyOpen(h, 'agent');
    expect(h.agent.open).toBe(true);
    expect(h.project.open).toBe(true);
  });

  it('only one unpinned primary HUD', () => {
    let h = emptyHuds();
    h = applyOpen(h, 'project');
    h = applyOpen(h, 'inspector');
    expect(h.project.open).toBe(false);
    expect(h.inspector.open).toBe(true);
    expect(primaryOpen(h)).toEqual(['inspector']);
  });

  it('pinned primary survives another primary', () => {
    let h = emptyHuds();
    h = applyOpen(h, 'project');
    h = applyPin(h, 'project', true);
    h = applyOpen(h, 'inspector');
    expect(h.project.open).toBe(true);
    expect(h.inspector.open).toBe(true);
  });

  it('caps utility HUDs at two', () => {
    let h = emptyHuds();
    h = applyOpen(h, 'measure', 1);
    h = applyOpen(h, 'section', 2);
    h = applyOpen(h, 'health', 3);
    expect(utilityOpen(h).length).toBe(2);
    expect(h.health.open).toBe(true);
    expect(h.measure.open).toBe(false);
  });

  it('close clears pin', () => {
    let h = emptyHuds();
    h = applyOpen(h, 'health');
    h = applyPin(h, 'health', true);
    h = applyClose(h, 'health');
    expect(h.health.open).toBe(false);
    expect(h.health.pinned).toBe(false);
  });

  it('inspector closes on deselect unless pinned', () => {
    let h = emptyHuds();
    h = inspectorAfterSelection(h, 'part.a');
    expect(h.inspector.open).toBe(true);
    h = inspectorAfterSelection(h, null);
    expect(h.inspector.open).toBe(false);
    h = inspectorAfterSelection(h, 'part.a');
    h = applyPin(h, 'inspector', true);
    h = inspectorAfterSelection(h, null);
    expect(h.inspector.open).toBe(true);
    expect(h.inspector.pinned).toBe(true);
  });
});

describe('breadcrumbs', () => {
  const assemblies = [
    { id: 'asm.arm', name: 'ARCHEON Arm', parent: null },
    { id: 'asm.shoulder', name: 'Shoulder Assembly', parent: 'asm.arm' }
  ];
  const parts = [{ id: 'part.shoulder.housing', name: 'Shoulder Housing', parent: 'asm.shoulder' }];

  it('builds human-readable path', () => {
    const c = breadcrumbs('part.shoulder.housing', 'ARCHEON Arm', parts, assemblies);
    expect(c.map((x) => x.name)).toEqual(['ARCHEON Arm', 'Shoulder Assembly', 'Shoulder Housing']);
  });

  it('project only when nothing selected', () => {
    expect(breadcrumbs(null, 'ARCHEON Arm', parts, assemblies)).toEqual([{ id: 'project', name: 'ARCHEON Arm' }]);
  });
});
