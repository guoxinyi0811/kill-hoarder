/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase 项目 URL。在 .env.local 里配置。 */
  readonly VITE_SUPABASE_URL: string
  /** Supabase publishable / anon key。在 .env.local 里配置。 */
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
