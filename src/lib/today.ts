/**
 * Resolve "today" in the fixed America/Toronto time zone (core rule 5).
 *
 * This is the only module allowed to read the system clock. Tests prohibit Date / Intl
 * in expiry.ts, so callers resolve today here and pass it into computeExpiry.
 *
 * Zero React or Supabase dependencies.
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
 * Convert an instant into its America/Toronto calendar date as 'YYYY-MM-DD'.
 *
 * formatToParts supplies individual fields, avoiding locale-specific presentation
 * and ICU formatting differences between runtimes.
 *
 * @param now Instant to convert; defaults to the current system time. Tests pass a fixed Date.
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
