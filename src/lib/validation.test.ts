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
  return { ...emptyFormValues(), name: 'Milk', ...over }
}

describe('isValidDateStr', () => {
  it.each(['2026-07-30', '2028-02-29', '2000-02-29', '1999-12-31'])(
    '%s is valid',
    (v) => {
      expect(isValidDateStr(v)).toBe(true)
    },
  )

  it.each([
    '2027-02-29', // A non-leap year has no February 29.
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-07-32',
    '2026-7-30', // Month is not zero-padded.
    '26-07-30',
    '2026/07/30',
    '2026-07-30T00:00:00Z',
    '',
    'not-a-date',
  ])('%j is invalid', (v) => {
    expect(isValidDateStr(v)).toBe(false)
  })

  it('accepts every date that computeExpiry accepts', () => {
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

  it('rejects every date that makes computeExpiry throw', () => {
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

describe('validateItemForm — name', () => {
  it('rejects an empty name', () => {
    expect(validateItemForm(values({ name: '' })).name).toBeTruthy()
  })

  it('rejects a whitespace-only name', () => {
    expect(validateItemForm(values({ name: '   ' })).name).toBeTruthy()
  })

  it('accepts a normal name', () => {
    expect(validateItemForm(values()).name).toBeUndefined()
  })
})

describe('validateItemForm — date fields (SPEC §4 P1 second defense)', () => {
  it('allows all three date fields to be blank because tier controls entry', () => {
    expect(hasErrors(validateItemForm(values()))).toBe(false)
  })

  it.each(['purchase_date', 'expiry_date', 'opened_date'] as const)(
    '%s rejects 2027-02-29 in a non-leap year',
    (field) => {
      const errors = validateItemForm(values({ [field]: '2027-02-29' }))
      expect(errors[field]).toBeTruthy()
      expect(hasErrors(errors)).toBe(true)
    },
  )

  it.each(['purchase_date', 'expiry_date', 'opened_date'] as const)(
    '%s rejects invalid formats',
    (field) => {
      expect(hasErrors(validateItemForm(values({ [field]: '2026/07/30' })))).toBe(
        true,
      )
      expect(hasErrors(validateItemForm(values({ [field]: '2026-7-30' })))).toBe(
        true,
      )
      expect(hasErrors(validateItemForm(values({ [field]: 'garbage' })))).toBe(true)
    },
  )

  it.each(['purchase_date', 'expiry_date', 'opened_date'] as const)(
    '%s accepts the real leap date 2028-02-29',
    (field) => {
      expect(hasErrors(validateItemForm(values({ [field]: '2028-02-29' })))).toBe(
        false,
      )
    },
  )

  it('reports each invalid field when multiple dates are invalid', () => {
    const errors = validateItemForm(
      values({ purchase_date: '2026-13-01', expiry_date: '2027-02-29' }),
    )
    expect(errors.purchase_date).toBeTruthy()
    expect(errors.expiry_date).toBeTruthy()
  })
})

describe('validateItemForm — numeric fields', () => {
  it('allows blank values', () => {
    expect(hasErrors(validateItemForm(values()))).toBe(false)
  })

  it('accepts zero because a zero-day shelf life is valid', () => {
    expect(
      hasErrors(validateItemForm(values({ shelf_life_days: '0' }))),
    ).toBe(false)
  })

  it('rejects negative values', () => {
    expect(validateItemForm(values({ shelf_life_days: '-1' })).shelf_life_days)
      .toBeTruthy()
  })

  it('rejects decimals', () => {
    expect(validateItemForm(values({ pao_months: '1.5' })).pao_months)
      .toBeTruthy()
  })

  it('rejects non-numeric values', () => {
    expect(validateItemForm(values({ pao_months: 'abc' })).pao_months)
      .toBeTruthy()
  })
})

describe('validateItemForm — enum fields', () => {
  it('accepts valid enum values', () => {
    expect(
      hasErrors(
        validateItemForm(
          values({ category: 'skincare', location: 'vanity', tier: 'L1' }),
        ),
      ),
    ).toBe(false)
  })

  it('rejects an unknown category', () => {
    expect(validateItemForm(values({ category: 'drinks' })).category)
      .toBeTruthy()
  })

  it('rejects an unknown location', () => {
    expect(validateItemForm(values({ location: 'garage' })).location)
      .toBeTruthy()
  })

  it('rejects an unknown tier', () => {
    expect(validateItemForm(values({ tier: 'L4' })).tier).toBeTruthy()
  })
})

describe('toItemDraft', () => {
  it('converts empty strings to null', () => {
    const draft = toItemDraft(values())
    expect(draft.purchase_date).toBeNull()
    expect(draft.expiry_date).toBeNull()
    expect(draft.opened_date).toBeNull()
    expect(draft.shelf_life_days).toBeNull()
    expect(draft.pao_months).toBeNull()
    expect(draft.note).toBeNull()
  })

  it('converts numeric fields to numbers', () => {
    const draft = toItemDraft(
      values({ shelf_life_days: '30', pao_months: '6' }),
    )
    expect(draft.shelf_life_days).toBe(30)
    expect(draft.pao_months).toBe(6)
  })

  it('converts zero to numeric zero rather than null', () => {
    expect(toItemDraft(values({ shelf_life_days: '0' })).shelf_life_days).toBe(0)
  })

  it('trims surrounding whitespace from the name', () => {
    expect(toItemDraft(values({ name: '  Milk  ' })).name).toBe('Milk')
  })
})

describe('visibleDateFields (tier only controls form display, SPEC §6 / core rule 2)', () => {
  it('shows no date fields for L3', () => {
    expect(visibleDateFields('L3')).toEqual({
      purchase: false,
      shelfLife: false,
      expiry: false,
      opened: false,
      pao: false,
    })
  })

  it('adds purchase date and shelf life for L2', () => {
    const fields = visibleDateFields('L2')
    expect(fields.purchase).toBe(true)
    expect(fields.shelfLife).toBe(true)
    expect(fields.expiry).toBe(false)
    expect(fields.opened).toBe(false)
  })

  it('shows all date fields for L1', () => {
    expect(visibleDateFields('L1')).toEqual({
      purchase: true,
      shelfLife: true,
      expiry: true,
      opened: true,
      pao: true,
    })
  })
})

describe('toFormValues (populate the edit form)', () => {
  it('converts null to empty strings and numbers to strings', () => {
    expect(
      toFormValues({
        name: 'Face cream',
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
      name: 'Face cream',
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

  it('round-trips stored values through validation without errors', () => {
    const restored = toFormValues({
      name: 'Milk',
      category: 'fresh',
      location: 'fridge',
      tier: 'L2',
      purchase_date: '2026-07-25',
      expiry_date: null,
      shelf_life_days: 10,
      opened_date: null,
      pao_months: null,
      note: 'Finish within three days after opening',
    })
    expect(hasErrors(validateItemForm(restored))).toBe(false)
  })
})
