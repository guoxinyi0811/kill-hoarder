/**
 * 底部 toast 回执。
 *
 * 主要用途（SPEC §4 P1）：新增了一个 ok / untracked 的条目时，主视图筛选规则
 * 决定了它不会出现在列表里，必须靠这条回执告诉用户「确实存下来了」。
 * 文案带位置——录入 L3 的动机就是怕忘了买过，回显位置能强化记忆。
 */

import { useEffect } from 'react'

interface Props {
  message: string | null
  onDismiss: () => void
  durationMs?: number
}

export function Toast({ message, onDismiss, durationMs = 4000 }: Props) {
  useEffect(() => {
    if (message === null) return
    const timer = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(timer)
  }, [message, durationMs, onDismiss])

  if (message === null) return null

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-5"
    >
      <p className="pointer-events-auto max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg">
        {message}
      </p>
    </div>
  )
}
