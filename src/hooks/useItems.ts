/**
 * TanStack Query wrappers for items.
 *
 * Create, edit, consume, and discard all use optimistic updates so the UI changes
 * before the network round trip (SPEC §4 P1). Failures restore the previous cache snapshot.
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

/** Turn a draft into a provisional item for the optimistic cache update. */
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

/** Optimistically remove a soft-deleted item from the active list. */
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
