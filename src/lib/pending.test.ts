import { describe, expect, it } from 'vitest'
import {
  appearsInPending,
  daysLeftLabel,
  groupPending,
  isActive,
  isPendingEmpty,
} from './pending'
import type { Item } from './types'

const TODAY = '2026-07-30'

const DAYS_COPY = {
  oneDayOverdue: '已过期 1 天',
  thirtyDaysOverdue: '已过期 30 天',
  dueToday: '今天到期',
  fiveDaysLeft: '剩 5 天',
} as const

let seq = 0

function item(over: Partial<Item> = {}): Item {
  seq += 1
  return {
    id: `id-${seq}`,
    user_id: 'user-1',
    name: `Item ${seq}`,
    category: 'other', // warn = 30
    location: 'pantry',
    tier: 'L2',
    purchase_date: null,
    expiry_date: null,
    shelf_life_days: null,
    opened_date: null,
    pao_months: null,
    quantity_level: 'full',
    note: null,
    consumed_at: null,
    discarded_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...over,
  }
}

describe('isActive (soft deletion, CLAUDE.md core rule 4)', () => {
  it('returns true when an item is neither consumed nor discarded', () => {
    expect(isActive(item())).toBe(true)
  })

  it('returns false for a consumed item', () => {
    expect(isActive(item({ consumed_at: '2026-07-20T00:00:00Z' }))).toBe(false)
  })

  it('returns false for a discarded item', () => {
    expect(isActive(item({ discarded_at: '2026-07-20T00:00:00Z' }))).toBe(false)
  })
})

describe('groupPending filtering', () => {
  it('keeps expired / urgent / soon and excludes ok / untracked', () => {
    const groups = groupPending(
      [
        item({ name: 'Expired', expiry_date: '2026-07-01' }),
        item({ name: 'Urgent', expiry_date: '2026-08-10' }), // 11 days => urgent.
        item({ name: 'Soon', expiry_date: '2026-09-10' }), // 42 days => soon.
        item({ name: 'Still fine', expiry_date: '2027-07-30' }),
        item({ name: 'Sichuan peppercorns' }), // All date sources empty => untracked.
      ],
      TODAY,
    )

    expect(groups.expired.map((e) => e.item.name)).toEqual(['Expired'])
    expect(groups.urgent.map((e) => e.item.name)).toEqual(['Urgent'])
    expect(groups.soon.map((e) => e.item.name)).toEqual(['Soon'])
    expect(groups.invalid).toEqual([])
  })

  it('excludes consumed and discarded items from the main view', () => {
    const groups = groupPending(
      [
        item({ name: 'Active', expiry_date: '2026-08-05' }),
        item({
          name: 'Consumed',
          expiry_date: '2026-08-05',
          consumed_at: '2026-07-29T12:00:00Z',
        }),
        item({
          name: 'Discarded',
          expiry_date: '2026-08-05',
          discarded_at: '2026-07-29T12:00:00Z',
        }),
      ],
      TODAY,
    )

    expect(groups.urgent.map((e) => e.item.name)).toEqual(['Active'])
  })

  it('uses the warning threshold for each category', () => {
    const groups = groupPending(
      [
        // With 10 days left, fresh (warn 3) is hidden as ok; frozen (warn 15) is urgent.
        item({ name: 'Fresh', category: 'fresh', expiry_date: '2026-08-09' }),
        item({ name: 'Frozen', category: 'frozen', expiry_date: '2026-08-09' }),
      ],
      TODAY,
    )

    expect(groups.urgent.map((e) => e.item.name)).toEqual(['Frozen'])
    expect(groups.soon).toEqual([])
    expect(groups.expired).toEqual([])
  })
})

describe('groupPending sorting', () => {
  it('sorts each group by daysLeft ascending', () => {
    const groups = groupPending(
      [
        item({ name: '20 left', expiry_date: '2026-08-19' }),
        item({ name: '5 left', expiry_date: '2026-08-04' }),
        item({ name: '12 left', expiry_date: '2026-08-11' }),
      ],
      TODAY,
    )

    expect(groups.urgent.map((e) => e.item.name)).toEqual([
      '5 left',
      '12 left',
      '20 left',
    ])
    expect(groups.urgent.map((e) => e.result.daysLeft)).toEqual([5, 12, 20])
  })

  it('puts longer-expired items first because their daysLeft is smaller', () => {
    const groups = groupPending(
      [
        item({ name: 'Expired 1 day', expiry_date: '2026-07-29' }),
        item({ name: 'Expired 30 days', expiry_date: '2026-06-30' }),
        item({ name: 'Expired 10 days', expiry_date: '2026-07-20' }),
      ],
      TODAY,
    )

    expect(groups.expired.map((e) => e.item.name)).toEqual([
      'Expired 30 days',
      'Expired 10 days',
      'Expired 1 day',
    ])
    expect(groups.expired.map((e) => e.result.daysLeft)).toEqual([-30, -10, -1])
  })

  it('sorts equal daysLeft by name for stable rendering', () => {
    const groups = groupPending(
      [
        item({ name: 'C', expiry_date: '2026-08-05' }),
        item({ name: 'A', expiry_date: '2026-08-05' }),
        item({ name: 'B', expiry_date: '2026-08-05' }),
      ],
      TODAY,
    )

    expect(groups.urgent.map((e) => e.item.name)).toEqual(['A', 'B', 'C'])
  })
})

describe('groupPending error isolation (SPEC §4 P1 first defense)', () => {
  it('isolates one invalid date without affecting valid items', () => {
    const groups = groupPending(
      [
        item({ name: 'Valid 1', expiry_date: '2026-08-05' }),
        item({ name: 'Invalid data', expiry_date: '2027-02-29' }), // No February 29 in a non-leap year.
        item({ name: 'Valid 2', expiry_date: '2026-08-06' }),
      ],
      TODAY,
    )

    expect(groups.urgent.map((e) => e.item.name)).toEqual(['Valid 1', 'Valid 2'])
    expect(groups.invalid.map((e) => e.item.name)).toEqual(['Invalid data'])
    expect(groups.invalid[0].message).toBeTruthy()
  })

  it('never throws even when every item is invalid', () => {
    expect(() =>
      groupPending(
        [
          item({ expiry_date: '2026-13-01' }),
          item({ purchase_date: 'not-a-date', shelf_life_days: 10 }),
          item({ opened_date: '2026-02-30', pao_months: 6 }),
        ],
        TODAY,
      ),
    ).not.toThrow()
  })

  it('keeps every invalid shape in the invalid group', () => {
    const groups = groupPending(
      [
        item({ name: 'a', expiry_date: '2026-13-01' }), // Month out of range.
        item({ name: 'b', expiry_date: '2026/07/30' }), // Wrong separator.
        item({ name: 'c', purchase_date: '2026-7-1', shelf_life_days: 10 }), // Not zero-padded.
        item({ name: 'd', opened_date: '2027-02-29', pao_months: 6 }), // Invalid leap date.
      ],
      TODAY,
    )

    expect(groups.invalid.map((e) => e.item.name)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps invalid items out of the three status groups', () => {
    const groups = groupPending(
      [item({ name: 'Invalid', expiry_date: 'not-a-date' })],
      TODAY,
    )

    expect(groups.expired).toEqual([])
    expect(groups.urgent).toEqual([])
    expect(groups.soon).toEqual([])
    expect(groups.invalid).toHaveLength(1)
  })

  it('excludes invalid items that have already been consumed', () => {
    const groups = groupPending(
      [
        item({
          name: 'Invalid and consumed',
          expiry_date: '2027-02-29',
          consumed_at: '2026-07-01T00:00:00Z',
        }),
      ],
      TODAY,
    )

    expect(groups.invalid).toEqual([])
  })
})

describe('isPendingEmpty (empty is a success state)', () => {
  it('returns true for empty groups', () => {
    expect(isPendingEmpty(groupPending([], TODAY))).toBe(true)
  })

  it('returns true when only ok / untracked items exist', () => {
    const groups = groupPending(
      [item({ expiry_date: '2027-07-30' }), item({ name: 'Sichuan peppercorns' })],
      TODAY,
    )
    expect(isPendingEmpty(groups)).toBe(true)
  })

  it('returns false when an invalid item needs a repair placeholder', () => {
    const groups = groupPending([item({ expiry_date: 'bad' })], TODAY)
    expect(isPendingEmpty(groups)).toBe(false)
  })
})

describe('appearsInPending (decides whether save needs a toast)', () => {
  it('returns true for an urgent item handled by optimistic rendering', () => {
    expect(appearsInPending(item({ expiry_date: '2026-08-05' }), TODAY)).toBe(
      true,
    )
  })

  it('returns true for an expired item', () => {
    expect(appearsInPending(item({ expiry_date: '2026-07-01' }), TODAY)).toBe(
      true,
    )
  })

  it('returns true for a soon item', () => {
    expect(appearsInPending(item({ expiry_date: '2026-09-10' }), TODAY)).toBe(
      true,
    )
  })

  it('returns false for an ok item that needs a toast', () => {
    expect(appearsInPending(item({ expiry_date: '2027-07-30' }), TODAY)).toBe(
      false,
    )
  })

  it('returns false for an untracked L3 item that needs a toast', () => {
    expect(appearsInPending(item({ tier: 'L3' }), TODAY)).toBe(false)
  })

  it('returns true for an invalid date rendered as a placeholder', () => {
    expect(appearsInPending(item({ expiry_date: '2027-02-29' }), TODAY)).toBe(
      true,
    )
  })

  it('returns false for a consumed item', () => {
    expect(
      appearsInPending(
        item({
          expiry_date: '2026-08-05',
          consumed_at: '2026-07-30T00:00:00Z',
        }),
        TODAY,
      ),
    ).toBe(false)
  })
})

describe('daysLeftLabel', () => {
  it('formats negative values as Chinese days-overdue text', () => {
    expect(daysLeftLabel(-1)).toBe(DAYS_COPY.oneDayOverdue)
    expect(daysLeftLabel(-30)).toBe(DAYS_COPY.thirtyDaysOverdue)
  })

  it('formats zero as the Chinese due-today text', () => {
    expect(daysLeftLabel(0)).toBe(DAYS_COPY.dueToday)
  })

  it('formats positive values as Chinese remaining-days text', () => {
    expect(daysLeftLabel(5)).toBe(DAYS_COPY.fiveDaysLeft)
  })
})
