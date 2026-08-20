/**
 * Row type for the items table (SPEC.md §2.1 DDL).
 * Type declarations only, with zero dependencies.
 */

import type { Category, Location, Quantity, Tier } from './enums'
import type { DateStr } from './expiry'

export interface Item {
  id: string
  user_id: string

  name: string
  category: Category
  location: Location
  tier: Tier

  purchase_date: DateStr | null
  expiry_date: DateStr | null
  shelf_life_days: number | null
  opened_date: DateStr | null
  pao_months: number | null

  quantity_level: Quantity
  note: string | null

  consumed_at: string | null
  discarded_at: string | null

  created_at: string
  updated_at: string
}

/** User-editable fields. Other columns use database defaults or server maintenance. */
export interface ItemDraft {
  name: string
  category: Category
  location: Location
  tier: Tier
  purchase_date: DateStr | null
  expiry_date: DateStr | null
  shelf_life_days: number | null
  opened_date: DateStr | null
  pao_months: number | null
  note: string | null
}

/** Chinese display names for locations. */
export const LOCATION_LABEL: Record<Location, string> = {
  fridge: '冰箱',
  freezer: '冷冻',
  pantry: '橱柜',
  bathroom: '浴室',
  vanity: '梳妆台',
  other: '其他',
}

/** Chinese display names for categories. */
export const CATEGORY_LABEL: Record<Category, string> = {
  fresh: '生鲜',
  frozen: '冷冻',
  snack: '零食干货',
  condiment: '调料',
  skincare: '护肤',
  medicine: '药品保健',
  other: '其他',
}

/** Chinese tier labels and descriptions used to guide form field visibility. */
export const TIER_LABEL: Record<Tier, string> = {
  L1: 'L1 精确',
  L2: 'L2 粗略',
  L3: 'L3 仅存在',
}
