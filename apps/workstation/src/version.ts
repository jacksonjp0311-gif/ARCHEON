/** Release lockstep is ARCHEON_RELEASE / VERSION. Display version is injected at UI compile (0.1.0+dev.N). */
export const ARCHEON_PRODUCT = 'ARCHEON';
export const ARCHEON_MACHINE = 'ARM-01';
export const ARCHEON_RELEASE = '0.4.1';
export const ARCHEON_VERSION = import.meta.env.VITE_ARCHEON_VERSION || ARCHEON_RELEASE;
