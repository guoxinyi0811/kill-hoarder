// @vitest-environment jsdom

/**
 * SPEC §4 P1 acceptance: the form rejects malformed or nonexistent dates.
 * SPEC §6: form fields are progressively disclosed by tier.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ItemForm } from './ItemForm'
import { emptyFormValues, type ItemFormValues } from '../lib/validation'

afterEach(cleanup)

const FORM_COPY = {
  create: '新增',
  save: '保存',
  realDate: '真实存在的日期',
  expiryDate: '到期日',
  nameRequired: '请填名称',
  name: '名称',
  category: '类别',
  location: '位置',
  purchaseDate: '购入日',
  openedDate: '开封日',
  shelfLifeDays: '保质天数',
  paoMonths: '开封后可用月数',
  cancel: '取消',
} as const

function renderForm(initialValues?: Partial<ItemFormValues>) {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  render(
    <ItemForm
      title={FORM_COPY.create}
      initialValues={{ ...emptyFormValues(), ...initialValues }}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  )
  return { onSubmit, onCancel }
}

const save = () => screen.getByRole('button', { name: FORM_COPY.save })

describe('invalid date submission prevention', () => {
  it('rejects nonexistent date 2027-02-29 and displays an error', async () => {
    const { onSubmit } = renderForm({
      name: 'Milk',
      tier: 'L1',
      expiry_date: '2027-02-29',
    })

    await userEvent.click(save())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain(FORM_COPY.realDate)
  })

  it('rejects nonexistent date 2026-02-30', async () => {
    const { onSubmit } = renderForm({
      name: 'Milk',
      tier: 'L1',
      expiry_date: '2026-02-30',
    })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects out-of-range month 2026-13-01', async () => {
    const { onSubmit } = renderForm({
      name: 'Milk',
      tier: 'L1',
      expiry_date: '2026-13-01',
    })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects malformed date 2026/07/30', async () => {
    const { onSubmit } = renderForm({
      name: 'Milk',
      tier: 'L1',
      expiry_date: '2026/07/30',
    })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects non-zero-padded date 2026-7-30', async () => {
    const { onSubmit } = renderForm({
      name: 'Milk',
      tier: 'L2',
      purchase_date: '2026-7-30',
    })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects an invalid opened date', async () => {
    const { onSubmit } = renderForm({
      name: 'Face cream',
      tier: 'L1',
      opened_date: '2027-02-29',
    })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps an invalid value visible in a text input so it can be repaired', () => {
    renderForm({ name: 'Milk', tier: 'L1', expiry_date: '2027-02-29' })

    const input = screen.getByLabelText(FORM_COPY.expiryDate) as HTMLInputElement
    // Invalid values fall back to text because type="date" silently clears them.
    expect(input.type).toBe('text')
    expect(input.value).toBe('2027-02-29')
  })

  it('still rejects the form after replacing one invalid value with another', async () => {
    const { onSubmit } = renderForm({
      name: 'Milk',
      tier: 'L1',
      expiry_date: '2027-02-29',
    })

    // Replace the text value as if pasted, without passing through a valid blank state.
    fireEvent.change(screen.getByLabelText(FORM_COPY.expiryDate), {
      target: { value: '2026-02-30' },
    })

    await userEvent.click(save())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain(FORM_COPY.realDate)
  })

  it('submits after an invalid value is replaced with a valid one', async () => {
    const { onSubmit } = renderForm({
      name: 'Milk',
      tier: 'L1',
      expiry_date: '2027-02-29',
    })

    const input = screen.getByLabelText(FORM_COPY.expiryDate) as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '2028-02-29') // A real leap-year date.

    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].expiry_date).toBe('2028-02-29')
  })
})

describe('other validation', () => {
  it('rejects an empty name', async () => {
    const { onSubmit } = renderForm({ name: '' })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain(FORM_COPY.nameRequired)
  })

  it('rejects a negative shelf life', async () => {
    const { onSubmit } = renderForm({
      name: 'Rice',
      tier: 'L2',
      shelf_life_days: '-5',
    })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits valid input and converts blank date fields to null', async () => {
    const { onSubmit } = renderForm({ name: 'Sichuan peppercorns', tier: 'L3' })
    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const draft = onSubmit.mock.calls[0][0]
    expect(draft.name).toBe('Sichuan peppercorns')
    expect(draft.purchase_date).toBeNull()
    expect(draft.expiry_date).toBeNull()
    expect(draft.opened_date).toBeNull()
  })
})

describe('tier-based field disclosure (SPEC §6)', () => {
  it('shows name, category, and location but no date fields for L3', () => {
    renderForm({ name: 'Sichuan peppercorns', tier: 'L3' })

    expect(screen.getByText(FORM_COPY.name)).toBeTruthy()
    expect(screen.getByText(FORM_COPY.category)).toBeTruthy()
    expect(screen.getByText(FORM_COPY.location)).toBeTruthy()
    expect(screen.queryByText(FORM_COPY.purchaseDate)).toBeNull()
    expect(screen.queryByText(FORM_COPY.expiryDate)).toBeNull()
    expect(screen.queryByText(FORM_COPY.openedDate)).toBeNull()
  })

  it('adds purchase date and shelf life but not expiry or opened dates for L2', () => {
    renderForm({ name: 'Rice', tier: 'L2' })

    expect(screen.getByText(FORM_COPY.purchaseDate)).toBeTruthy()
    expect(screen.getByText(FORM_COPY.shelfLifeDays)).toBeTruthy()
    expect(screen.queryByText(FORM_COPY.expiryDate)).toBeNull()
    expect(screen.queryByText(FORM_COPY.openedDate)).toBeNull()
  })

  it('shows expiry and opened dates for L1', () => {
    renderForm({ name: 'Face cream', tier: 'L1' })

    expect(screen.getByText(FORM_COPY.purchaseDate)).toBeTruthy()
    expect(screen.getByText(FORM_COPY.expiryDate)).toBeTruthy()
    expect(screen.getByText(FORM_COPY.openedDate)).toBeTruthy()
    expect(screen.getByText(FORM_COPY.paoMonths)).toBeTruthy()
  })

  it('updates visible fields immediately when the tier changes', async () => {
    renderForm({ name: 'Item', tier: 'L3' })
    expect(screen.queryByText(FORM_COPY.purchaseDate)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /L2/ }))
    expect(screen.getByText(FORM_COPY.purchaseDate)).toBeTruthy()
    expect(screen.queryByText(FORM_COPY.expiryDate)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /L1/ }))
    expect(screen.getByText(FORM_COPY.expiryDate)).toBeTruthy()
  })
})

describe('cancel', () => {
  it('calls onCancel without submitting', async () => {
    const { onCancel, onSubmit } = renderForm({ name: 'Milk' })
    await userEvent.click(screen.getByRole('button', { name: FORM_COPY.cancel }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
