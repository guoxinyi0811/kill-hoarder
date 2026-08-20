// @vitest-environment jsdom

/**
 * SPEC §4 P1 acceptance: when one list item has invalid date data, all other items
 * render normally and the invalid item appears as a clickable warning placeholder.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PendingList } from './PendingList'
import type { Item } from '../lib/types'

afterEach(cleanup)

const LIST_COPY = {
  invalidDate: '日期数据异常',
  expiredGroup: '已过期',
  urgentGroup: '快到期',
  soonGroup: '留意',
  fridge: '冰箱',
  sixDaysLeft: '剩 6 天',
  fiveDaysOverdue: '已过期 5 天',
  dueToday: '今天到期',
  openedBased: '开封计',
  allWithinExpiry: '全都在保质期内',
  noData: '暂无数据',
} as const

const TODAY = '2026-07-30'

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

function renderList(items: Item[]) {
  const onSelect = vi.fn()
  const onConsume = vi.fn()
  render(
    <PendingList
      items={items}
      today={TODAY}
      onSelect={onSelect}
      onConsume={onConsume}
    />,
  )
  return { onSelect, onConsume }
}

describe('isolated rendering for invalid-date items', () => {
  const mixed = [
    item({ name: 'Valid milk', expiry_date: '2026-08-05' }),
    item({ name: 'Invalid data', expiry_date: '2027-02-29' }), // No February 29 in a non-leap year.
    item({ name: 'Valid yogurt', expiry_date: '2026-08-06' }),
  ]

  it('does not crash or blank the whole list', () => {
    expect(() => renderList(mixed)).not.toThrow()
  })

  it('renders the remaining valid items normally', () => {
    renderList(mixed)
    expect(screen.getByText('Valid milk')).toBeTruthy()
    expect(screen.getByText('Valid yogurt')).toBeTruthy()
  })

  it('renders invalid data as the Chinese date-error placeholder', () => {
    renderList(mixed)
    expect(screen.getByText('Invalid data')).toBeTruthy()
    expect(screen.getByText(LIST_COPY.invalidDate)).toBeTruthy()
  })

  it('makes the placeholder clickable for editing and repair', async () => {
    const { onSelect } = renderList(mixed)
    await userEvent.click(screen.getByText('Invalid data'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].name).toBe('Invalid data')
  })

  it('isolates multiple invalid items without affecting a valid item', () => {
    renderList([
      item({ name: 'Invalid 1', expiry_date: '2026-13-01' }),
      item({ name: 'Valid', expiry_date: '2026-08-05' }),
      item({ name: 'Invalid 2', purchase_date: '2026-7-1', shelf_life_days: 5 }),
      item({ name: 'Invalid 3', opened_date: 'nonsense', pao_months: 6 }),
    ])

    expect(screen.getByText('Valid')).toBeTruthy()
    expect(screen.getAllByText(LIST_COPY.invalidDate)).toHaveLength(3)
  })

  it('renders placeholders instead of a blank screen when every item is invalid', () => {
    expect(() =>
      renderList([
        item({ name: 'Invalid 1', expiry_date: 'bad' }),
        item({ name: 'Invalid 2', expiry_date: '2026-02-30' }),
      ]),
    ).not.toThrow()
    expect(screen.getAllByText(LIST_COPY.invalidDate)).toHaveLength(2)
  })
})

describe('filtering and grouping', () => {
  it('shows only expired / urgent / soon and excludes ok / untracked', () => {
    renderList([
      item({ name: 'Expired', expiry_date: '2026-07-01' }),
      item({ name: 'Urgent', expiry_date: '2026-08-10' }),
      item({ name: 'Soon', expiry_date: '2026-09-10' }),
      item({ name: 'Still fine', expiry_date: '2027-07-30' }),
      item({ name: 'Sichuan peppercorns', tier: 'L3' }),
    ])

    expect(screen.getByText('Expired')).toBeTruthy()
    expect(screen.getByText('Urgent')).toBeTruthy()
    expect(screen.getByText('Soon')).toBeTruthy()
    expect(screen.queryByText('Still fine')).toBeNull()
    expect(screen.queryByText('Sichuan peppercorns')).toBeNull()
  })

  it('uses the three Chinese group headings specified by the product', () => {
    renderList([
      item({ name: 'a', expiry_date: '2026-07-01' }),
      item({ name: 'b', expiry_date: '2026-08-10' }),
      item({ name: 'c', expiry_date: '2026-09-10' }),
    ])

    expect(screen.getByText(LIST_COPY.expiredGroup)).toBeTruthy()
    expect(screen.getByText(LIST_COPY.urgentGroup)).toBeTruthy()
    expect(screen.getByText(LIST_COPY.soonGroup)).toBeTruthy()
  })

  it('excludes consumed items', () => {
    renderList([
      item({
        name: 'Consumed item',
        expiry_date: '2026-08-05',
        consumed_at: '2026-07-29T00:00:00Z',
      }),
    ])
    expect(screen.queryByText('Consumed item')).toBeNull()
  })
})

describe('per-item content (SPEC §4 P1)', () => {
  it('shows name, location, and remaining days in Chinese', () => {
    renderList([
      item({ name: 'Greek yogurt', location: 'fridge', expiry_date: '2026-08-05' }),
    ])

    expect(screen.getByText('Greek yogurt')).toBeTruthy()
    const row = screen.getByText('Greek yogurt').closest('li')
    expect(within(row!).getByText(new RegExp(LIST_COPY.fridge))).toBeTruthy()
    expect(within(row!).getByText(new RegExp(LIST_COPY.sixDaysLeft))).toBeTruthy()
  })

  it('shows days overdue for an expired item in Chinese', () => {
    renderList([item({ name: 'Expired item', expiry_date: '2026-07-25' })])
    expect(screen.getByText(new RegExp(LIST_COPY.fiveDaysOverdue))).toBeTruthy()
  })

  it('shows the Chinese "due today" label when expiry is today', () => {
    renderList([item({ name: 'Due today', expiry_date: TODAY })])
    expect(screen.getByText(new RegExp(LIST_COPY.dueToday))).toBeTruthy()
  })

  it('shows the Chinese opened-date marker for a PAO source', () => {
    renderList([
      item({
        name: 'Face cream',
        category: 'skincare',
        location: 'vanity',
        tier: 'L1',
        opened_date: '2026-05-01',
        pao_months: 3, // 2026-08-01; skincare warning threshold 60 => urgent.
      }),
    ])

    expect(screen.getByText(LIST_COPY.openedBased)).toBeTruthy()
  })

  it('does not show the opened-date marker for non-PAO sources', () => {
    renderList([item({ name: 'Milk', expiry_date: '2026-08-05' })])
    expect(screen.queryByText(LIST_COPY.openedBased)).toBeNull()
  })

  it('passes the item to onConsume when its Chinese consumed button is clicked', async () => {
    const { onConsume } = renderList([
      item({ name: 'Milk', expiry_date: '2026-08-05' }),
    ])

    // Chinese accessible name means "Mark Milk as consumed."
    await userEvent.click(screen.getByRole('button', { name: /标记 Milk 已用完/ }))
    expect(onConsume).toHaveBeenCalledTimes(1)
    expect(onConsume.mock.calls[0][0].name).toBe('Milk')
  })

  it('passes the item to onSelect when the row is clicked', async () => {
    const { onSelect } = renderList([
      item({ name: 'Milk', expiry_date: '2026-08-05' }),
    ])

    await userEvent.click(screen.getByText('Milk'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

describe('the empty state is a success state', () => {
  it('shows positive Chinese copy and not a no-data message when there are no items', () => {
    renderList([])
    expect(screen.getByText(LIST_COPY.allWithinExpiry)).toBeTruthy()
    expect(screen.queryByText(LIST_COPY.noData)).toBeNull()
  })

  it('shows the same success state when only ok / untracked items exist', () => {
    renderList([
      item({ name: 'Still fine', expiry_date: '2027-07-30' }),
      item({ name: 'Sichuan peppercorns', tier: 'L3' }),
    ])
    expect(screen.getByText(LIST_COPY.allWithinExpiry)).toBeTruthy()
  })
})
