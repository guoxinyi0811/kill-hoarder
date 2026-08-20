/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, configured in .env.local. */
  readonly VITE_SUPABASE_URL: string
  /** Supabase publishable / anon key, configured in .env.local. */
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
