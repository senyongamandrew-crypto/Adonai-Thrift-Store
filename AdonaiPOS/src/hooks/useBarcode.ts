import { useState, useCallback } from 'react'
import { Alert } from 'react-native'
import apiClient from '../services/api'
import { usePOSStore } from '../store/posStore'
import { InventoryItem } from '../types'

type Mode = 'idle' | 'scanning' | 'lookup' | 'error'

/**
 * Encapsulates the scan → lookup → add-to-cart flow.
 * - Offline: uses inventoryCache (sku→item map seeded from /api/pos/catalog)
 * - Online: hits fetchPosCatalog first for freshness
 * Always validates quantity > 0 / available before adding.
 */
export function useBarcode() {
  const [mode, setMode] = useState<Mode>('idle')
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const { inventoryCache, addItemToCart, isOnline } = usePOSStore()

  const lookup = useCallback(
    async (code: string): Promise<InventoryItem | null> => {
      const sku = String(code).trim()
      if (!sku) return null

      if (!isOnline) {
        return inventoryCache[sku] ?? inventoryCache[sku.toLowerCase()] ?? null
      }
      // try local cache first, then network freshness
      if (inventoryCache[sku]) return inventoryCache[sku]
      try {
        const item = (await apiClient.searchInventoryBySKU(sku)) as any
        if (item) return apiNormalize(item)
      } catch {
        return inventoryCache[sku] ?? null
      }
      return null
    },
    [inventoryCache, isOnline]
  )

  const handleScanned = useCallback(
    async (code: string) => {
      setMode('lookup')
      setLastScanned(code)
      try {
        const item = await lookup(code)
        if (!item) {
          Alert.alert('Not found', `No product matched "${code}". Try Quick Select.`)
          setMode('error')
          return null
        }
        const qty = (item as any).quantity ?? (item as any).stockQuantity ?? 1
        if (!item.available || qty <= 0) {
          Alert.alert('Out of stock', `"${item.name}" is not available.`)
          setMode('error')
          return null
        }
        addItemToCart(item, 1)
        setMode('idle')
        return item
      } catch {
        setMode('error')
        return null
      }
    },
    [addItemToCart, lookup]
  )

  return {
    mode,
    lastScanned,
    setMode,
    setLastScanned,
    lookup,
    handleScanned,
  }
}

function apiNormalize(raw: any): InventoryItem {
  return {
    id: String(raw.id ?? raw.sku),
    sku: String(raw.sku ?? raw.id),
    name: String(raw.name ?? 'Item'),
    description: raw.description ? String(raw.description) : undefined,
    category: String(raw.category ?? 'General'),
    price: Number(raw.unitPrice ?? raw.price ?? 0),
    cost: Number(raw.cost ?? raw.costPrice ?? 0),
    quantity: Number(raw.quantity ?? raw.stockQuantity ?? 0),
    image: raw.image ?? raw.gallery?.[0],
    gallery: raw.gallery,
    images: raw.images,
    available: raw.available !== false,
    lastUpdated: Date.now(),
  }
}
