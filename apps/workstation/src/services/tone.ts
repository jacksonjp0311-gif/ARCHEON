/** Visual grammar: gold = human action, lavender = ARCHEON intelligence, white = facts. */

export type ValueTone = 'id' | 'agent' | 'prov' | 'graph' | 'fact' | 'valid' | 'warn' | 'delta';

const PROV_LAVENDER = new Set(['GENERATED', 'DERIVED', 'SIMULATED']);
const PROV_VALID = new Set(['VALIDATED', 'MEASURED', 'SOURCE']);
const PROV_WARN = new Set(['ASSUMED', 'UNVERIFIED']);

export function provenanceTone(cls: string): ValueTone {
  const n = cls.toUpperCase();
  if (PROV_LAVENDER.has(n)) return 'prov';
  if (PROV_VALID.has(n) && n !== 'SOURCE') return 'valid';
  if (PROV_WARN.has(n)) return 'warn';
  return 'fact';
}

export function isAskAction(id: string): boolean {
  return id === 'ask';
}
