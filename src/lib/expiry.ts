/**
 * Core pure expiry function (SPEC.md §3).
 *
 * Hard constraints:
 * - Zero React or Supabase dependencies; inputs and outputs are plain objects.
 * - Never read the system clock. Callers supply `today`; no Date / Date.now / Intl here.
 *   All date arithmetic uses integer civil-calendar math, avoiding time-zone and DST effects.
 * - Dates are always 'YYYY-MM-DD' strings, never Date objects crossing time zones (core rule 5).
 * - status is computed here at runtime and never stored (core rule 1).
 * - Never branch on tier; tier only controls form field visibility (core rule 2).
 */

import { WARN_DAYS, type Category, type Status } from './enums'

/** 'YYYY-MM-DD' */
export type DateStr = string

export interface ExpiryInput {
  category: Category
  purchase_date: DateStr | null
  expiry_date: DateStr | null
  shelf_life_days: number | null
  opened_date: DateStr | null
  pao_months: number | null
}

/** Winning expiry source, displayed by the UI (for example, PAO with a Chinese opened-date label). */
export type ExpirySource = 'explicit' | 'pao' | 'shelf_life'

export interface ExpiryResult {
  effectiveExpiry: DateStr | null
  daysLeft: number | null // Negative means expired.
  status: Status
  source: ExpirySource | null
}

/**
 * Non-throwing variant of computeExpiry.
 *
 * Rendering uses this to degrade one invalid item to a placeholder instead of allowing
 * its exception to crash the entire list (SPEC §4 P1).
 */
export type SafeExpiryResult =
  | { ok: true; result: ExpiryResult }
  | { ok: false; message: string }

// ---------------------------------------------------------------------------
// Calendar utilities: pure integer arithmetic with no Date dependency.
// ---------------------------------------------------------------------------

interface Civil {
  y: number
  m: number // 1-12
  d: number // 1-31
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31
}

/** Parse and validate 'YYYY-MM-DD'; throw rather than silently returning a wrong date. */
function parseDate(value: DateStr, field: string): Civil {
  if (!DATE_RE.test(value)) {
    throw new TypeError(
      `${field} 必须是 YYYY-MM-DD 格式，收到 ${JSON.stringify(value)}`,
    )
  }
  const y = Number(value.slice(0, 4))
  const m = Number(value.slice(5, 7))
  const d = Number(value.slice(8, 10))
  if (m < 1 || m > 12) {
    throw new RangeError(`${field} 的月份越界：${JSON.stringify(value)}`)
  }
  if (d < 1 || d > daysInMonth(y, m)) {
    throw new RangeError(`${field} 的日期不存在：${JSON.stringify(value)}`)
  }
  return { y, m, d }
}

function formatDate({ y, m, d }: Civil): DateStr {
  const yyyy = String(y).padStart(4, '0')
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Gregorian date to days since 1970-01-01 (Howard Hinnant's days_from_civil).
 * Integer arithmetic handles leap years, including the 100/400-year rules.
 */
function toDayNumber({ y, m, d }: Civil): number {
  const shiftedYear = y - (m <= 2 ? 1 : 0)
  const era = Math.floor(shiftedYear / 400)
  const yearOfEra = shiftedYear - era * 400 // [0, 399]
  const dayOfYear = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear
  return era * 146097 + dayOfEra - 719468
}

/** Inverse of toDayNumber (civil_from_days). */
function fromDayNumber(dayNumber: number): Civil {
  const z = dayNumber + 719468
  const era = Math.floor(z / 146097)
  const dayOfEra = z - era * 146097 // [0, 146096]
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  ) // [0, 399]
  const year = yearOfEra + era * 400
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra +
      Math.floor(yearOfEra / 4) -
      Math.floor(yearOfEra / 100)) // [0, 365]
  const mp = Math.floor((5 * dayOfYear + 2) / 153) // [0, 11]
  const d = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1 // [1, 31]
  const m = mp + (mp < 10 ? 3 : -9) // [1, 12]
  return { y: year + (m <= 2 ? 1 : 0), m, d }
}

function addDays(date: DateStr, days: number, field: string): DateStr {
  return formatDate(fromDayNumber(toDayNumber(parseDate(date, field)) + days))
}

/**
 * Add months, clamping overflow to the target month's last day (SPEC §3.2 explicitly
 * defines 2026-01-31 + 1 month as 2026-02-28). This differs from JS Date overflow.
 */
function addMonths(date: DateStr, months: number, field: string): DateStr {
  const { y, m, d } = parseDate(date, field)
  const totalMonths = y * 12 + (m - 1) + months
  const ny = Math.floor(totalMonths / 12)
  const nm = totalMonths - ny * 12 + 1
  return formatDate({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) })
}

// ---------------------------------------------------------------------------
// Main function.
// ---------------------------------------------------------------------------

interface Candidate {
  date: DateStr
  source: ExpirySource
}

function toStatus(daysLeft: number, category: Category): Status {
  const warn = WARN_DAYS[category]
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= warn) return 'urgent'
  if (daysLeft <= warn * 2) return 'soon'
  return 'ok'
}

/**
 * Select the earliest of three expiry sources and derive remaining days and status.
 *
 * @param today Caller-provided 'YYYY-MM-DD', resolved in America/Toronto for production use.
 * @throws When any date field has an invalid format or represents a nonexistent date.
 */
export function computeExpiry(item: ExpiryInput, today: DateStr): ExpiryResult {
  const todayNumber = toDayNumber(parseDate(today, 'today'))

  // Array order defines same-day precedence: explicit > pao > shelf_life.
  const candidates: Candidate[] = []

  if (item.expiry_date !== null) {
    // Validate through parseDate while preserving the original string value.
    candidates.push({
      date: formatDate(parseDate(item.expiry_date, 'expiry_date')),
      source: 'explicit',
    })
  }
  // Both fields are required; zero is valid, so do not use truthiness checks.
  if (item.opened_date !== null && item.pao_months !== null) {
    candidates.push({
      date: addMonths(item.opened_date, item.pao_months, 'opened_date'),
      source: 'pao',
    })
  }
  if (item.purchase_date !== null && item.shelf_life_days !== null) {
    candidates.push({
      date: addDays(item.purchase_date, item.shelf_life_days, 'purchase_date'),
      source: 'shelf_life',
    })
  }

  // Lexicographic order matches chronological order for 'YYYY-MM-DD'.
  // Strict less-than preserves the earlier array entry on ties.
  let winner: Candidate | null = null
  for (const candidate of candidates) {
    if (winner === null || candidate.date < winner.date) winner = candidate
  }

  if (winner === null) {
    return {
      effectiveExpiry: null,
      daysLeft: null,
      status: 'untracked',
      source: null,
    }
  }

  const daysLeft = toDayNumber(parseDate(winner.date, 'effectiveExpiry')) - todayNumber

  return {
    effectiveExpiry: winner.date,
    daysLeft,
    status: toStatus(daysLeft, item.category),
    source: winner.source,
  }
}

/**
 * Check whether a string is a valid, existing 'YYYY-MM-DD' date.
 *
 * Forms use this before submission (SPEC §4 P1). Sharing parseDate with computeExpiry
 * guarantees that form acceptance and calculation acceptance remain identical.
 */
export function isValidDateStr(value: string): boolean {
  try {
    parseDate(value, 'date')
    return true
  } catch {
    return false
  }
}

/**
 * Non-throwing wrapper around computeExpiry. Invalid dates return
 * { ok: false, message }, leaving presentation fallback decisions to the caller.
 */
export function computeExpirySafe(
  item: ExpiryInput,
  today: DateStr,
): SafeExpiryResult {
  try {
    return { ok: true, result: computeExpiry(item, today) }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
