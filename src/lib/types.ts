/**
 * items 表的行类型（对应 SPEC.md §2.1 DDL）。
 * 纯类型声明，零依赖。
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

/** 新增/编辑时用户能填的字段。其余列走数据库默认值或由服务端维护。 */
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

/** 位置的中文显示名。 */
export const LOCATION_LABEL: Record<Location, string> = {
  fridge: '冰箱',
  freezer: '冷冻',
  pantry: '橱柜',
  bathroom: '浴室',
  vanity: '梳妆台',
  other: '其他',
}

/** 类别的中文显示名。 */
export const CATEGORY_LABEL: Record<Category, string> = {
  fresh: '生鲜',
  frozen: '冷冻',
  snack: '零食干货',
  condiment: '调料',
  skincare: '护肤',
  medicine: '药品保健',
  other: '其他',
}

/** tier 的中文显示名与说明（决定表单显示哪些字段）。 */
export const TIER_LABEL: Record<Tier, string> = {
  L1: 'L1 精确',
  L2: 'L2 粗略',
  L3: 'L3 仅存在',
}
