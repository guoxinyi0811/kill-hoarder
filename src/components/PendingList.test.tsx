// @vitest-environment jsdom

/**
 * SPEC §4 P1 验收：
 * 「列表中混入一条日期非法的数据时，其余条目正常渲染，
 *   该条显示为可点击的『⚠️ 日期数据异常』」
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PendingList } from './PendingList'
import type { Item } from '../lib/types'

afterEach(cleanup)

const TODAY = '2026-07-30'

let seq = 0

function item(over: Partial<Item> = {}): Item {
  seq += 1
  return {
    id: `id-${seq}`,
    user_id: 'user-1',
    name: `物品${seq}`,
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

describe('非法日期条目的隔离渲染', () => {
  const mixed = [
    item({ name: '正常牛奶', expiry_date: '2026-08-05' }),
    item({ name: '坏数据', expiry_date: '2027-02-29' }), // 平年没有闰日
    item({ name: '正常酸奶', expiry_date: '2026-08-06' }),
  ]

  it('整个列表不白屏，渲染不抛错', () => {
    expect(() => renderList(mixed)).not.toThrow()
  })

  it('其余条目正常渲染', () => {
    renderList(mixed)
    expect(screen.getByText('正常牛奶')).toBeTruthy()
    expect(screen.getByText('正常酸奶')).toBeTruthy()
  })

  it('坏数据显示成「日期数据异常」占位', () => {
    renderList(mixed)
    expect(screen.getByText('坏数据')).toBeTruthy()
    expect(screen.getByText('日期数据异常')).toBeTruthy()
  })

  it('占位可点击，点了能进编辑页修复', async () => {
    const { onSelect } = renderList(mixed)
    await userEvent.click(screen.getByText('坏数据'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].name).toBe('坏数据')
  })

  it('多条坏数据同时存在也不影响正常条目', () => {
    renderList([
      item({ name: '坏1', expiry_date: '2026-13-01' }),
      item({ name: '正常', expiry_date: '2026-08-05' }),
      item({ name: '坏2', purchase_date: '2026-7-1', shelf_life_days: 5 }),
      item({ name: '坏3', opened_date: 'nonsense', pao_months: 6 }),
    ])

    expect(screen.getByText('正常')).toBeTruthy()
    expect(screen.getAllByText('日期数据异常')).toHaveLength(3)
  })

  it('全是坏数据时也能渲染出列表而不是白屏', () => {
    expect(() =>
      renderList([
        item({ name: '坏1', expiry_date: 'bad' }),
        item({ name: '坏2', expiry_date: '2026-02-30' }),
      ]),
    ).not.toThrow()
    expect(screen.getAllByText('日期数据异常')).toHaveLength(2)
  })
})

describe('筛选与分组', () => {
  it('只显示 expired / urgent / soon，ok 和 untracked 不出现', () => {
    renderList([
      item({ name: '过期的', expiry_date: '2026-07-01' }),
      item({ name: '紧急的', expiry_date: '2026-08-10' }),
      item({ name: '留意的', expiry_date: '2026-09-10' }),
      item({ name: '还早的', expiry_date: '2027-07-30' }),
      item({ name: '花椒', tier: 'L3' }),
    ])

    expect(screen.getByText('过期的')).toBeTruthy()
    expect(screen.getByText('紧急的')).toBeTruthy()
    expect(screen.getByText('留意的')).toBeTruthy()
    expect(screen.queryByText('还早的')).toBeNull()
    expect(screen.queryByText('花椒')).toBeNull()
  })

  it('三个分组标题按 SPEC 命名', () => {
    renderList([
      item({ name: 'a', expiry_date: '2026-07-01' }),
      item({ name: 'b', expiry_date: '2026-08-10' }),
      item({ name: 'c', expiry_date: '2026-09-10' }),
    ])

    expect(screen.getByText('已过期')).toBeTruthy()
    expect(screen.getByText('快到期')).toBeTruthy()
    expect(screen.getByText('留意')).toBeTruthy()
  })

  it('已消耗的条目不出现', () => {
    renderList([
      item({
        name: '已用完的',
        expiry_date: '2026-08-05',
        consumed_at: '2026-07-29T00:00:00Z',
      }),
    ])
    expect(screen.queryByText('已用完的')).toBeNull()
  })
})

describe('每条显示的内容（SPEC §4 P1）', () => {
  it('显示名称、位置、剩余天数', () => {
    renderList([
      item({ name: '希腊酸奶', location: 'fridge', expiry_date: '2026-08-05' }),
    ])

    expect(screen.getByText('希腊酸奶')).toBeTruthy()
    const row = screen.getByText('希腊酸奶').closest('li')
    expect(within(row!).getByText(/冰箱/)).toBeTruthy()
    expect(within(row!).getByText(/剩 6 天/)).toBeTruthy()
  })

  it('已过期显示过期天数', () => {
    renderList([item({ name: '过期了', expiry_date: '2026-07-25' })])
    expect(screen.getByText(/已过期 5 天/)).toBeTruthy()
  })

  it('当天到期显示「今天到期」', () => {
    renderList([item({ name: '今天', expiry_date: TODAY })])
    expect(screen.getByText(/今天到期/)).toBeTruthy()
  })

  it('PAO 来源的条目显示「开封计」标记', () => {
    renderList([
      item({
        name: '面霜',
        category: 'skincare',
        location: 'vanity',
        tier: 'L1',
        opened_date: '2026-05-01',
        pao_months: 3, // → 2026-08-01，skincare warn 60 → urgent
      }),
    ])

    expect(screen.getByText('开封计')).toBeTruthy()
  })

  it('非 PAO 来源不显示「开封计」', () => {
    renderList([item({ name: '牛奶', expiry_date: '2026-08-05' })])
    expect(screen.queryByText('开封计')).toBeNull()
  })

  it('每条有「已用完」按钮，点击回调带上该条目', async () => {
    const { onConsume } = renderList([
      item({ name: '牛奶', expiry_date: '2026-08-05' }),
    ])

    await userEvent.click(screen.getByRole('button', { name: /标记 牛奶 已用完/ }))
    expect(onConsume).toHaveBeenCalledTimes(1)
    expect(onConsume.mock.calls[0][0].name).toBe('牛奶')
  })

  it('点条目本身进编辑页', async () => {
    const { onSelect } = renderList([
      item({ name: '牛奶', expiry_date: '2026-08-05' }),
    ])

    await userEvent.click(screen.getByText('牛奶'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

describe('空状态是成功状态', () => {
  it('没有任何条目时给正向文案，不出现「暂无数据」', () => {
    renderList([])
    expect(screen.getByText('全都在保质期内')).toBeTruthy()
    expect(screen.queryByText(/暂无数据/)).toBeNull()
  })

  it('只有 ok / untracked 条目时同样是空状态', () => {
    renderList([
      item({ name: '还早的', expiry_date: '2027-07-30' }),
      item({ name: '花椒', tier: 'L3' }),
    ])
    expect(screen.getByText('全都在保质期内')).toBeTruthy()
  })
})
