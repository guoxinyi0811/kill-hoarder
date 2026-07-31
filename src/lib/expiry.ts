/**
 * 保质期核心纯函数（SPEC.md §3）。
 *
 * 硬约束：
 * - 零 React、零 Supabase 依赖，输入输出都是普通对象。
 * - 不读系统时间。`today` 一律由调用方传入，函数内部不出现 Date / Date.now / Intl。
 *   日期运算全部用整数历法算术（days-from-civil），因此不存在任何时区或 DST 干扰。
 * - 日期一律是 'YYYY-MM-DD' 字符串，不用 Date 对象跨时区传递（CLAUDE.md 核心规则 5）。
 * - status 只在这里运行时算，绝不落库（CLAUDE.md 核心规则 1）。
 * - 不按 tier 分支：tier 只影响录入表单显示（CLAUDE.md 核心规则 2）。
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

/** 哪个来源胜出，UI 要显示（例如 pao 显示「开封计」）。 */
export type ExpirySource = 'explicit' | 'pao' | 'shelf_life'

export interface ExpiryResult {
  effectiveExpiry: DateStr | null
  daysLeft: number | null // 负数 = 已过期
  status: Status
  source: ExpirySource | null
}

// ---------------------------------------------------------------------------
// 历法工具：纯整数运算，不依赖 Date
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

/** 解析并校验 'YYYY-MM-DD'。非法输入直接抛错，绝不静默返回一个错误的日期。 */
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
 * 公历日期 → 距 1970-01-01 的天数（Howard Hinnant 的 days_from_civil）。
 * 纯整数运算，闰年（含 100/400 世纪规则）由算法本身保证。
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

/** toDayNumber 的逆运算（civil_from_days）。 */
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
 * 加月份。日号溢出时取当月最后一天（SPEC §3.2 明确约定：2026-01-31 + 1 month = 2026-02-28）。
 * 注意这与 JS Date 的行为不同 —— Date 会溢出到 3 月 3 日。
 */
function addMonths(date: DateStr, months: number, field: string): DateStr {
  const { y, m, d } = parseDate(date, field)
  const totalMonths = y * 12 + (m - 1) + months
  const ny = Math.floor(totalMonths / 12)
  const nm = totalMonths - ny * 12 + 1
  return formatDate({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) })
}

// ---------------------------------------------------------------------------
// 主函数
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
 * 从三个来源中取最早的到期日，据此算出剩余天数和状态。
 *
 * @param today 调用方提供的「今天」，'YYYY-MM-DD'。业务上应按 America/Toronto 求得。
 * @throws 任何日期字段格式非法或日期不存在时抛错。
 */
export function computeExpiry(item: ExpiryInput, today: DateStr): ExpiryResult {
  const todayNumber = toDayNumber(parseDate(today, 'today'))

  // 数组顺序即并列同日时的优先级：explicit > pao > shelf_life。
  const candidates: Candidate[] = []

  if (item.expiry_date !== null) {
    // 走一遍 parseDate 做校验，值本身原样使用。
    candidates.push({
      date: formatDate(parseDate(item.expiry_date, 'expiry_date')),
      source: 'explicit',
    })
  }
  // 两者都非空才算 —— 注意 0 是有效值，不能用真值判断。
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

  // 'YYYY-MM-DD' 的字典序等价于时间序，可直接比较字符串。
  // 用严格小于 → 并列时保留数组中靠前的那个，即上面的优先级。
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
