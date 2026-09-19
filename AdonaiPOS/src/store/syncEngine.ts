/**
 * SyncEngine — embarassingly simple offline engine.
 * Every AUTO_SYNC_INTERVAL the app phones home:
 *  - flush pendingTransactions via POST /api/orders
 *  - fetch GET /api/pos/catalog and merge into posStore
 * Invariants: never blocks the POS; dedups writes via transaction id.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import apiClient from '../services/api'
import { usePOSStore } from './posStore'
import { Transaction } from '../types'

const AUTO_SYNC_INTERVAL = 30 * 1000
const LAST_SYNC_KEY = 'adonai:lastSyncTime'

class SyncEngine {
  private running = false
  private timer: ReturnType<typeof setInterval> | null = null
  private appState: AppStateStatus = AppState.currentState ?? 'active'

  start() {
    if (this.running) return
    this.running = true

    NetInfo.addEventListener((state) => {
      usePOSStore.getState().setOnlineStatus(Boolean(state.isConnected))
    })

    AppState.addEventListener('change', (next) => {
      const wasBg = this.appState.match(/inactive|background/)
      this.appState = next
      if (wasBg && next === 'active') this.syncOnce()
    })

    this.syncOnce()
    this.timer = setInterval(() => this.syncOnce(), AUTO_SYNC_INTERVAL)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.running = false
  }

  private async syncOnce() {
    const state = usePOSStore.getState()
    if (!state.isOnline) return
    usePOSStore.getState().setSyncStatus('syncing')
    try {
      // 1. Push queued transactions
      if (state.pendingTransactions.length > 0) {
        // tag with terminal if malformed
        const queued: Transaction[] = state.pendingTransactions
        try {
          const res: any = await apiClient.syncPendingTransactions(queued as any)
          const synced: string[] = res?.data?.syncedTransactionIds ?? queued.map((t) => t.id)
          synced.forEach((id) => usePOSStore.getState().removePendingTransaction(id))
        } catch (e: any) {
          if (e?.response?.status === 409) {
            usePOSStore.getState().setSyncStatus('error', 'Stock conflict — item no longer available. Refreshing catalogue.')
            await this.pullCatalogue()
            return
          }
          throw e
        }
      }

      // 2. Pull catalogue
      await this.pullCatalogue()

      await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()))
      usePOSStore.getState().setSyncStatus('idle')
    } catch (e: any) {
      const msg = e?.message ?? 'Sync failed'
      usePOSStore.getState().setSyncStatus('error', msg)
    }
  }

  private async pullCatalogue() {
    try {
      const res: any = await apiClient.syncInventoryUpdates(usePOSStore.getState().lastInventorySyncTime)
      const items = (res?.data?.items ??
        res?.data?.products ??
        res?.items ??
        res?.products ??
        []) as any[]
      if (Array.isArray(items) && items.length > 0) {
        const mapped = items.map(normalizeWebItem)
        usePOSStore.getState().setInventoryCache(mapped as any)
      }
    } catch {
      // fallback straight pos catalog if the helper failed
      try {
        const catalog: any = await apiClient.fetchPosCatalog(true)
        const items = (catalog.items ?? catalog.products ?? []) as any[]
        if (Array.isArray(items)) usePOSStore.getState().setInventoryCache(items.map(normalizeWebItem) as any)
      } catch {
        // swallow — keep stale cache
      }
    }
  }

  getStatus() {
    const s = usePOSStore.getState()
    return {
      isOnline: s.isOnline,
      syncStatus: s.syncStatus,
      syncError: s.syncError,
      pendingCount: s.pendingTransactions.length,
    }
  }
}

// Normalize web catalogue shape (server normalises price -> number) into InventoryItem
function normalizeWebItem(raw: any) {
  const price = Number(raw.unitPrice ?? raw.price ?? 0)
  const qty = Number(raw.quantity ?? raw.stockQuantity ?? raw.stock ?? 0)
  const cost = Number(raw.cost ?? raw.costPrice ?? 0)
  const sku = String(raw.sku ?? raw.id)
  return {
    id: String(raw.id ?? sku),
    sku,
    name: String(raw.name ?? 'Item'),
    description: raw.description ? String(raw.description) : undefined,
    category: String(raw.category ?? 'General'),
    price,
    cost,
    costPrice: cost,
    quantity: qty,
    stockQuantity: qty,
    image: raw.image ?? raw.gallery?.[0] ?? undefined,
    gallery: Array.isArray(raw.gallery) ? raw.gallery : raw.images?.map((i: any) => i.url) ?? [],
    images: Array.isArray(raw.images) ? raw.images : undefined,
    available: raw.available !== false && qty > 0,
    lastUpdated: Date.now(),
  }
}

const syncEngine = new SyncEngine()
export default syncEngine
