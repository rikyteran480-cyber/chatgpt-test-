/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
