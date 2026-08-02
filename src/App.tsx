/**
 * 应用容器。
 *
 * 视图切换用 useState，不引入 router —— P2 会新增三个视图，路由结构那时候
 * 一次性设计，现在定的会是错的。
 */

import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configError, supabase } from './api/client'
import { ItemForm } from './components/ItemForm'
import { LoginScreen } from './components/LoginScreen'
import { PendingList } from './components/PendingList'
import { Toast } from './components/Toast'
import {
  optimisticItem,
  useActiveItems,
  useAddItem,
  useConsumeItem,
  useDiscardItem,
  useUpdateItem,
} from './hooks/useItems'
import { appearsInPending } from './lib/pending'
import { torontoToday } from './lib/today'
import { toFormValues } from './lib/validation'
import { LOCATION_LABEL, type Item, type ItemDraft } from './lib/types'

type View = { name: 'list' } | { name: 'new' } | { name: 'edit'; item: Item }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (configError) {
    return (
      <div className="mx-auto max-w-md px-6 py-20">
        <h1 className="text-lg font-semibold text-red-600">配置缺失</h1>
        <p className="mt-2 text-sm text-slate-600">{configError}</p>
      </div>
    )
  }

  if (!authReady) return <FullScreenHint text="加载中…" />
  if (!session) return <LoginScreen />

  return <SignedInApp />
}

function SignedInApp() {
  const [view, setView] = useState<View>({ name: 'list' })
  const [toast, setToast] = useState<string | null>(null)

  const today = torontoToday()
  const items = useActiveItems()
  const addItem = useAddItem()
  const updateItem = useUpdateItem()
  const consumeItem = useConsumeItem()
  const discardItem = useDiscardItem()

  const dismissToast = useCallback(() => setToast(null), [])

  function handleCreate(draft: ItemDraft) {
    addItem.mutate(draft)
    setView({ name: 'list' })

    // 落在筛选范围内的条目会靠乐观更新立刻出现在列表里，不需要额外回执。
    // 落在范围外的（ok / untracked）列表不会有任何变化，必须给一条 toast，
    // 否则用户会以为没保存成功（SPEC §4 P1 验收）。
    const preview = optimisticItem(draft, 'preview')
    if (!appearsInPending(preview, today)) {
      setToast(
        `已保存：${draft.name} · ${LOCATION_LABEL[draft.location]}（目前无需处理）`,
      )
    }
  }

  function handleUpdate(id: string, draft: ItemDraft) {
    updateItem.mutate({ id, draft })
    setView({ name: 'list' })
  }

  function handleConsume(item: Item) {
    consumeItem.mutate(item.id)
    setToast(`已用完：${item.name}`)
  }

  function handleDiscard(item: Item) {
    discardItem.mutate(item.id)
    setView({ name: 'list' })
    setToast(`已丢弃：${item.name}`)
  }

  if (view.name === 'new') {
    return (
      <ItemForm
        title="新增"
        onSubmit={handleCreate}
        onCancel={() => setView({ name: 'list' })}
      />
    )
  }

  if (view.name === 'edit') {
    const target = view.item
    return (
      <ItemForm
        title="编辑"
        initialValues={toFormValues(target)}
        onSubmit={(draft) => handleUpdate(target.id, draft)}
        onCancel={() => setView({ name: 'list' })}
        onDiscard={() => handleDiscard(target)}
      />
    )
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
        <h1 className="text-lg font-semibold text-slate-900">⚠️ 待处理</h1>
      </header>

      {items.isPending && <FullScreenHint text="加载中…" />}

      {items.isError && (
        <div className="px-5 py-16 text-center">
          <p className="text-sm text-red-600">读取失败：{items.error.message}</p>
          <button
            type="button"
            onClick={() => void items.refetch()}
            className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm"
          >
            重试
          </button>
        </div>
      )}

      {items.isSuccess && (
        <PendingList
          items={items.data}
          today={today}
          onSelect={(item) => setView({ name: 'edit', item })}
          onConsume={handleConsume}
        />
      )}

      <button
        type="button"
        onClick={() => setView({ name: 'new' })}
        className="fixed right-5 bottom-6 z-20 rounded-full bg-slate-900 px-6 py-4 font-medium text-white shadow-lg active:bg-slate-700"
      >
        + 新增
      </button>

      <Toast message={toast} onDismiss={dismissToast} />
    </>
  )
}

function FullScreenHint({ text }: { text: string }) {
  return <p className="px-5 py-20 text-center text-sm text-slate-400">{text}</p>
}
