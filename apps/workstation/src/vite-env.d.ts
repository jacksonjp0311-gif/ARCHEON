/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARCHEON_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
