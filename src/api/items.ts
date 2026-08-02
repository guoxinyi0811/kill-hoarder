/**
 * items 表的读写。
 *
 * 删除一律软删除（CLAUDE.md 核心规则 4）：写 consumed_at / discarded_at，
 * 这里没有也不会有 .delete()。
 *
 * status / days_left / effective_expiry 都不查也不写——它们不是列（规则 1）。
 */

import { supabase } from './client'
import type { Item, ItemDraft } from '../lib/types'

const TABLE = 'items'

/** 未消耗且未丢弃的全部条目。 */
export async function fetchActiveItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .is('consumed_at', null)
    .is('discarded_at', null)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Item[]
}

/** 新增。user_id 走 DDL 里的 default auth.uid()，quantity_level 走默认 'full'。 */
export async function insertItem(draft: ItemDraft): Promise<Item> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(draft)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as Item
}

/** 编辑。updated_at 由数据库的 moddatetime 触发器维护，这里不传。 */
export async function updateItem(
  id: string,
  draft: ItemDraft,
): Promise<Item> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(draft)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as Item
}

/** 标记已用完（软删除）。 */
export async function markConsumed(id: string): Promise<Item> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as Item
}

/** 标记已丢弃（软删除）。 */
export async function markDiscarded(id: string): Promise<Item> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ discarded_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as Item
}
