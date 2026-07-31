import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CATEGORIES, WARN_DAYS, type Category } from './enums'
import { computeExpiry, type DateStr, type ExpiryInput } from './expiry'

/**
 * 测试用例编号对应 SPEC.md §3.2「必须覆盖的测试用例（P0）」的九条。
 * 每个 describe 块的标题标注了它覆盖的是哪一条。
 */

/** 造 ExpiryInput：默认全空、category 为 other（warn = 30），只覆盖关心的字段。 */
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
 * 测试侧的独立日期加法，基于 Date.UTC。
 * 被测实现用的是纯整数历法运算（不碰 Date），两套算法不同 → 互为交叉验证，
 * 而不是把被测逻辑在测试里抄一遍。
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
// §3.2 ① 三个来源各自单独存在
// ---------------------------------------------------------------------------

describe('§3.2 ① 三个来源各自单独存在', () => {
  it('只有 expiry_date → source 为 explicit', () => {
    const r = computeExpiry(input({ expiry_date: '2026-08-10' }), TODAY)
    expect(r).toEqual({
      effectiveExpiry: '2026-08-10',
      daysLeft: 11,
      status: 'urgent', // other 的 warn = 30，11 <= 30
      source: 'explicit',
    })
  })

  it('只有 opened_date + pao_months → source 为 pao', () => {
    const r = computeExpiry(
      input({ category: 'skincare', opened_date: '2026-07-01', pao_months: 3 }),
      TODAY,
    )
    expect(r).toEqual({
      effectiveExpiry: '2026-10-01',
      daysLeft: 63,
      status: 'soon', // skincare 的 warn = 60，60 < 63 <= 120
      source: 'pao',
    })
  })

  it('只有 purchase_date + shelf_life_days → source 为 shelf_life', () => {
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
      status: 'urgent', // fresh 的 warn = 3
      source: 'shelf_life',
    })
  })
})

// ---------------------------------------------------------------------------
// §3.2 ② 多来源冲突时取最早
// ---------------------------------------------------------------------------

describe('§3.2 ② 多来源冲突时取最早', () => {
  it('护肤品有 2027 的 expiry_date，但开封后 PAO 6 个月 → 取 PAO', () => {
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

  it('三个来源同时存在 → 取最早的 shelf_life', () => {
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

  it('三个来源同时存在 → 取最早的 explicit', () => {
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

  it('explicit 晚于 shelf_life → 取 shelf_life', () => {
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

  it('并列同一天时按 explicit > pao > shelf_life 定 source（explicit 与 pao 并列）', () => {
    const r = computeExpiry(
      input({
        expiry_date: '2026-11-01',
        opened_date: '2026-05-01',
        pao_months: 6, // → 2026-11-01，与 explicit 同日
      }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-11-01')
    expect(r.source).toBe('explicit')
  })

  it('并列同一天时按 explicit > pao > shelf_life 定 source（pao 与 shelf_life 并列）', () => {
    const r = computeExpiry(
      input({
        opened_date: '2026-05-01',
        pao_months: 6, // → 2026-11-01
        purchase_date: '2026-10-31',
        shelf_life_days: 1, // → 2026-11-01，同日
      }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-11-01')
    expect(r.source).toBe('pao')
  })
})

// ---------------------------------------------------------------------------
// §3.2 ③ 全空 → untracked
// ---------------------------------------------------------------------------

describe('§3.2 ③ 全空 → untracked', () => {
  it('五个日期字段全 null → untracked，其余字段全 null', () => {
    expect(computeExpiry(input(), TODAY)).toEqual({
      effectiveExpiry: null,
      daysLeft: null,
      status: 'untracked',
      source: null,
    })
  })

  it('untracked 与 category 无关（L3 干货就是这种）', () => {
    for (const category of CATEGORIES) {
      expect(computeExpiry(input({ category }), TODAY).status).toBe('untracked')
    }
  })
})

// ---------------------------------------------------------------------------
// §3.2 ④ 半空组合：来源不完整则该来源不参与
// ---------------------------------------------------------------------------

describe('§3.2 ④ 半空组合 → 该来源不参与', () => {
  it('只有 opened_date 没有 pao_months → untracked', () => {
    expect(computeExpiry(input({ opened_date: '2026-07-01' }), TODAY)).toEqual({
      effectiveExpiry: null,
      daysLeft: null,
      status: 'untracked',
      source: null,
    })
  })

  it('只有 pao_months 没有 opened_date → untracked', () => {
    expect(computeExpiry(input({ pao_months: 6 }), TODAY).status).toBe(
      'untracked',
    )
  })

  it('只有 purchase_date 没有 shelf_life_days → untracked', () => {
    expect(computeExpiry(input({ purchase_date: '2026-07-01' }), TODAY)).toEqual(
      {
        effectiveExpiry: null,
        daysLeft: null,
        status: 'untracked',
        source: null,
      },
    )
  })

  it('只有 shelf_life_days 没有 purchase_date → untracked', () => {
    expect(computeExpiry(input({ shelf_life_days: 30 }), TODAY).status).toBe(
      'untracked',
    )
  })

  it('pao 半空但 shelf_life 完整 → 只用 shelf_life，不因半空而报错或参与', () => {
    const r = computeExpiry(
      input({
        opened_date: '2026-01-01', // 无 pao_months，若误参与会得出更早的日期
        purchase_date: '2026-07-20',
        shelf_life_days: 30, // → 2026-08-19
      }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-08-19')
    expect(r.source).toBe('shelf_life')
  })

  it('shelf_life_days 为 0 是有效值，不能当成空（0 天保质期 = 购入日当天到期）', () => {
    const r = computeExpiry(
      input({ purchase_date: '2026-07-30', shelf_life_days: 0 }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2026-07-30')
    expect(r.source).toBe('shelf_life')
    expect(r.daysLeft).toBe(0)
  })

  it('pao_months 为 0 是有效值，不能当成空', () => {
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
// §3.2 ⑤ 边界：daysLeft 与 status 的分档
// ---------------------------------------------------------------------------

describe('§3.2 ⑤ 状态边界（category = other，warn = 30）', () => {
  const warn = WARN_DAYS.other

  it('WARN_DAYS.other 确实是 30（下面的固定日期依赖这个前提）', () => {
    expect(warn).toBe(30)
  })

  it('daysLeft === 0 → urgent（不是 expired）', () => {
    const r = computeExpiry(input({ expiry_date: '2026-07-30' }), TODAY)
    expect(r.daysLeft).toBe(0)
    expect(r.status).toBe('urgent')
  })

  it('daysLeft === -1 → expired', () => {
    const r = computeExpiry(input({ expiry_date: '2026-07-29' }), TODAY)
    expect(r.daysLeft).toBe(-1)
    expect(r.status).toBe('expired')
  })

  it('daysLeft 为较大负数 → expired', () => {
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
// §3.2 ⑥ 跨月 / 跨年加月份，溢出取当月最后一天
// ---------------------------------------------------------------------------

describe('§3.2 ⑥ 加月份：跨月、跨年、溢出取当月最后一天', () => {
  /** 走 pao 分支验证「opened_date + pao_months 个月」。 */
  function paoExpiry(opened: DateStr, months: number): DateStr | null {
    return computeExpiry(
      input({ opened_date: opened, pao_months: months }),
      TODAY,
    ).effectiveExpiry
  }

  it('2026-01-31 + 1 month → 2026-02-28（溢出取当月最后一天，SPEC 明确约定）', () => {
    expect(paoExpiry('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('2026-01-31 + 3 months → 2026-04-30（4 月只有 30 天）', () => {
    expect(paoExpiry('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('2026-03-31 + 1 month → 2026-04-30', () => {
    expect(paoExpiry('2026-03-31', 1)).toBe('2026-04-30')
  })

  it('2026-01-15 + 1 month → 2026-02-15（不溢出则不改日）', () => {
    expect(paoExpiry('2026-01-15', 1)).toBe('2026-02-15')
  })

  it('2026-12-15 + 2 months → 2027-02-15（跨年）', () => {
    expect(paoExpiry('2026-12-15', 2)).toBe('2027-02-15')
  })

  it('2026-08-31 + 6 months → 2027-02-28（跨年 + 溢出）', () => {
    expect(paoExpiry('2026-08-31', 6)).toBe('2027-02-28')
  })

  it('2026-11-30 + 12 months → 2027-11-30（整年）', () => {
    expect(paoExpiry('2026-11-30', 12)).toBe('2027-11-30')
  })

  it('2026-05-31 + 18 months → 2027-11-30（跨年且落在 30 天的月份）', () => {
    expect(paoExpiry('2026-05-31', 18)).toBe('2027-11-30')
  })

  it('2026-12-31 + 1 month → 2027-01-31（跨年不溢出）', () => {
    expect(paoExpiry('2026-12-31', 1)).toBe('2027-01-31')
  })
})

// ---------------------------------------------------------------------------
// §3.2 ⑦ 闰年
// ---------------------------------------------------------------------------

describe('§3.2 ⑦ 闰年', () => {
  function paoExpiry(opened: DateStr, months: number): DateStr | null {
    return computeExpiry(
      input({ opened_date: opened, pao_months: months }),
      TODAY,
    ).effectiveExpiry
  }

  it('2027-08-29 + 6 months → 2028-02-29（闰年 2 月有 29 日，不该被砍到 28）', () => {
    expect(paoExpiry('2027-08-29', 6)).toBe('2028-02-29')
  })

  it('2028-01-31 + 1 month → 2028-02-29（闰年溢出取 29 而非 28）', () => {
    expect(paoExpiry('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('2028-02-29 + 12 months → 2029-02-28（平年溢出取 28）', () => {
    expect(paoExpiry('2028-02-29', 12)).toBe('2029-02-28')
  })

  it('2028-02-29 + 1 month → 2028-03-29', () => {
    expect(paoExpiry('2028-02-29', 1)).toBe('2028-03-29')
  })

  it('2100-01-31 + 1 month → 2100-02-28（能被 100 整除但不能被 400 整除，不是闰年）', () => {
    expect(paoExpiry('2100-01-31', 1)).toBe('2100-02-28')
  })

  it('2000-01-31 + 1 month → 2000-02-29（能被 400 整除，是闰年）', () => {
    expect(paoExpiry('2000-01-31', 1)).toBe('2000-02-29')
  })

  it('加天数跨闰日：2028-02-28 + 1 day → 2028-02-29', () => {
    const r = computeExpiry(
      input({ purchase_date: '2028-02-28', shelf_life_days: 1 }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2028-02-29')
  })

  it('加天数跨闰日：2028-02-28 + 2 days → 2028-03-01', () => {
    const r = computeExpiry(
      input({ purchase_date: '2028-02-28', shelf_life_days: 2 }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2028-03-01')
  })

  it('平年不跳过：2027-02-28 + 1 day → 2027-03-01', () => {
    const r = computeExpiry(
      input({ purchase_date: '2027-02-28', shelf_life_days: 1 }),
      TODAY,
    )
    expect(r.effectiveExpiry).toBe('2027-03-01')
  })

  it('daysLeft 计算跨闰日正确：2028-02-28 → 2028-03-01 为 2 天', () => {
    const r = computeExpiry(
      input({ expiry_date: '2028-03-01' }),
      '2028-02-28' as DateStr,
    )
    expect(r.daysLeft).toBe(2)
  })

  it('整个闰年 2028 共 366 天', () => {
    const r = computeExpiry(
      input({ expiry_date: '2029-01-01' }),
      '2028-01-01' as DateStr,
    )
    expect(r.daysLeft).toBe(366)
  })

  it('平年 2026 共 365 天', () => {
    const r = computeExpiry(
      input({ expiry_date: '2027-01-01' }),
      '2026-01-01' as DateStr,
    )
    expect(r.daysLeft).toBe(365)
  })
})

// ---------------------------------------------------------------------------
// §3.2 ⑧ 不同 category 走不同 warn 阈值
// ---------------------------------------------------------------------------

describe('§3.2 ⑧ 不同 category 走不同 warn 阈值', () => {
  it('WARN_DAYS 与 CLAUDE.md 逐字一致', () => {
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

  it.each(CATEGORIES)('%s：三个分档边界都落在自己的 warn 上', (category) => {
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

  it('同样剩 10 天：fresh 已经是 ok，frozen 却是 urgent', () => {
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

  it('同样剩 100 天：skincare 是 soon，其余全是 ok', () => {
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

  it('已过期与 category 无关，所有 category 都是 expired', () => {
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
// §3.2 ⑨ 时区：today 由调用方传入，函数内部不读系统时间
// ---------------------------------------------------------------------------

describe('§3.2 ⑨ today 由调用方传入，函数内部不读系统时间', () => {
  const item = input({ expiry_date: '2026-08-10' })

  it('系统时间被改到 2000 年，结果不变', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'))
    expect(computeExpiry(item, TODAY)).toEqual({
      effectiveExpiry: '2026-08-10',
      daysLeft: 11,
      status: 'urgent',
      source: 'explicit',
    })
  })

  it('系统时间被改到 2099 年，结果不变', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2099-12-31T23:59:59Z'))
    expect(computeExpiry(item, TODAY)).toEqual({
      effectiveExpiry: '2026-08-10',
      daysLeft: 11,
      status: 'urgent',
      source: 'explicit',
    })
  })

  it('同一 item 传不同 today → daysLeft 随之变化（today 是唯一的时间输入）', () => {
    expect(computeExpiry(item, '2026-08-09').daysLeft).toBe(1)
    expect(computeExpiry(item, '2026-08-10').daysLeft).toBe(0)
    expect(computeExpiry(item, '2026-08-11').daysLeft).toBe(-1)
  })

  it('日期是纯日历天数差，不受时刻/时区偏移影响（无 23 小时算 0 天的问题）', () => {
    // 若内部用本地时区的 Date 做减法，America/Toronto 的 DST 切换日会算出 0.958 天
    // 这类结果并向下取整成 0。这里跨 2027 年 3 月 14 日（多伦多 DST 起始）验证。
    const r = computeExpiry(
      input({ expiry_date: '2027-03-15' }),
      '2027-03-13' as DateStr,
    )
    expect(r.daysLeft).toBe(2)
  })

  /** 取出源码里所有 import / re-export 的模块名。 */
  function moduleSpecifiers(file: string): string[] {
    const src = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    return [...src.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
  }

  function sourceOf(file: string): string {
    return readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
  }

  it.each(['expiry.ts', 'enums.ts'])(
    '%s 只允许相对路径导入 → 零 React、零 Supabase、零第三方依赖',
    (file) => {
      for (const specifier of moduleSpecifiers(file)) {
        expect(specifier).toMatch(/^\.{1,2}\//)
      }
    },
  )

  it.each(['expiry.ts', 'enums.ts'])('%s 不读全局时间', (file) => {
    const src = sourceOf(file)

    expect(src).not.toMatch(/new\s+Date\s*\(/) // 不构造 Date
    expect(src).not.toMatch(/\bDate\s*\.\s*(now|UTC|parse)\s*\(/) // 不读时钟
    expect(src).not.toMatch(/performance\s*\.\s*now\s*\(/)
    expect(src).not.toMatch(/\bIntl\s*\./) // 不碰本地化（会引入时区）
    expect(src).not.toMatch(/toLocale[A-Za-z]*\s*\(/)
    expect(src).not.toMatch(/getTimezoneOffset/)
  })
})

// ---------------------------------------------------------------------------
// 额外：输入格式非法时不静默返回错误答案
// ---------------------------------------------------------------------------

describe('非法日期输入', () => {
  it.each([
    ['2026-7-30', '月份未补零'],
    ['26-07-30', '年份不是四位'],
    ['2026/07/30', '分隔符不是短横'],
    ['2026-13-01', '月份越界'],
    ['2026-02-30', '该月没有这一天'],
    ['2027-02-29', '平年没有 2 月 29 日'],
    ['', '空串'],
    ['not-a-date', '完全不是日期'],
  ])('expiry_date = %j（%s）→ 抛错而不是返回错误答案', (bad) => {
    expect(() => computeExpiry(input({ expiry_date: bad }), TODAY)).toThrow()
  })

  it('today 非法 → 抛错', () => {
    expect(() =>
      computeExpiry(input({ expiry_date: '2026-08-10' }), '2026-07-3'),
    ).toThrow()
  })

  it('2028-02-29 是合法日期，不该被误判', () => {
    expect(() =>
      computeExpiry(input({ expiry_date: '2028-02-29' }), TODAY),
    ).not.toThrow()
  })
})
