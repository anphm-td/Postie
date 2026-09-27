import { useCallback, useMemo, useState } from 'react'
import type { Product } from '@shared/types'

export interface CartItem {
  product: Product
  qty: number
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([])

  const clampQty = (product: Product, qty: number): number => {
    const max = Math.max(0, product.stock)
    if (max <= 0) return 0
    return Math.min(max, Math.max(1, Math.floor(qty)))
  }

  const add = useCallback((product: Product) => {
    if (product.stock <= 0) return
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        const nextQty = clampQty(product, existing.qty + 1)
        return prev.map((i) => (i.product.id === product.id ? { ...i, qty: nextQty } : i))
      }
      return [...prev, { product, qty: 1 }]
    })
  }, [])

  const remove = useCallback((productId: number) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId))
  }, [])

  const setQty = useCallback((productId: number, qty: number) => {
    setItems((prev) =>
      prev
        .map((i) => (i.product.id === productId ? { ...i, qty: clampQty(i.product, qty) } : i))
        .filter((i) => i.qty > 0)
    )
  }, [])

  const inc = useCallback((productId: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, qty: clampQty(i.product, i.qty + 1) } : i
      )
    )
  }, [])

  const dec = useCallback((productId: number) => {
    setItems((prev) =>
      prev
        .map((i) => (i.product.id === productId ? { ...i, qty: i.qty - 1 } : i))
        .filter((i) => i.qty > 0)
    )
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const subtotalCents = useMemo(
    () => items.reduce((sum, i) => sum + i.product.price * i.qty, 0),
    [items]
  )

  return useMemo(
    () => ({ items, add, remove, setQty, inc, dec, clear, setItems, subtotalCents }),
    [items, add, remove, setQty, inc, dec, clear, setItems, subtotalCents]
  )
}
