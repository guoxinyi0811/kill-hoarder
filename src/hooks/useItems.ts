/**
 * items 的 TanStack Query 封装。
 *
 * 新增、编辑、标记消耗/丢弃全部走乐观更新——不等网络往返，UI 立刻变
 * （SPEC §4 P1 验收）。失败则回滚到操作前的缓存快照。
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchActiveItems,
  insertItem,
  markConsumed,
  markDiscarded,
  updateItem,
} from '../api/items'
import type { Item, ItemDraft } from '../lib/types'

export const ITEMS_KEY = ['items', 'active'] as const

interface Snapshot {
  previous: Item[] | undefined
}

/** 把 draft 拼成一条「看起来像真的」的条目，供乐观更新先塞进列表。 */
export function optimisticItem(draft: ItemDraft, id: string): Item {
  const now = new Date().toISOString()
  return {
    id,
    user_id: 'optimistic',
    name: draft.name,
    category: draft.category,
    location: draft.location,
    tier: draft.tier,
    purchase_date: draft.purchase_date,
    expiry_date: draft.expiry_date,
    shelf_life_days: draft.shelf_life_days,
    opened_date: draft.opened_date,
    pao_months: draft.pao_months,
    quantity_level: 'full',
    note: draft.note,
    consumed_at: null,
    discarded_at: null,
    created_at: now,
    updated_at: now,
  }
}

export function useActiveItems() {
  return useQuery({
    queryKey: ITEMS_KEY,
    queryFn: fetchActiveItems,
  })
}

export function useAddItem() {
  const queryClient = useQueryClient()

  return useMutation<Item, Error, ItemDraft, Snapshot>({
    mutationFn: insertItem,
    onMutate: async (draft) => {
      await queryClient.cancelQueries({ queryKey: ITEMS_KEY })
      const previous = queryClient.getQueryData<Item[]>(ITEMS_KEY)
      const pending = optimisticItem(draft, crypto.randomUUID())
      queryClient.setQueryData<Item[]>(ITEMS_KEY, (old) => [
        pending,
        ...(old ?? []),
      ])
      return { previous }
    },
    onError: (_error, _draft, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ITEMS_KEY, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ITEMS_KEY })
    },
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()

  return useMutation<Item, Error, { id: string; draft: ItemDraft }, Snapshot>({
    mutationFn: ({ id, draft }) => updateItem(id, draft),
    onMutate: async ({ id, draft }) => {
      await queryClient.cancelQueries({ queryKey: ITEMS_KEY })
      const previous = queryClient.getQueryData<Item[]>(ITEMS_KEY)
      queryClient.setQueryData<Item[]>(ITEMS_KEY, (old) =>
        (old ?? []).map((item) =>
          item.id === id ? { ...item, ...draft } : item,
        ),
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ITEMS_KEY, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ITEMS_KEY })
    },
  })
}

/** 软删除的乐观更新：立刻从活动列表里移除。 */
function useSoftDelete(mutationFn: (id: string) => Promise<Item>) {
  const queryClient = useQueryClient()

  return useMutation<Item, Error, string, Snapshot>({
    mutationFn,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ITEMS_KEY })
      const previous = queryClient.getQueryData<Item[]>(ITEMS_KEY)
      queryClient.setQueryData<Item[]>(ITEMS_KEY, (old) =>
        (old ?? []).filter((item) => item.id !== id),
      )
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ITEMS_KEY, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ITEMS_KEY })
    },
  })
}

export function useConsumeItem() {
  return useSoftDelete(markConsumed)
}

export function useDiscardItem() {
  return useSoftDelete(markDiscarded)
}
