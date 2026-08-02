import { describe, expect, it } from 'vitest'
import { computeExpiry, isValidDateStr } from './expiry'
import {
  emptyFormValues,
  hasErrors,
  toFormValues,
  toItemDraft,
  validateItemForm,
  visibleDateFields,
  type ItemFormValues,
} from './validation'

function values(over: Partial<ItemFormValues> = {}): ItemFormValues {
  return { ...emptyFormValues(), name: '牛奶', ...over }
}

describe('isValidDateStr', () => {
  it.each(['2026-07-30', '2028-02-29', '2000-02-29', '1999-12-31'])(
    '%s 合法',
    (v) => {
      expect(isValidDateStr(v)).toBe(true)
    },
  )

  it.each([
    '2027-02-29', // 平年没有闰日
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-07-32',
    '2026-7-30', // 未补零
    '26-07-30',
    '2026/07/30',
    '2026-07-30T00:00:00Z',
    '',
    'not-a-date',
  ])('%j 非法', (v) => {
    expect(isValidDateStr(v)).toBe(false)
  })

  it('与 computeExpiry 接受的集合一致：isValidDateStr 放行的，computeExpiry 就不抛', () => {
    for (const v of ['2026-07-30', '2028-02-29', '2100-03-01']) {
      expect(isValidDateStr(v)).toBe(true)
      expect(() =>
        computeExpiry(
          {
            category: 'other',
            purchase_date: null,
            expiry_date: v,
            shelf_life_days: null,
            opened_date: null,
            pao_months: null,
          },
          '2026-07-30',
        ),
      ).not.toThrow()
    }
  })

  it('与 computeExpiry 接受的集合一致：isValidDateStr 拒绝的，computeExpiry 一定抛', () => {
    for (const v of ['2027-02-29', '2026-13-01', '2026-7-30', 'bad']) {
      expect(isValidDateStr(v)).toBe(false)
      expect(() =>
        computeExpiry(
          {
            category: 'other',
            purchase_date: null,
            expiry_date: v,
            shelf_life_days: null,
            opened_date: null,
            pao_months: null,
          },
          '2026-07-30',
        ),
      ).toThrow()
    }
  })
})

describe('validateItemForm — 名称', () => {
  it('空名称报错', () => {
    expect(validateItemForm(values({ name: '' })).name).toBeTruthy()
  })

  it('只有空白的名称报错', () => {
    expect(validateItemForm(values({ name: '   ' })).name).toBeTruthy()
  })

  it('正常名称通过', () => {
    expect(validateItemForm(values()).name).toBeUndefined()
  })
})

describe('validateItemForm — 日期字段（SPEC §4 P1 第 2 条防线）', () => {
  it('三个日期字段留空都合法（tier 决定填不填）', () => {
    expect(hasErrors(validateItemForm(values()))).toBe(false)
  })

  it.each(['purchase_date', 'expiry_date', 'opened_date'] as const)(
    '%s = 2027-02-29（平年闰日）→ 拒绝提交',
    (field) => {
      const errors = validateItemForm(values({ [field]: '2027-02-29' }))
      expect(errors[field]).toBeTruthy()
      expect(hasErrors(errors)).toBe(true)
    },
  )

  it.each(['purchase_date', 'expiry_date', 'opened_date'] as const)(
    '%s 格式非法 → 拒绝提交',
    (field) => {
      expect(hasErrors(validateItemForm(values({ [field]: '2026/07/30' })))).toBe(
        true,
      )
      expect(hasErrors(validateItemForm(values({ [field]: '2026-7-30' })))).toBe(
        true,
      )
      expect(hasErrors(validateItemForm(values({ [field]: '乱写' })))).toBe(true)
    },
  )

  it.each(['purchase_date', 'expiry_date', 'opened_date'] as const)(
    '%s = 2028-02-29（闰年真实存在）→ 放行',
    (field) => {
      expect(hasErrors(validateItemForm(values({ [field]: '2028-02-29' })))).toBe(
        false,
      )
    },
  )

  it('多个日期同时非法时逐个报错', () => {
    const errors = validateItemForm(
      values({ purchase_date: '2026-13-01', expiry_date: '2027-02-29' }),
    )
    expect(errors.purchase_date).toBeTruthy()
    expect(errors.expiry_date).toBeTruthy()
  })
})

describe('validateItemForm — 数字字段', () => {
  it('留空合法', () => {
    expect(hasErrors(validateItemForm(values()))).toBe(false)
  })

  it('0 合法（0 天保质期是有效输入）', () => {
    expect(
      hasErrors(validateItemForm(values({ shelf_life_days: '0' }))),
    ).toBe(false)
  })

  it('负数拒绝', () => {
    expect(validateItemForm(values({ shelf_life_days: '-1' })).shelf_life_days)
      .toBeTruthy()
  })

  it('小数拒绝', () => {
    expect(validateItemForm(values({ pao_months: '1.5' })).pao_months)
      .toBeTruthy()
  })

  it('非数字拒绝', () => {
    expect(validateItemForm(values({ pao_months: 'abc' })).pao_months)
      .toBeTruthy()
  })
})

describe('validateItemForm — 枚举字段', () => {
  it('合法枚举通过', () => {
    expect(
      hasErrors(
        validateItemForm(
          values({ category: 'skincare', location: 'vanity', tier: 'L1' }),
        ),
      ),
    ).toBe(false)
  })

  it('伪造的 category 被拒', () => {
    expect(validateItemForm(values({ category: 'drinks' })).category)
      .toBeTruthy()
  })

  it('伪造的 location 被拒', () => {
    expect(validateItemForm(values({ location: 'garage' })).location)
      .toBeTruthy()
  })

  it('伪造的 tier 被拒', () => {
    expect(validateItemForm(values({ tier: 'L4' })).tier).toBeTruthy()
  })
})

describe('toItemDraft', () => {
  it('空字符串转成 null，不是空串', () => {
    const draft = toItemDraft(values())
    expect(draft.purchase_date).toBeNull()
    expect(draft.expiry_date).toBeNull()
    expect(draft.opened_date).toBeNull()
    expect(draft.shelf_life_days).toBeNull()
    expect(draft.pao_months).toBeNull()
    expect(draft.note).toBeNull()
  })

  it('数字字段转成 number', () => {
    const draft = toItemDraft(
      values({ shelf_life_days: '30', pao_months: '6' }),
    )
    expect(draft.shelf_life_days).toBe(30)
    expect(draft.pao_months).toBe(6)
  })

  it('0 转成数字 0 而不是 null', () => {
    expect(toItemDraft(values({ shelf_life_days: '0' })).shelf_life_days).toBe(0)
  })

  it('名称去掉首尾空白', () => {
    expect(toItemDraft(values({ name: '  牛奶  ' })).name).toBe('牛奶')
  })
})

describe('visibleDateFields（tier 只影响表单显示，SPEC §6 / CLAUDE.md 规则 2）', () => {
  it('L3 只有名称/类别/位置，不显示任何日期字段', () => {
    expect(visibleDateFields('L3')).toEqual({
      purchase: false,
      shelfLife: false,
      expiry: false,
      opened: false,
      pao: false,
    })
  })

  it('L2 加购入日和保质天数', () => {
    const fields = visibleDateFields('L2')
    expect(fields.purchase).toBe(true)
    expect(fields.shelfLife).toBe(true)
    expect(fields.expiry).toBe(false)
    expect(fields.opened).toBe(false)
  })

  it('L1 显示全部日期字段', () => {
    expect(visibleDateFields('L1')).toEqual({
      purchase: true,
      shelfLife: true,
      expiry: true,
      opened: true,
      pao: true,
    })
  })
})

describe('toFormValues（编辑页回填）', () => {
  it('null 回填成空字符串，数字转字符串', () => {
    expect(
      toFormValues({
        name: '面霜',
        category: 'skincare',
        location: 'vanity',
        tier: 'L1',
        purchase_date: null,
        expiry_date: '2027-12-31',
        shelf_life_days: null,
        opened_date: '2026-05-01',
        pao_months: 6,
        note: null,
      }),
    ).toEqual({
      name: '面霜',
      category: 'skincare',
      location: 'vanity',
      tier: 'L1',
      purchase_date: '',
      expiry_date: '2027-12-31',
      shelf_life_days: '',
      opened_date: '2026-05-01',
      pao_months: '6',
      note: '',
    })
  })

  it('回填后再校验不应报错（往返一致）', () => {
    const restored = toFormValues({
      name: '牛奶',
      category: 'fresh',
      location: 'fridge',
      tier: 'L2',
      purchase_date: '2026-07-25',
      expiry_date: null,
      shelf_life_days: 10,
      opened_date: null,
      pao_months: null,
      note: '开了要三天喝完',
    })
    expect(hasErrors(validateItemForm(restored))).toBe(false)
  })
})
