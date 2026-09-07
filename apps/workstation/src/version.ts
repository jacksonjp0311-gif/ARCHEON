/** Release lockstep is ARCHEON_RELEASE / VERSION. A dev build may override the displayed version. */
export const ARCHEON_PRODUCT = 'ARCHEON';
export const ARCHEON_MACHINE = 'ARM-01';
export const ARCHEON_RELEASE = '0.6.3';
export const ARCHEON_VERSION = import.meta.env.VITE_ARCHEON_VERSION || ARCHEON_RELEASE;
