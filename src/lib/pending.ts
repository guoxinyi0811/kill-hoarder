/**
 * 「⚠️ 待处理」主视图的纯逻辑：筛选、排序、分组、异常隔离。
 *
 * 抽成纯函数是为了让 SPEC §4 P1 的筛选/排序/隔离规则可以脱离 React 单测。
 * 零 React、零 Supabase 依赖。
 */

import { computeExpirySafe, type DateStr, type ExpiryResult } from './expiry'
import type { Item } from './types'

/** 一条能正常算出状态的条目。 */
export interface PendingEntry {
  item: Item
  result: ExpiryResult
}

/** 一条日期数据非法、算不出状态的条目。渲染成占位，可点进编辑页修。 */
export interface InvalidEntry {
  item: Item
  message: string
}

export interface PendingGroups {
  expired: PendingEntry[]
  urgent: PendingEntry[]
  soon: PendingEntry[]
  /** 日期非法的条目。永远单独列出，不参与排序分组。 */
  invalid: InvalidEntry[]
}

/** 分组标题（SPEC §4 P1）。 */
export const GROUP_TITLE = {
  expired: '已过期',
  urgent: '快到期',
  soon: '留意',
} as const

/** 状态色点（SPEC §6）。 */
export const STATUS_DOT = {
  expired: '🔴',
  urgent: '🟠',
  soon: '🟡',
  ok: '🟢',
  untracked: '⚪',
} as const

/** 条目是否算「未消耗、未丢弃」的活动条目（软删除，CLAUDE.md 核心规则 4）。 */
export function isActive(item: Item): boolean {
  return item.consumed_at === null && item.discarded_at === null
}

/**
 * 把条目列表整理成待处理主视图需要的结构。
 *
 * - 只保留 status ∈ {expired, urgent, soon}，ok / untracked 一律不进主视图
 * - 每组内按 daysLeft 升序；daysLeft 相同时按名称排，保证渲染顺序稳定
 * - 单条日期非法不影响其余条目，只落进 invalid
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

    // 逐条隔离：这里是异常不冒泡的第一道也是主要一道防线。
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

/** 主视图上是否一条都没有（三组为空且没有非法条目）。 */
export function isPendingEmpty(groups: PendingGroups): boolean {
  return (
    groups.expired.length === 0 &&
    groups.urgent.length === 0 &&
    groups.soon.length === 0 &&
    groups.invalid.length === 0
  )
}

/**
 * 新增/编辑保存后，该条目是否会出现在主视图里。
 * 不会出现时调用方必须给 toast 回执（SPEC §4 P1 验收）。
 */
export function appearsInPending(item: Item, today: DateStr): boolean {
  if (!isActive(item)) return false
  const safe = computeExpirySafe(item, today)
  if (!safe.ok) return true // 非法条目会以占位形式出现在主视图
  const { status } = safe.result
  return status === 'expired' || status === 'urgent' || status === 'soon'
}

/** 剩余天数的中文表述。 */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return `已过期 ${Math.abs(daysLeft)} 天`
  if (daysLeft === 0) return '今天到期'
  return `剩 ${daysLeft} 天`
}
