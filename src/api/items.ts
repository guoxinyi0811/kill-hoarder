/**
 * Reads and writes for the items table.
 *
 * Deletion is always soft deletion (CLAUDE.md core rule 4): write consumed_at /
 * discarded_at. This module never calls .delete().
 *
 * status / days_left / effective_expiry are neither read nor written because they
 * are not database columns (core rule 1).
 */

import { supabase } from './client'
import type { Item, ItemDraft } from '../lib/types'

const TABLE = 'items'

/** Return every item that has been neither consumed nor discarded. */
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

/** Insert an item. The DDL supplies user_id via auth.uid() and quantity_level as 'full'. */
export async function insertItem(draft: ItemDraft): Promise<Item> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(draft)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as Item
}

/** Update an item. The database moddatetime trigger maintains updated_at. */
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

/** Mark an item as consumed (soft deletion). */
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

/** Mark an item as discarded (soft deletion). */
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
