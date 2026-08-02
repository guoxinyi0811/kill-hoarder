/**
 * 「今天」的求值，固定时区 America/Toronto（CLAUDE.md 核心规则 5）。
 *
 * 这是整个项目里**唯一**允许读系统时间的模块。expiry.ts 被测试锁死了不许碰
 * Date / Intl，所以求今天这件事必须单独放在这里，由调用方把结果传进 computeExpiry。
 *
 * 零 React、零 Supabase 依赖。
 */

import type { DateStr } from './expiry'

export const APP_TIME_ZONE = 'America/Toronto'

const FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * 把某个时刻换算成 America/Toronto 当地日历日的 'YYYY-MM-DD'。
 *
 * 用 formatToParts 逐字段取值再拼接，不依赖 locale 的输出排版，
 * 因此不会因为运行环境的 ICU 数据差异而拼出别的格式。
 *
 * @param now 要换算的时刻，默认取当前系统时间。测试时传入固定 Date。
 */
export function torontoToday(now: Date = new Date()): DateStr {
  const parts = FORMATTER.formatToParts(now)
  let year = ''
  let month = ''
  let day = ''
  for (const part of parts) {
    if (part.type === 'year') year = part.value
    else if (part.type === 'month') month = part.value
    else if (part.type === 'day') day = part.value
  }
  return `${year}-${month}-${day}`
}
