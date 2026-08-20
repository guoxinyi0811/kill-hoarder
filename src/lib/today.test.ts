import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_TIME_ZONE, torontoToday } from './today'

afterEach(() => {
  vi.useRealTimers()
})

describe('torontoToday', () => {
  it('uses the fixed America/Toronto time zone (CLAUDE.md core rule 5)', () => {
    expect(APP_TIME_ZONE).toBe('America/Toronto')
  })

  it('returns YYYY-MM-DD format', () => {
    expect(torontoToday(new Date('2026-08-02T15:00:00Z'))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
  })

  it('remains on the previous day at 03:59 UTC during UTC-4 daylight time', () => {
    // 2026-08-02T03:59Z = 2026-08-01 23:59 EDT in Toronto.
    expect(torontoToday(new Date('2026-08-02T03:59:00Z'))).toBe('2026-08-01')
  })

  it('rolls to the next day at 04:00 UTC during UTC-4 daylight time', () => {
    // 2026-08-02T04:00Z = 2026-08-02 00:00 EDT in Toronto.
    expect(torontoToday(new Date('2026-08-02T04:00:00Z'))).toBe('2026-08-02')
  })

  it('remains on the previous day at 04:59 UTC during UTC-5 standard time', () => {
    // 2026-01-15T04:59Z = 2026-01-14 23:59 EST in Toronto.
    expect(torontoToday(new Date('2026-01-15T04:59:00Z'))).toBe('2026-01-14')
  })

  it('rolls to the next day at 05:00 UTC during UTC-5 standard time', () => {
    expect(torontoToday(new Date('2026-01-15T05:00:00Z'))).toBe('2026-01-15')
  })

  it('stays in the previous year when UTC has already crossed New Year', () => {
    // 2027-01-01T00:30Z = 2026-12-31 19:30 EST in Toronto.
    expect(torontoToday(new Date('2027-01-01T00:30:00Z'))).toBe('2026-12-31')
  })

  it('returns leap day in Toronto during early UTC hours on March 1', () => {
    expect(torontoToday(new Date('2028-03-01T04:30:00Z'))).toBe('2028-02-29')
  })

  it('zero-pads month and day', () => {
    expect(torontoToday(new Date('2026-03-05T18:00:00Z'))).toBe('2026-03-05')
  })

  it('reads the system clock when no argument is provided', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-02T18:00:00Z'))
    expect(torontoToday()).toBe('2026-08-02')
  })

  it('is independent of the host time zone', () => {
    const instant = new Date('2026-08-02T03:59:00Z')
    const original = process.env.TZ
    try {
      process.env.TZ = 'Asia/Shanghai'
      const shanghai = torontoToday(instant)
      process.env.TZ = 'UTC'
      const utc = torontoToday(instant)
      expect(shanghai).toBe('2026-08-01')
      expect(utc).toBe('2026-08-01')
    } finally {
      process.env.TZ = original
    }
  })
})
