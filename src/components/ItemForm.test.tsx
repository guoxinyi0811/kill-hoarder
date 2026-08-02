// @vitest-environment jsdom

/**
 * SPEC §4 P1 验收：「表单无法提交格式非法或不存在的日期」
 * 以及 §6：录入表单按 tier 折叠字段。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ItemForm } from './ItemForm'
import { emptyFormValues, type ItemFormValues } from '../lib/validation'

afterEach(cleanup)

function renderForm(initialValues?: Partial<ItemFormValues>) {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  render(
    <ItemForm
      title="新增"
      initialValues={{ ...emptyFormValues(), ...initialValues }}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  )
  return { onSubmit, onCancel }
}

const save = () => screen.getByRole('button', { name: '保存' })

describe('阻止非法日期提交', () => {
  it('2027-02-29（平年不存在的日期）→ 不提交并报错', async () => {
    const { onSubmit } = renderForm({
      name: '牛奶',
      tier: 'L1',
      expiry_date: '2027-02-29',
    })

    await userEvent.click(save())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('真实存在的日期')
  })

  it('2026-02-30 → 不提交', async () => {
    const { onSubmit } = renderForm({
      name: '牛奶',
      tier: 'L1',
      expiry_date: '2026-02-30',
    })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('2026-13-01（月份越界）→ 不提交', async () => {
    const { onSubmit } = renderForm({
      name: '牛奶',
      tier: 'L1',
      expiry_date: '2026-13-01',
    })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('格式非法（2026/07/30）→ 不提交', async () => {
    const { onSubmit } = renderForm({
      name: '牛奶',
      tier: 'L1',
      expiry_date: '2026/07/30',
    })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('未补零（2026-7-30）→ 不提交', async () => {
    const { onSubmit } = renderForm({
      name: '牛奶',
      tier: 'L2',
      purchase_date: '2026-7-30',
    })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('开封日非法 → 不提交', async () => {
    const { onSubmit } = renderForm({
      name: '面霜',
      tier: 'L1',
      opened_date: '2027-02-29',
    })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('坏值会显示在文本框里让人看见（否则不知道该修什么）', () => {
    renderForm({ name: '牛奶', tier: 'L1', expiry_date: '2027-02-29' })

    const input = screen.getByLabelText('到期日') as HTMLInputElement
    // 非法值时降级成 text，否则 type="date" 会把它静默清洗成空串
    expect(input.type).toBe('text')
    expect(input.value).toBe('2027-02-29')
  })

  it('从一个非法值改成另一个非法值，仍然拦得住', async () => {
    const { onSubmit } = renderForm({
      name: '牛奶',
      tier: 'L1',
      expiry_date: '2027-02-29',
    })

    // 文本框态下整体替换（相当于粘贴），不经过「清空」这个合法中间态
    fireEvent.change(screen.getByLabelText('到期日'), {
      target: { value: '2026-02-30' },
    })

    await userEvent.click(save())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('真实存在的日期')
  })

  it('把非法值改成合法值后可以提交', async () => {
    const { onSubmit } = renderForm({
      name: '牛奶',
      tier: 'L1',
      expiry_date: '2027-02-29',
    })

    const input = screen.getByLabelText('到期日') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '2028-02-29') // 闰年，真实存在

    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].expiry_date).toBe('2028-02-29')
  })
})

describe('其他校验', () => {
  it('空名称不提交', async () => {
    const { onSubmit } = renderForm({ name: '' })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('请填名称')
  })

  it('保质天数是负数不提交', async () => {
    const { onSubmit } = renderForm({
      name: '米',
      tier: 'L2',
      shelf_life_days: '-5',
    })
    await userEvent.click(save())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('合法输入正常提交，日期字段转成 null 而不是空串', async () => {
    const { onSubmit } = renderForm({ name: '花椒', tier: 'L3' })
    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const draft = onSubmit.mock.calls[0][0]
    expect(draft.name).toBe('花椒')
    expect(draft.purchase_date).toBeNull()
    expect(draft.expiry_date).toBeNull()
    expect(draft.opened_date).toBeNull()
  })
})

describe('按 tier 折叠字段（SPEC §6）', () => {
  it('L3 只有名称/类别/位置，没有任何日期字段', () => {
    renderForm({ name: '花椒', tier: 'L3' })

    expect(screen.getByText('名称')).toBeTruthy()
    expect(screen.getByText('类别')).toBeTruthy()
    expect(screen.getByText('位置')).toBeTruthy()
    expect(screen.queryByText('购入日')).toBeNull()
    expect(screen.queryByText('到期日')).toBeNull()
    expect(screen.queryByText('开封日')).toBeNull()
  })

  it('L2 加购入日和保质天数，但没有到期日/开封日', () => {
    renderForm({ name: '米', tier: 'L2' })

    expect(screen.getByText('购入日')).toBeTruthy()
    expect(screen.getByText('保质天数')).toBeTruthy()
    expect(screen.queryByText('到期日')).toBeNull()
    expect(screen.queryByText('开封日')).toBeNull()
  })

  it('L1 显示到期日和开封日', () => {
    renderForm({ name: '面霜', tier: 'L1' })

    expect(screen.getByText('购入日')).toBeTruthy()
    expect(screen.getByText('到期日')).toBeTruthy()
    expect(screen.getByText('开封日')).toBeTruthy()
    expect(screen.getByText('开封后可用月数')).toBeTruthy()
  })

  it('切换 tier 会实时改变可见字段', async () => {
    renderForm({ name: '东西', tier: 'L3' })
    expect(screen.queryByText('购入日')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /L2/ }))
    expect(screen.getByText('购入日')).toBeTruthy()
    expect(screen.queryByText('到期日')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /L1/ }))
    expect(screen.getByText('到期日')).toBeTruthy()
  })
})

describe('取消', () => {
  it('点取消触发 onCancel，不提交', async () => {
    const { onCancel, onSubmit } = renderForm({ name: '牛奶' })
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
