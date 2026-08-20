/**
 * Single source of truth for enum values and thresholds.
 *
 * Values, names, and order match the Enum Values and WARN_DAYS sections of CLAUDE.md
 * and the PostgreSQL enums in SPEC.md §2.1. Do not add, rename, reorder, or change values.
 *
 * Zero React or Supabase dependencies.
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

/** Runtime iterable values in the same order as their DDL enum declarations. */
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
 * Warning days for each category.
 * daysLeft <= WARN_DAYS[category] is urgent; <= twice that value is soon.
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
