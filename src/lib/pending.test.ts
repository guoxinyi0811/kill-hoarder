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

describe('isActive（软删除，CLAUDE.md 核心规则 4）', () => {
  it('未消耗未丢弃 → 活动条目', () => {
    expect(isActive(item())).toBe(true)
  })

  it('已消耗 → 非活动', () => {
    expect(isActive(item({ consumed_at: '2026-07-20T00:00:00Z' }))).toBe(false)
  })

  it('已丢弃 → 非活动', () => {
    expect(isActive(item({ discarded_at: '2026-07-20T00:00:00Z' }))).toBe(false)
  })
})

describe('groupPending 筛选', () => {
  it('只保留 expired / urgent / soon，ok 和 untracked 都不进主视图', () => {
    const groups = groupPending(
      [
        item({ name: '过期的', expiry_date: '2026-07-01' }), // expired
        item({ name: '紧急的', expiry_date: '2026-08-10' }), // 11 天 → urgent
        item({ name: '留意的', expiry_date: '2026-09-10' }), // 42 天 → soon
        item({ name: '还早的', expiry_date: '2027-07-30' }), // ok
        item({ name: '花椒' }), // 全空 → untracked
      ],
      TODAY,
    )

    expect(groups.expired.map((e) => e.item.name)).toEqual(['过期的'])
    expect(groups.urgent.map((e) => e.item.name)).toEqual(['紧急的'])
    expect(groups.soon.map((e) => e.item.name)).toEqual(['留意的'])
    expect(groups.invalid).toEqual([])
  })

  it('已消耗/已丢弃的条目不出现在主视图（标记消耗后条目消失）', () => {
    const groups = groupPending(
      [
        item({ name: '还在', expiry_date: '2026-08-05' }),
        item({
          name: '已用完',
          expiry_date: '2026-08-05',
          consumed_at: '2026-07-29T12:00:00Z',
        }),
        item({
          name: '已丢弃',
          expiry_date: '2026-08-05',
          discarded_at: '2026-07-29T12:00:00Z',
        }),
      ],
      TODAY,
    )

    expect(groups.urgent.map((e) => e.item.name)).toEqual(['还在'])
  })

  it('不同 category 走各自的 warn 阈值', () => {
    const groups = groupPending(
      [
        // 剩 10 天：fresh(warn 3) → ok 不显示；frozen(warn 15) → urgent
        item({ name: '生鲜', category: 'fresh', expiry_date: '2026-08-09' }),
        item({ name: '冷冻', category: 'frozen', expiry_date: '2026-08-09' }),
      ],
      TODAY,
    )

    expect(groups.urgent.map((e) => e.item.name)).toEqual(['冷冻'])
    expect(groups.soon).toEqual([])
    expect(groups.expired).toEqual([])
  })
})

describe('groupPending 排序', () => {
  it('每组内按 daysLeft 升序', () => {
    const groups = groupPending(
      [
        item({ name: '剩20', expiry_date: '2026-08-19' }),
        item({ name: '剩5', expiry_date: '2026-08-04' }),
        item({ name: '剩12', expiry_date: '2026-08-11' }),
      ],
      TODAY,
    )

    expect(groups.urgent.map((e) => e.item.name)).toEqual([
      '剩5',
      '剩12',
      '剩20',
    ])
    expect(groups.urgent.map((e) => e.result.daysLeft)).toEqual([5, 12, 20])
  })

  it('已过期组内也是升序：过期越久排越前（daysLeft 越小）', () => {
    const groups = groupPending(
      [
        item({ name: '过期1天', expiry_date: '2026-07-29' }),
        item({ name: '过期30天', expiry_date: '2026-06-30' }),
        item({ name: '过期10天', expiry_date: '2026-07-20' }),
      ],
      TODAY,
    )

    expect(groups.expired.map((e) => e.item.name)).toEqual([
      '过期30天',
      '过期10天',
      '过期1天',
    ])
    expect(groups.expired.map((e) => e.result.daysLeft)).toEqual([-30, -10, -1])
  })

  it('daysLeft 相同时按名称排，保证渲染顺序稳定', () => {
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

describe('groupPending 异常隔离（SPEC §4 P1 第 1 条防线）', () => {
  it('单条日期非法不影响其余条目', () => {
    const groups = groupPending(
      [
        item({ name: '正常1', expiry_date: '2026-08-05' }),
        item({ name: '坏数据', expiry_date: '2027-02-29' }), // 平年没有这天
        item({ name: '正常2', expiry_date: '2026-08-06' }),
      ],
      TODAY,
    )

    expect(groups.urgent.map((e) => e.item.name)).toEqual(['正常1', '正常2'])
    expect(groups.invalid.map((e) => e.item.name)).toEqual(['坏数据'])
    expect(groups.invalid[0].message).toBeTruthy()
  })

  it('groupPending 本身永不抛错，哪怕全是坏数据', () => {
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

  it('各种非法形态都落进 invalid 而不是被丢掉', () => {
    const groups = groupPending(
      [
        item({ name: 'a', expiry_date: '2026-13-01' }), // 月份越界
        item({ name: 'b', expiry_date: '2026/07/30' }), // 分隔符错
        item({ name: 'c', purchase_date: '2026-7-1', shelf_life_days: 10 }), // 未补零
        item({ name: 'd', opened_date: '2027-02-29', pao_months: 6 }), // 平年闰日
      ],
      TODAY,
    )

    expect(groups.invalid.map((e) => e.item.name)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('非法条目不参与三组排序，三组保持干净', () => {
    const groups = groupPending(
      [item({ name: '坏', expiry_date: 'not-a-date' })],
      TODAY,
    )

    expect(groups.expired).toEqual([])
    expect(groups.urgent).toEqual([])
    expect(groups.soon).toEqual([])
    expect(groups.invalid).toHaveLength(1)
  })

  it('已消耗的坏数据也不显示', () => {
    const groups = groupPending(
      [
        item({
          name: '坏且已消耗',
          expiry_date: '2027-02-29',
          consumed_at: '2026-07-01T00:00:00Z',
        }),
      ],
      TODAY,
    )

    expect(groups.invalid).toEqual([])
  })
})

describe('isPendingEmpty（空状态是成功状态）', () => {
  it('全空 → true', () => {
    expect(isPendingEmpty(groupPending([], TODAY))).toBe(true)
  })

  it('只有 ok / untracked 条目 → 主视图仍是空的', () => {
    const groups = groupPending(
      [item({ expiry_date: '2027-07-30' }), item({ name: '花椒' })],
      TODAY,
    )
    expect(isPendingEmpty(groups)).toBe(true)
  })

  it('有非法条目 → 不算空（要显示占位让人去修）', () => {
    const groups = groupPending([item({ expiry_date: 'bad' })], TODAY)
    expect(isPendingEmpty(groups)).toBe(false)
  })
})

describe('appearsInPending（决定保存后是否需要 toast 回执）', () => {
  it('urgent 条目 → 会出现在列表，走乐观更新', () => {
    expect(appearsInPending(item({ expiry_date: '2026-08-05' }), TODAY)).toBe(
      true,
    )
  })

  it('expired 条目 → 会出现', () => {
    expect(appearsInPending(item({ expiry_date: '2026-07-01' }), TODAY)).toBe(
      true,
    )
  })

  it('soon 条目 → 会出现', () => {
    expect(appearsInPending(item({ expiry_date: '2026-09-10' }), TODAY)).toBe(
      true,
    )
  })

  it('ok 条目 → 不会出现，需要 toast', () => {
    expect(appearsInPending(item({ expiry_date: '2027-07-30' }), TODAY)).toBe(
      false,
    )
  })

  it('untracked（L3 花椒）→ 不会出现，需要 toast', () => {
    expect(appearsInPending(item({ tier: 'L3' }), TODAY)).toBe(false)
  })

  it('非法日期 → 会以占位形式出现，不需要 toast', () => {
    expect(appearsInPending(item({ expiry_date: '2027-02-29' }), TODAY)).toBe(
      true,
    )
  })

  it('已消耗 → 不会出现', () => {
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
  it('负数显示已过期天数', () => {
    expect(daysLeftLabel(-1)).toBe('已过期 1 天')
    expect(daysLeftLabel(-30)).toBe('已过期 30 天')
  })

  it('0 显示今天到期', () => {
    expect(daysLeftLabel(0)).toBe('今天到期')
  })

  it('正数显示剩余天数', () => {
    expect(daysLeftLabel(5)).toBe('剩 5 天')
  })
})
