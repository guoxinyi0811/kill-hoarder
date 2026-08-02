/**
 * Supabase 客户端。
 *
 * 配置来自 .env.local 的 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。
 * anon key 用新格式（sb_publishable_ 开头）还是旧的 JWT 都可以，supabase-js 都支持，
 * 这里不做任何特殊处理。
 */

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** 环境变量缺失时不直接崩，交给 UI 显示一条能看懂的提示。 */
export const configError: string | null =
  !url || !anonKey
    ? '缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，请检查项目根目录的 .env.local'
    : null

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-key',
)
