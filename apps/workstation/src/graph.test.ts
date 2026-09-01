import { describe, expect, it } from 'vitest';
import { localInterfaceGraph, neighborhoodOf } from '@archeon/design-protocol';

describe('neighborhoodOf', () => {
  const ports = [
    { id: 'port.a', host: 'part.shoulder.housing' },
    { id: 'port.b', host: 'part.shoulder.shaft' },
    { id: 'port.c', host: 'part.upper_arm.tube' }
  ];
  const interfaces = [
    { id: 'iface.bearing', a: 'port.a', b: 'port.b' },
    { id: 'iface.j2', a: 'port.b', b: 'port.c' }
  ];

  it('returns connected hosts and interface ids', () => {
    const n = neighborhoodOf('part.shoulder.shaft', ports, interfaces);
    expect(n).toContain('part.shoulder.housing');
    expect(n).toContain('part.upper_arm.tube');
    expect(n).toContain('iface.bearing');
    expect(n).not.toContain('part.shoulder.shaft');
  });

  it('local graph is 1-hop and empty without selection', () => {
    const parts = [
      { id: 'part.shoulder.housing', parent: 'asm.shoulder' },
      { id: 'part.shoulder.shaft', parent: 'asm.shoulder' },
      { id: 'part.upper_arm.tube', parent: 'asm.upper_arm' }
    ];
    const none = localInterfaceGraph(null, parts, ports, interfaces);
    expect(none.ifaceIds.size).toBe(0);
    const g = localInterfaceGraph('part.shoulder.shaft', parts, ports, interfaces);
    expect(g.ifaceIds.has('iface.bearing')).toBe(true);
    expect(g.ifaceIds.has('iface.j2')).toBe(true);
    const housing = localInterfaceGraph('part.shoulder.housing', parts, ports, interfaces);
    expect(housing.ifaceIds.has('iface.bearing')).toBe(true);
    expect(housing.ifaceIds.has('iface.j2')).toBe(false);
  });
});
