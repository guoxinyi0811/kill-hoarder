/**
 * 新增 / 编辑表单（SPEC §4 P1、§6）。
 *
 * 两件事：
 * 1. 按 tier 折叠字段：L3 只有名称/类别/位置；L2 加购入日；L1 再加到期日/开封日。
 *    tier 只影响显示，不参与任何计算（CLAUDE.md 核心规则 2）。
 * 2. 提交前校验日期——格式必须是 YYYY-MM-DD 且该日期真实存在。
 *    这是阻止非法值入库的那道防线（SPEC §4 P1）。
 *
 * 纯展示组件，不碰网络。
 */

import { useState, type FormEvent } from 'react'
import { CATEGORIES, LOCATIONS, TIERS } from '../lib/enums'
import { isValidDateStr } from '../lib/expiry'
import {
  emptyFormValues,
  hasErrors,
  toItemDraft,
  validateItemForm,
  visibleDateFields,
  type FieldErrors,
  type ItemFormValues,
} from '../lib/validation'
import {
  CATEGORY_LABEL,
  LOCATION_LABEL,
  TIER_LABEL,
  type ItemDraft,
} from '../lib/types'

interface Props {
  title: string
  initialValues?: ItemFormValues
  submitLabel?: string
  onSubmit: (draft: ItemDraft) => void
  onCancel: () => void
  onDiscard?: () => void
}

export function ItemForm({
  title,
  initialValues,
  submitLabel = '保存',
  onSubmit,
  onCancel,
  onDiscard,
}: Props) {
  const [values, setValues] = useState<ItemFormValues>(
    initialValues ?? emptyFormValues(),
  )
  const [errors, setErrors] = useState<FieldErrors>({})

  const fields = visibleDateFields(values.tier)

  function set<K extends keyof ItemFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validateItemForm(values)
    setErrors(found)
    if (hasErrors(found)) return // 校验不过就不提交，非法日期到不了数据库
    onSubmit(toItemDraft(values))
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="pb-28">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2 py-1 text-slate-500 active:bg-slate-100"
        >
          取消
        </button>
        <h1 className="flex-1 text-center font-semibold text-slate-900">
          {title}
        </h1>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-1.5 font-medium text-white active:bg-slate-700"
        >
          {submitLabel}
        </button>
      </header>

      <div className="space-y-5 px-5 py-5">
        <Field label="名称" error={errors.name}>
          <input
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="例如：希腊酸奶"
            autoComplete="off"
            className={inputClass(errors.name)}
          />
        </Field>

        <Field label="类别" error={errors.category}>
          <select
            value={values.category}
            onChange={(e) => set('category', e.target.value)}
            className={inputClass(errors.category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="位置" error={errors.location}>
          <select
            value={values.location}
            onChange={(e) => set('location', e.target.value)}
            className={inputClass(errors.location)}
          >
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {LOCATION_LABEL[l]}
              </option>
            ))}
          </select>
        </Field>

        <FieldGroup
          label="追踪层级"
          error={errors.tier}
          hint="L3 什么日期都不记，L2 只记购入日，L1 记具体到期日或开封日"
        >
          <div className="grid grid-cols-3 gap-2">
            {TIERS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('tier', t)}
                aria-pressed={values.tier === t}
                className={
                  'rounded-xl border px-2 py-3 text-sm font-medium ' +
                  (values.tier === t
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-600')
                }
              >
                {TIER_LABEL[t]}
              </button>
            ))}
          </div>
        </FieldGroup>

        {fields.purchase && (
          <Field label="购入日" error={errors.purchase_date}>
            <DateInput
              label="购入日"
              value={values.purchase_date}
              onChange={(v) => set('purchase_date', v)}
              error={errors.purchase_date}
            />
          </Field>
        )}

        {fields.shelfLife && (
          <Field label="保质天数" error={errors.shelf_life_days}>
            <input
              inputMode="numeric"
              value={values.shelf_life_days}
              onChange={(e) => set('shelf_life_days', e.target.value)}
              placeholder="例如：180"
              className={inputClass(errors.shelf_life_days)}
            />
          </Field>
        )}

        {fields.expiry && (
          <Field label="到期日" error={errors.expiry_date}>
            <DateInput
              label="到期日"
              value={values.expiry_date}
              onChange={(v) => set('expiry_date', v)}
              error={errors.expiry_date}
            />
          </Field>
        )}

        {fields.opened && (
          <Field label="开封日" error={errors.opened_date}>
            <DateInput
              label="开封日"
              value={values.opened_date}
              onChange={(v) => set('opened_date', v)}
              error={errors.opened_date}
            />
          </Field>
        )}

        {fields.pao && (
          <Field
            label="开封后可用月数"
            error={errors.pao_months}
            hint="护肤品罐体上的开盖图标数字"
          >
            <input
              inputMode="numeric"
              value={values.pao_months}
              onChange={(e) => set('pao_months', e.target.value)}
              placeholder="例如：6"
              className={inputClass(errors.pao_months)}
            />
          </Field>
        )}

        <Field label="备注" error={errors.note}>
          <input
            value={values.note}
            onChange={(e) => set('note', e.target.value)}
            autoComplete="off"
            className={inputClass(errors.note)}
          />
        </Field>

        {onDiscard && (
          <button
            type="button"
            onClick={onDiscard}
            className="w-full rounded-xl border border-red-200 py-3 font-medium text-red-600 active:bg-red-50"
          >
            标记已丢弃
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * 日期输入框。
 *
 * 正常情况下用 type="date"，移动端能唤起原生日期选择器。
 * 但当前值非法时降级成 type="text" —— 因为浏览器（和 jsdom）会把非法值从
 * type="date" 里静默清洗成空串，那样从「⚠️ 日期数据异常」占位点进编辑页时，
 * 用户根本看不到坏的是什么。降级成文本框才能把坏值显示出来让人改。
 */
function DateInput({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const invalid = value !== '' && !isValidDateStr(value)

  return (
    <input
      type={invalid ? 'text' : 'date'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      placeholder="YYYY-MM-DD"
      className={inputClass(error ?? (invalid ? 'invalid' : undefined))}
    />
  )
}

function inputClass(error?: string): string {
  return (
    'w-full rounded-xl border bg-white px-3 py-3 text-base text-slate-900 ' +
    (error ? 'border-red-400' : 'border-slate-200')
  )
}

interface FieldProps {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}

/** 包裹单个输入控件。用 <label> 把标题和控件关联起来。 */
function Field({ label, error, hint, children }: FieldProps) {
  return (
    <label className="block">
      <FieldBody label={label} error={error} hint={hint}>
        {children}
      </FieldBody>
    </label>
  )
}

/**
 * 包裹一组按钮（比如 tier 三选一）。
 *
 * 这里**不能**用 <label>：button 是可关联控件，被 <label> 包住时整段 label 文本
 * 会变成每个按钮的可访问名，三个按钮的名字就都一样了——读屏用户分不清，
 * 测试也选不中。用 role="group" 才对。
 */
function FieldGroup({ label, error, hint, children }: FieldProps) {
  return (
    <div role="group" aria-label={label}>
      <FieldBody label={label} error={error} hint={hint}>
        {children}
      </FieldBody>
    </div>
  )
}

function FieldBody({ label, error, hint, children }: FieldProps) {
  return (
    <>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      )}
      {error && (
        <span role="alert" className="mt-1 block text-sm text-red-600">
          {error}
        </span>
      )}
    </>
  )
}
