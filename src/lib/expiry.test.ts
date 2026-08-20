import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CATEGORIES, WARN_DAYS, type Category } from './enums'
import { computeExpiry, type DateStr, type ExpiryInput } from './expiry'

/**
 * Case numbers correspond to the nine required P0 cases in SPEC.md §3.2.
 * Each describe title identifies the requirement it covers.
 */

/** Build an ExpiryInput with empty defaults and category other (warn = 30). */
function input(over: Partial<ExpiryInput> = {}): ExpiryInput {
  return {
    category: 'other',
    purchase_date: null,
    expiry_date: null,
    shelf_life_days: null,
    opened_date: null,
    pao_months: null,
    ...over,
  }
}

/**
 * Independent test-side date addition based on Date.UTC.
 * Production uses integer civil-calendar arithmetic without Date, so the distinct
 * algorithms cross-check each other instead of duplicating the implementation.
 */
function plusDays(date: DateStr, n: number): DateStr {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

const TODAY: DateStr = '2026-07-30'

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// §3.2 1: each of the three sources in isolation.
// ---------------------------------------------------------------------------

describe('§3.2 1: each source in isolation', () => {
  it('uses explicit when only expiry_date exists', () => {
    const r = computeExpiry(input({ expiry_date: '2026-08-10' }), TODAY)
    expect(r).toEqual({
      effectiveExpiry: '2026-08-10',
      daysLeft: 11,
      status: 'urgent', // other warn = 30; 11 <= 30.
      source: 'explicit',
    })
  })

  it('uses pao when only opened_date + pao_months exist', () => {
    const r = computeExpiry(
      input({ category: 'skincare', opened_date: '2026-07-01', pao_months: 3 }),
      TODAY,
    )
    expect(r).toEqual({
      effectiveExpiry: '2026-10-01',
      daysLeft: 63,
      status: 'soon', // skincare warn = 60; 60 < 63 <= 120.
      source: 'pao',
    })
  })

  it('uses shelf_life when only purchase_date + shelf_life_days exist', () => {
    const r = computeExpiry(
      input({
        category: 'fresh',
        purchase_date: '2026-07-01',
        shelf_life_days: 30,
      }),
      TODAY,
    )
    expect(r).toEqual({
      effectiveExpiry: '2026-07-31',
      daysLeft: 1,
      status: 'urgent', // fresh warn = 3.
      source: 'shelf_life',
    })
  })
})

// ---------------------------------------------------------------------------
// §3.2 2: choose the earliest when multiple sources conflict.
// ---------------------------------------------------------------------------

describe('§3.2 2: choose the earliest conflicting source', () => {
  it('uses six-month PAO before a skincare expiry date in 2027', () => {
    const r = computeExpiry(
      input({
        category: 'skincare',
        expiry_date: '2027-12-31',
        opened_date: '2026-05-01',
        pao_months: 6,
      }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-11-01')
    expect(r.source).toBe('pao')
    expect(r.daysLeft).toBe(94)
    expect(r.status).toBe('soon') // skincare warn = 60，60 < 94 <= 120
  })

  it('uses shelf_life when it is earliest among all three sources', () => {
    const r = computeExpiry(
      input({
        expiry_date: '2026-12-01',
        opened_date: '2026-07-01',
        pao_months: 4, // → 2026-11-01
        purchase_date: '2026-07-20',
        shelf_life_days: 10, // → 2026-07-30
      }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-07-30')
    expect(r.source).toBe('shelf_life')
  })

  it('uses explicit when it is earliest among all three sources', () => {
    const r = computeExpiry(
      input({
        expiry_date: '2026-08-05',
        opened_date: '2026-07-01',
        pao_months: 4, // → 2026-11-01
        purchase_date: '2026-07-20',
        shelf_life_days: 100, // → 2026-10-28
      }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-08-05')
    expect(r.source).toBe('explicit')
  })

  it('uses shelf_life when explicit is later', () => {
    const r = computeExpiry(
      input({
        expiry_date: '2027-01-01',
        purchase_date: '2026-07-10',
        shelf_life_days: 40, // → 2026-08-19
      }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-08-19')
    expect(r.source).toBe('shelf_life')
  })

  it('prefers explicit over pao when they resolve to the same date', () => {
    const r = computeExpiry(
      input({
        expiry_date: '2026-11-01',
        opened_date: '2026-05-01',
        pao_months: 6, // 2026-11-01, the same date as explicit.
      }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-11-01')
    expect(r.source).toBe('explicit')
  })

  it('prefers pao over shelf_life when they resolve to the same date', () => {
    const r = computeExpiry(
      input({
        opened_date: '2026-05-01',
        pao_months: 6, // → 2026-11-01
        purchase_date: '2026-10-31',
        shelf_life_days: 1, // 2026-11-01, the same date.
      }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-11-01')
    expect(r.source).toBe('pao')
  })
})

// ---------------------------------------------------------------------------
// §3.2 3: all sources empty => untracked.
// ---------------------------------------------------------------------------

describe('§3.2 3: all sources empty', () => {
  it('returns untracked with null derived fields when all five inputs are null', () => {
    expect(computeExpiry(input(), TODAY)).toEqual({
      effectiveExpiry: null,
      daysLeft: null,
      status: 'untracked',
      source: null,
    })
  })

  it('returns untracked regardless of category', () => {
    for (const category of CATEGORIES) {
      expect(computeExpiry(input({ category }), TODAY).status).toBe('untracked')
    }
  })
})

// ---------------------------------------------------------------------------
// §3.2 4: incomplete source pairs do not participate.
// ---------------------------------------------------------------------------

describe('§3.2 4: incomplete source pairs are ignored', () => {
  it('returns untracked with opened_date but no pao_months', () => {
    expect(computeExpiry(input({ opened_date: '2026-07-01' }), TODAY)).toEqual({
      effectiveExpiry: null,
      daysLeft: null,
      status: 'untracked',
      source: null,
    })
  })

  it('returns untracked with pao_months but no opened_date', () => {
    expect(computeExpiry(input({ pao_months: 6 }), TODAY).status).toBe(
      'untracked',
    )
  })

  it('returns untracked with purchase_date but no shelf_life_days', () => {
    expect(computeExpiry(input({ purchase_date: '2026-07-01' }), TODAY)).toEqual(
      {
        effectiveExpiry: null,
        daysLeft: null,
        status: 'untracked',
        source: null,
      },
    )
  })

  it('returns untracked with shelf_life_days but no purchase_date', () => {
    expect(computeExpiry(input({ shelf_life_days: 30 }), TODAY).status).toBe(
      'untracked',
    )
  })

  it('uses a complete shelf_life source while ignoring an incomplete PAO source', () => {
    const r = computeExpiry(
      input({
        opened_date: '2026-01-01', // No pao_months; incorrect participation would produce an earlier date.
        purchase_date: '2026-07-20',
        shelf_life_days: 30, // → 2026-08-19
      }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-08-19')
    expect(r.source).toBe('shelf_life')
  })

  it('treats shelf_life_days zero as valid and expiring on purchase date', () => {
    const r = computeExpiry(
      input({ purchase_date: '2026-07-30', shelf_life_days: 0 }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-07-30')
    expect(r.source).toBe('shelf_life')
    expect(r.daysLeft).toBe(0)
  })

  it('treats pao_months zero as valid rather than empty', () => {
    const r = computeExpiry(
      input({ opened_date: '2026-07-30', pao_months: 0 }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-07-30')
    expect(r.source).toBe('pao')
    expect(r.daysLeft).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// §3.2 5: daysLeft and status boundaries.
// ---------------------------------------------------------------------------

describe('§3.2 5: status boundaries (category other, warn 30)', () => {
  const warn = WARN_DAYS.other

  it('locks WARN_DAYS.other at 30 for the fixed-date cases below', () => {
    expect(warn).toBe(30)
  })

  it('classifies daysLeft zero as urgent rather than expired', () => {
    const r = computeExpiry(input({ expiry_date: '2026-07-30' }), TODAY)
    expect(r.daysLeft).toBe(0)
    expect(r.status).toBe('urgent')
  })

  it('daysLeft === -1 → expired', () => {
    const r = computeExpiry(input({ expiry_date: '2026-07-29' }), TODAY)
    expect(r.daysLeft).toBe(-1)
    expect(r.status).toBe('expired')
  })

  it('classifies a large negative daysLeft as expired', () => {
    const r = computeExpiry(input({ expiry_date: '2025-01-01' }), TODAY)
    expect(r.daysLeft).toBe(-575)
    expect(r.status).toBe('expired')
  })

  it('daysLeft === warn（30）→ urgent', () => {
    const r = computeExpiry(input({ expiry_date: '2026-08-29' }), TODAY)
    expect(r.daysLeft).toBe(30)
    expect(r.status).toBe('urgent')
  })

  it('daysLeft === warn + 1（31）→ soon', () => {
    const r = computeExpiry(input({ expiry_date: '2026-08-30' }), TODAY)
    expect(r.daysLeft).toBe(31)
    expect(r.status).toBe('soon')
  })

  it('daysLeft === warn * 2（60）→ soon', () => {
    const r = computeExpiry(input({ expiry_date: '2026-09-28' }), TODAY)
    expect(r.daysLeft).toBe(60)
    expect(r.status).toBe('soon')
  })

  it('daysLeft === warn * 2 + 1（61）→ ok', () => {
    const r = computeExpiry(input({ expiry_date: '2026-09-29' }), TODAY)
    expect(r.daysLeft).toBe(61)
    expect(r.status).toBe('ok')
  })
})

// ---------------------------------------------------------------------------
// §3.2 6: add months across boundaries and clamp overflow to month end.
// ---------------------------------------------------------------------------

describe('§3.2 6: month addition and end-of-month clamping', () => {
  /** Exercise opened_date + pao_months through the PAO branch. */
  function paoExpiry(opened: DateStr, months: number): DateStr | null {
    return computeExpiry(
      input({ opened_date: opened, pao_months: months }),
      TODAY,
    ).effectiveExpiry
  }

  it('clamps 2026-01-31 + 1 month to 2026-02-28 as specified', () => {
    expect(paoExpiry('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('clamps 2026-01-31 + 3 months to April 30', () => {
    expect(paoExpiry('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('2026-03-31 + 1 month → 2026-04-30', () => {
    expect(paoExpiry('2026-03-31', 1)).toBe('2026-04-30')
  })

  it('preserves the day for 2026-01-15 + 1 month', () => {
    expect(paoExpiry('2026-01-15', 1)).toBe('2026-02-15')
  })

  it('crosses the year for 2026-12-15 + 2 months', () => {
    expect(paoExpiry('2026-12-15', 2)).toBe('2027-02-15')
  })

  it('crosses the year and clamps 2026-08-31 + 6 months', () => {
    expect(paoExpiry('2026-08-31', 6)).toBe('2027-02-28')
  })

  it('adds a full year for 2026-11-30 + 12 months', () => {
    expect(paoExpiry('2026-11-30', 12)).toBe('2027-11-30')
  })

  it('crosses a year and clamps 2026-05-31 + 18 months to a 30-day month', () => {
    expect(paoExpiry('2026-05-31', 18)).toBe('2027-11-30')
  })

  it('crosses the year without overflow for 2026-12-31 + 1 month', () => {
    expect(paoExpiry('2026-12-31', 1)).toBe('2027-01-31')
  })
})

// ---------------------------------------------------------------------------
// §3.2 7: leap years.
// ---------------------------------------------------------------------------

describe('§3.2 7: leap years', () => {
  function paoExpiry(opened: DateStr, months: number): DateStr | null {
    return computeExpiry(
      input({ opened_date: opened, pao_months: months }),
      TODAY,
    ).effectiveExpiry
  }

  it('preserves February 29 for 2027-08-29 + 6 months in a leap year', () => {
    expect(paoExpiry('2027-08-29', 6)).toBe('2028-02-29')
  })

  it('clamps 2028-01-31 + 1 month to leap-day February 29', () => {
    expect(paoExpiry('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('clamps leap day plus one year to February 28 in 2029', () => {
    expect(paoExpiry('2028-02-29', 12)).toBe('2029-02-28')
  })

  it('2028-02-29 + 1 month → 2028-03-29', () => {
    expect(paoExpiry('2028-02-29', 1)).toBe('2028-03-29')
  })

  it('treats 2100 as non-leap because it is divisible by 100 but not 400', () => {
    expect(paoExpiry('2100-01-31', 1)).toBe('2100-02-28')
  })

  it('treats 2000 as leap because it is divisible by 400', () => {
    expect(paoExpiry('2000-01-31', 1)).toBe('2000-02-29')
  })

  it('adds one day across leap day from 2028-02-28', () => {
    const r = computeExpiry(
      input({ purchase_date: '2028-02-28', shelf_life_days: 1 }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2028-02-29')
  })

  it('adds two days across leap day from 2028-02-28', () => {
    const r = computeExpiry(
      input({ purchase_date: '2028-02-28', shelf_life_days: 2 }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2028-03-01')
  })

  it('moves from February 28 to March 1 in a non-leap year', () => {
    const r = computeExpiry(
      input({ purchase_date: '2027-02-28', shelf_life_days: 1 }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2027-03-01')
  })

  it('counts two days from 2028-02-28 to 2028-03-01 across leap day', () => {
    const r = computeExpiry(
      input({ expiry_date: '2028-03-01' }),
      '2028-02-28' as DateStr,
    )
    expect(r.daysLeft).toBe(2)
  })

  it('counts 366 days across leap year 2028', () => {
    const r = computeExpiry(
      input({ expiry_date: '2029-01-01' }),
      '2028-01-01' as DateStr,
    )
    expect(r.daysLeft).toBe(366)
  })

  it('counts 365 days across non-leap year 2026', () => {
    const r = computeExpiry(
      input({ expiry_date: '2027-01-01' }),
      '2026-01-01' as DateStr,
    )
    expect(r.daysLeft).toBe(365)
  })
})

// ---------------------------------------------------------------------------
// §3.2 8: category-specific warning thresholds.
// ---------------------------------------------------------------------------

describe('§3.2 8: category-specific warning thresholds', () => {
  it('matches WARN_DAYS exactly to CLAUDE.md', () => {
    expect(WARN_DAYS).toEqual({
      fresh: 3,
      frozen: 15,
      snack: 15,
      condiment: 30,
      skincare: 60,
      medicine: 30,
      other: 30,
    })
  })

  it.each(CATEGORIES)('%s uses its own warn value for all three boundaries', (category) => {
    const warn = WARN_DAYS[category as Category]

    const at = (days: number) =>
      computeExpiry(
        input({ category, expiry_date: plusDays(TODAY, days) }),
        TODAY,
      ).status

    expect(at(warn)).toBe('urgent')
    expect(at(warn + 1)).toBe('soon')
    expect(at(warn * 2)).toBe('soon')
    expect(at(warn * 2 + 1)).toBe('ok')
  })

  it('classifies 10 days as ok for fresh but urgent for frozen', () => {
    const expiry = plusDays(TODAY, 10)
    expect(
      computeExpiry(input({ category: 'fresh', expiry_date: expiry }), TODAY)
        .status,
    ).toBe('ok') // fresh warn = 3，10 > 6
    expect(
      computeExpiry(input({ category: 'frozen', expiry_date: expiry }), TODAY)
        .status,
    ).toBe('urgent') // frozen warn = 15，10 <= 15
  })

  it('classifies 100 days as soon for skincare and ok for all other categories', () => {
    const expiry = plusDays(TODAY, 100)
    expect(
      computeExpiry(input({ category: 'skincare', expiry_date: expiry }), TODAY)
        .status,
    ).toBe('soon') // skincare warn = 60，60 < 100 <= 120
    for (const category of CATEGORIES) {
      if (category === 'skincare') continue
      expect(
        computeExpiry(input({ category, expiry_date: expiry }), TODAY).status,
      ).toBe('ok')
    }
  })

  it('classifies expired dates as expired for every category', () => {
    for (const category of CATEGORIES) {
      expect(
        computeExpiry(
          input({ category, expiry_date: '2026-07-29' }),
          TODAY,
        ).status,
      ).toBe('expired')
    }
  })
})

// ---------------------------------------------------------------------------
// §3.2 9: callers provide today; the function never reads system time.
// ---------------------------------------------------------------------------

describe('§3.2 9: caller-provided today and no system clock reads', () => {
  const item = input({ expiry_date: '2026-08-10' })

  it('is unchanged when system time is set to 2000', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'))
    expect(computeExpiry(item, TODAY)).toEqual({
      effectiveExpiry: '2026-08-10',
      daysLeft: 11,
      status: 'urgent',
      source: 'explicit',
    })
  })

  it('is unchanged when system time is set to 2099', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2099-12-31T23:59:59Z'))
    expect(computeExpiry(item, TODAY)).toEqual({
      effectiveExpiry: '2026-08-10',
      daysLeft: 11,
      status: 'urgent',
      source: 'explicit',
    })
  })

  it('changes daysLeft when the same item receives a different today', () => {
    expect(computeExpiry(item, '2026-08-09').daysLeft).toBe(1)
    expect(computeExpiry(item, '2026-08-10').daysLeft).toBe(0)
    expect(computeExpiry(item, '2026-08-11').daysLeft).toBe(-1)
  })

  it('uses calendar-day differences without time-zone or 23-hour DST effects', () => {
    // Local Date subtraction across Toronto's March 14, 2027 DST transition would
    // produce 0.958 days and could truncate to zero; calendar arithmetic must return one.
    const r = computeExpiry(
      input({ expiry_date: '2027-03-15' }),
      '2027-03-13' as DateStr,
    )
    expect(r.daysLeft).toBe(2)
  })

  /** Extract every imported or re-exported module specifier from source. */
  function moduleSpecifiers(file: string): string[] {
    const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    return [...src.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
  }

  function sourceOf(file: string): string {
    return readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
  }

  it.each(['expiry.ts', 'enums.ts'])(
    '%s permits only relative imports and therefore no React, Supabase, or third-party dependency',
    (file) => {
      for (const specifier of moduleSpecifiers(file)) {
        expect(specifier).toMatch(/^\.{1,2}\//)
      }
    },
  )

  it.each(['expiry.ts', 'enums.ts'])('%s does not read global time', (file) => {
    const src = sourceOf(file)

    expect(src).not.toMatch(/new\s+Date\s*\(/) // Never construct Date.
    expect(src).not.toMatch(/\bDate\s*\.\s*(now|UTC|parse)\s*\(/) // Never read the clock.
    expect(src).not.toMatch(/performance\s*\.\s*now\s*\(/)
    expect(src).not.toMatch(/\bIntl\s*\./) // Avoid localization APIs that introduce time zones.
    expect(src).not.toMatch(/toLocale[A-Za-z]*\s*\(/)
    expect(src).not.toMatch(/getTimezoneOffset/)
  })
})

// ---------------------------------------------------------------------------
// Additional guard: invalid input must not silently return a wrong answer.
// ---------------------------------------------------------------------------

describe('invalid date input', () => {
  it.each([
    ['2026-7-30', 'month is not zero-padded'],
    ['26-07-30', 'year is not four digits'],
    ['2026/07/30', 'separator is not a hyphen'],
    ['2026-13-01', 'month is out of range'],
    ['2026-02-30', 'day does not exist in the month'],
    ['2027-02-29', 'February 29 does not exist in a non-leap year'],
    ['', 'empty string'],
    ['not-a-date', 'not a date at all'],
  ])('throws for expiry_date = %j (%s) instead of returning a wrong answer', (bad) => {
    expect(() => computeExpiry(input({ expiry_date: bad }), TODAY)).toThrow()
  })

  it('throws when today is invalid', () => {
    expect(() =>
      computeExpiry(input({ expiry_date: '2026-08-10' }), '2026-07-3'),
    ).toThrow()
  })

  it('accepts valid leap date 2028-02-29', () => {
    expect(() =>
      computeExpiry(input({ expiry_date: '2028-02-29' }), TODAY),
    ).not.toThrow()
  })
})
