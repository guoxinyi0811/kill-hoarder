/**
 * 枚举值与阈值的唯一真源。
 *
 * 值、名称、顺序均与 CLAUDE.md「枚举值」「WARN_DAYS」两节逐字对应，
 * 且与 SPEC.md §2.1 DDL 中的 pg enum 一致。禁止新增、改名、改顺序、改数值。
 *
 * 零 React / 零 Supabase 依赖。
 */

export type Category =
  | 'fresh'
  | 'frozen'
  | 'snack'
  | 'condiment'
  | 'skincare'
  | 'medicine'
  | 'other'

export type Location =
  | 'fridge'
  | 'freezer'
  | 'pantry'
  | 'bathroom'
  | 'vanity'
  | 'other'

export type Tier = 'L1' | 'L2' | 'L3'

export type Quantity = 'full' | 'half' | 'low'

export type Status = 'expired' | 'urgent' | 'soon' | 'ok' | 'untracked'

/** 运行时可迭代的取值列表，顺序即 DDL 中 enum 的声明顺序。 */
export const CATEGORIES = [
  'fresh',
  'frozen',
  'snack',
  'condiment',
  'skincare',
  'medicine',
  'other',
] as const satisfies readonly Category[]

export const LOCATIONS = [
  'fridge',
  'freezer',
  'pantry',
  'bathroom',
  'vanity',
  'other',
] as const satisfies readonly Location[]

export const TIERS = ['L1', 'L2', 'L3'] as const satisfies readonly Tier[]

export const QUANTITIES = [
  'full',
  'half',
  'low',
] as const satisfies readonly Quantity[]

export const STATUSES = [
  'expired',
  'urgent',
  'soon',
  'ok',
  'untracked',
] as const satisfies readonly Status[]

/**
 * 每个 category 的预警天数。
 * daysLeft <= WARN_DAYS[category] → urgent；<= 两倍 → soon。
 */
export const WARN_DAYS: Record<Category, number> = {
  fresh: 3,
  frozen: 15,
  snack: 15,
  condiment: 30,
  skincare: 60,
  medicine: 30,
  other: 30,
}
