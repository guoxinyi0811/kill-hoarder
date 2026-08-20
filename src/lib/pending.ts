/**
 * Pure logic for the "⚠️ Pending" main view: filtering, sorting, grouping, and error isolation.
 *
 * Pure functions keep the SPEC §4 P1 filtering, sorting, and isolation rules testable
 * without React. Zero React or Supabase dependencies.
 */

import { computeExpirySafe, type DateStr, type ExpiryResult } from './expiry'
import type { Item } from './types'

/** An item whose status was computed successfully. */
export interface PendingEntry {
  item: Item
  result: ExpiryResult
}

/** An item with invalid date data, rendered as a clickable repair placeholder. */
export interface InvalidEntry {
  item: Item
  message: string
}

export interface PendingGroups {
  expired: PendingEntry[]
  urgent: PendingEntry[]
  soon: PendingEntry[]
  /** Invalid-date items are listed separately and never participate in status groups. */
  invalid: InvalidEntry[]
}

/** Group headings (SPEC §4 P1). */
export const GROUP_TITLE = {
  expired: '已过期',
  urgent: '快到期',
  soon: '留意',
} as const

/** Status indicator colors (SPEC §6). */
export const STATUS_DOT = {
  expired: '🔴',
  urgent: '🟠',
  soon: '🟡',
  ok: '🟢',
  untracked: '⚪',
} as const

/** Whether an item is active: neither consumed nor discarded (soft deletion, core rule 4). */
export function isActive(item: Item): boolean {
  return item.consumed_at === null && item.discarded_at === null
}

/**
 * Transform items into the structure required by the pending main view.
 *
 * - Keep only status in {expired, urgent, soon}; exclude ok / untracked.
 * - Sort each group by daysLeft, then by name for stable rendering.
 * - Isolate an invalid date to the invalid group without affecting other items.
 */
export function groupPending(items: Item[], today: DateStr): PendingGroups {
  const groups: PendingGroups = {
    expired: [],
    urgent: [],
    soon: [],
    invalid: [],
  }

  for (const item of items) {
    if (!isActive(item)) continue

    // Per-item isolation is the primary defense against bubbling calculation errors.
    const safe = computeExpirySafe(item, today)
    if (!safe.ok) {
      groups.invalid.push({ item, message: safe.message })
      continue
    }

    const { status } = safe.result
    if (status === 'expired' || status === 'urgent' || status === 'soon') {
      groups[status].push({ item, result: safe.result })
    }
  }

  for (const status of ['expired', 'urgent', 'soon'] as const) {
    groups[status].sort((a, b) => {
      const byDays = (a.result.daysLeft ?? 0) - (b.result.daysLeft ?? 0)
      return byDays !== 0 ? byDays : a.item.name.localeCompare(b.item.name)
    })
  }

  groups.invalid.sort((a, b) => a.item.name.localeCompare(b.item.name))

  return groups
}

/** Whether the main view has no status-grouped or invalid items. */
export function isPendingEmpty(groups: PendingGroups): boolean {
  return (
    groups.expired.length === 0 &&
    groups.urgent.length === 0 &&
    groups.soon.length === 0 &&
    groups.invalid.length === 0
  )
}

/**
 * Whether a created or edited item will appear in the main view after saving.
 * If it will not, the caller must show a confirmation toast (SPEC §4 P1).
 */
export function appearsInPending(item: Item, today: DateStr): boolean {
  if (!isActive(item)) return false
  const safe = computeExpirySafe(item, today)
  if (!safe.ok) return true // Invalid items appear as placeholders in the main view.
  const { status } = safe.result
  return status === 'expired' || status === 'urgent' || status === 'soon'
}

/** Chinese display text for remaining days. */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return `已过期 ${Math.abs(daysLeft)} 天`
  if (daysLeft === 0) return '今天到期'
  return `剩 ${daysLeft} 天`
}
