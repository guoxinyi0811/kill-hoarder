/**
 * Pre-submit validation for the create/edit form (SPEC §4 P1, second defense).
 *
 * Prevent invalid dates at the source. computeExpiry throws on invalid dates, so
 * every date written to the database must pass through this validation first.
 *
 * Zero React or Supabase dependencies.
 */

import { isValidDateStr } from './expiry'
import { CATEGORIES, LOCATIONS, TIERS } from './enums'
import type { ItemDraft } from './types'

/** Every form field is the raw string value of a controlled input. */
export interface ItemFormValues {
  name: string
  category: string
  location: string
  tier: string
  purchase_date: string
  expiry_date: string
  shelf_life_days: string
  opened_date: string
  pao_months: string
  note: string
}

export type FieldErrors = Partial<Record<keyof ItemFormValues, string>>

const DATE_FIELDS = ['purchase_date', 'expiry_date', 'opened_date'] as const
const NUMBER_FIELDS = ['shelf_life_days', 'pao_months'] as const

const DATE_FIELD_LABEL: Record<(typeof DATE_FIELDS)[number], string> = {
  purchase_date: '购入日',
  expiry_date: '到期日',
  opened_date: '开封日',
}

const NUMBER_FIELD_LABEL: Record<(typeof NUMBER_FIELDS)[number], string> = {
  shelf_life_days: '保质天数',
  pao_months: '开封后可用月数',
}

export function emptyFormValues(): ItemFormValues {
  return {
    name: '',
    category: 'other',
    location: 'pantry',
    tier: 'L2',
    purchase_date: '',
    expiry_date: '',
    shelf_life_days: '',
    opened_date: '',
    pao_months: '',
    note: '',
  }
}

/**
 * Validate a form. An empty result means submission is allowed.
 *
 * Date fields may be blank. Otherwise they must use YYYY-MM-DD and represent a real
 * date; for example, 2027-02-29 is rejected.
 */
export function validateItemForm(values: ItemFormValues): FieldErrors {
  const errors: FieldErrors = {}

  if (values.name.trim() === '') {
    errors.name = '请填名称'
  }

  if (!(CATEGORIES as readonly string[]).includes(values.category)) {
    errors.category = '类别不合法'
  }
  if (!(LOCATIONS as readonly string[]).includes(values.location)) {
    errors.location = '位置不合法'
  }
  if (!(TIERS as readonly string[]).includes(values.tier)) {
    errors.tier = '追踪层级不合法'
  }

  for (const field of DATE_FIELDS) {
    const raw = values[field].trim()
    if (raw === '') continue
    if (!isValidDateStr(raw)) {
      errors[field] = `${DATE_FIELD_LABEL[field]}必须是真实存在的日期（YYYY-MM-DD）`
    }
  }

  for (const field of NUMBER_FIELDS) {
    const raw = values[field].trim()
    if (raw === '') continue
    if (!/^\d+$/.test(raw)) {
      errors[field] = `${NUMBER_FIELD_LABEL[field]}必须是非负整数`
    }
  }

  return errors
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0
}

/**
 * Convert form values into a database draft.
 * Call only after validateItemForm succeeds.
 */
export function toItemDraft(values: ItemFormValues): ItemDraft {
  const text = (raw: string): string | null => {
    const trimmed = raw.trim()
    return trimmed === '' ? null : trimmed
  }
  const int = (raw: string): number | null => {
    const trimmed = raw.trim()
    return trimmed === '' ? null : Number(trimmed)
  }

  return {
    name: values.name.trim(),
    category: values.category as ItemDraft['category'],
    location: values.location as ItemDraft['location'],
    tier: values.tier as ItemDraft['tier'],
    purchase_date: text(values.purchase_date),
    expiry_date: text(values.expiry_date),
    shelf_life_days: int(values.shelf_life_days),
    opened_date: text(values.opened_date),
    pao_months: int(values.pao_months),
    note: text(values.note),
  }
}

/**
 * Tier determines which date fields the form displays (SPEC §6).
 * L3 has name/category/location; L2 adds purchase date and shelf life; L1 adds
 * expiry/opened dates and PAO.
 */
export function visibleDateFields(tier: string): {
  purchase: boolean
  shelfLife: boolean
  expiry: boolean
  opened: boolean
  pao: boolean
} {
  if (tier === 'L3') {
    return {
      purchase: false,
      shelfLife: false,
      expiry: false,
      opened: false,
      pao: false,
    }
  }
  if (tier === 'L2') {
    return {
      purchase: true,
      shelfLife: true,
      expiry: false,
      opened: false,
      pao: false,
    }
  }
  return {
    purchase: true,
    shelfLife: true,
    expiry: true,
    opened: true,
    pao: true,
  }
}

/** Convert a stored item back into edit-form values. */
export function toFormValues(item: {
  name: string
  category: string
  location: string
  tier: string
  purchase_date: string | null
  expiry_date: string | null
  shelf_life_days: number | null
  opened_date: string | null
  pao_months: number | null
  note: string | null
}): ItemFormValues {
  return {
    name: item.name,
    category: item.category,
    location: item.location,
    tier: item.tier,
    purchase_date: item.purchase_date ?? '',
    expiry_date: item.expiry_date ?? '',
    shelf_life_days:
      item.shelf_life_days === null ? '' : String(item.shelf_life_days),
    opened_date: item.opened_date ?? '',
    pao_months: item.pao_months === null ? '' : String(item.pao_months),
    note: item.note ?? '',
  }
}
