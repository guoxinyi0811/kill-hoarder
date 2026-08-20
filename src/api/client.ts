/**
 * Supabase client.
 *
 * Configuration comes from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local.
 * supabase-js supports both the new sb_publishable_ key format and legacy JWTs,
 * so no special handling is needed here.
 */

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Let the UI show a useful message instead of crashing when configuration is missing. */
export const configError: string | null =
  !url || !anonKey
    ? '缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，请检查项目根目录的 .env.local'
    : null

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-key',
)
