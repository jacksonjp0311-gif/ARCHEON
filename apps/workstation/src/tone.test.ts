import { describe, expect, it } from 'vitest';
import { isAskAction, provenanceTone } from './services/tone';

describe('semantic color grammar', () => {
  it('marks generated/derived provenance as intelligence (lavender)', () => {
    expect(provenanceTone('GENERATED')).toBe('prov');
    expect(provenanceTone('DERIVED')).toBe('prov');
    expect(provenanceTone('SIMULATED')).toBe('prov');
  });

  it('marks validated as green and assumed as amber', () => {
    expect(provenanceTone('VALIDATED')).toBe('valid');
    expect(provenanceTone('ASSUMED')).toBe('warn');
    expect(provenanceTone('UNVERIFIED')).toBe('warn');
  });

  it('treats source and measured facts without lavender-by-default', () => {
    expect(provenanceTone('SOURCE')).toBe('fact');
    expect(provenanceTone('MEASURED')).toBe('valid');
  });

  it('identifies ASK as the intelligence action, not FOCUS/EXPLODE', () => {
    expect(isAskAction('ask')).toBe(true);
    expect(isAskAction('focus')).toBe(false);
    expect(isAskAction('explode')).toBe(false);
    expect(isAskAction('home')).toBe(false);
  });
});
