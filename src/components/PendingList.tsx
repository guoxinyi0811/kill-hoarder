/**
 * The "⚠️ Pending" main view (SPEC §4 P1).
 *
 * Presentational only: data and callbacks are injected, with no network access.
 *
 * Error isolation: groupPending handles each item independently. Invalid items go
 * into the invalid group as clickable placeholders instead of crashing the list.
 */

import {
  GROUP_TITLE,
  STATUS_DOT,
  daysLeftLabel,
  groupPending,
  isPendingEmpty,
  type PendingEntry,
} from '../lib/pending'
import type { DateStr } from '../lib/expiry'
import { LOCATION_LABEL, type Item } from '../lib/types'

interface Props {
  items: Item[]
  today: DateStr
  onSelect: (item: Item) => void
  onConsume: (item: Item) => void
}

export function PendingList({ items, today, onSelect, onConsume }: Props) {
  const groups = groupPending(items, today)

  if (isPendingEmpty(groups)) {
    return (
      <div className="px-5 py-16 text-center">
        <p className="text-5xl">🌿</p>
        <p className="mt-4 text-lg font-medium text-slate-800">
          全都在保质期内
        </p>
        <p className="mt-1 text-sm text-slate-500">
          没有需要赶着吃掉或用掉的东西，安心。
        </p>
      </div>
    )
  }

  return (
    <div className="pb-28">
      {groups.invalid.length > 0 && (
        <section className="mt-2">
          <h2 className="px-5 py-2 text-sm font-semibold text-slate-500">
            需要修正
          </h2>
          <ul>
            {groups.invalid.map(({ item }) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-4 text-left active:bg-slate-100"
                >
                  <span aria-hidden="true" className="text-lg">
                    ⚠️
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">
                      {item.name}
                    </span>
                    <span className="block text-sm text-amber-700">
                      日期数据异常
                    </span>
                  </span>
                  <span className="text-sm text-slate-400">去修正</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(['expired', 'urgent', 'soon'] as const).map((status) =>
        groups[status].length === 0 ? null : (
          <section key={status} className="mt-2">
            <h2 className="px-5 py-2 text-sm font-semibold text-slate-500">
              {GROUP_TITLE[status]}
            </h2>
            <ul>
              {groups[status].map((entry) => (
                <ItemRow
                  key={entry.item.id}
                  entry={entry}
                  onSelect={onSelect}
                  onConsume={onConsume}
                />
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  )
}

function ItemRow({
  entry,
  onSelect,
  onConsume,
}: {
  entry: PendingEntry
  onSelect: (item: Item) => void
  onConsume: (item: Item) => void
}) {
  const { item, result } = entry

  return (
    <li className="flex items-center gap-2 border-b border-slate-100 pr-3">
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-5 text-left active:bg-slate-100"
      >
        <span aria-hidden="true" className="text-lg">
          {STATUS_DOT[result.status]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-900">
            {item.name}
          </span>
          <span className="block text-sm text-slate-500">
            {LOCATION_LABEL[item.location]} ·{' '}
            {result.daysLeft === null ? '—' : daysLeftLabel(result.daysLeft)}
            {result.source === 'pao' && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                开封计
              </span>
            )}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onConsume(item)}
        aria-label={`标记 ${item.name} 已用完`}
        className="shrink-0 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 active:bg-emerald-100"
      >
        已用完
      </button>
    </li>
  )
}
