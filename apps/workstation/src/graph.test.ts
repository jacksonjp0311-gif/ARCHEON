import { describe, expect, it } from 'vitest';
import { neighborhoodOf } from '@archeon/design-protocol';

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
});
