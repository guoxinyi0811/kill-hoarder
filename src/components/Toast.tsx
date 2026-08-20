/**
 * Bottom toast confirmation.
 *
 * Main use (SPEC §4 P1): a newly created ok / untracked item is filtered out of
 * the main view, so this confirmation tells the user that it was saved. Including
 * the location reinforces where an L3 item was stored.
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
