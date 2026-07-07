/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL — absent = guest-only mode (no auth UI). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (public) key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
