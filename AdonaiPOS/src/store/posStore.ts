import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { User, InventoryItem, CartItem, Transaction } from '../types'

const TAX_RATE = Number(process.env.EXPO_PUBLIC_TAX_RATE ?? 0.18)

interface POSState {
  // Auth
  currentUser: User | null
  currentTerminal: string
  isAuthenticated: boolean

  // Cart / ledger
  cart: CartItem[]
  subtotal: number
  discount: number
  discountReason: string
  tax: number
  total: number

  // Inventory
  inventoryCache: Record<string, InventoryItem>
  lastInventorySyncTime: number

  // Network
  isOnline: boolean
  syncStatus: 'idle' | 'syncing' | 'error'
  syncError?: string
  pendingTransactions: Transaction[]

  // Actions
  login: (user: User) => void
  logout: () => void
  setTerminal: (terminalId: string) => void

  addItemToCart: (item: InventoryItem, quantity?: number) => void
  removeItemFromCart: (itemId: string) => void
  updateItemQuantity: (itemId: string, quantity: number) => void
  clearCart: () => void
  applyDiscount: (amount: number, reason: string) => void

  setInventoryCache: (items: InventoryItem[]) => void
  updateInventoryCacheItem: (item: InventoryItem) => void

  setOnlineStatus: (online: boolean) => void
  setSyncStatus: (status: 'idle' | 'syncing' | 'error', error?: string) => void
  addPendingTransaction: (transaction: Transaction) => void
  removePendingTransaction: (transactionId: string) => void
  clearPendingTransactions: () => void

  recalculateTotals: () => void
}

function calculateTotals(
  cart: CartItem[],
  discount: number
): { subtotal: number; tax: number; total: number } {
  const subtotal = cart.reduce((sum, it) => sum + it.lineTotal, 0)
  const tax = Math.round(subtotal * TAX_RATE)
  const total = Math.max(0, subtotal + tax - discount)
  return { subtotal, tax: Math.round(tax), total }
}

export const usePOSStore = create<POSState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      currentTerminal: (process.env.EXPO_PUBLIC_TERMINAL_ID as string) ?? 'REGISTER-001',
      isAuthenticated: false,
      cart: [],
      subtotal: 0,
      discount: 0,
      discountReason: '',
      tax: 0,
      total: 0,
      inventoryCache: {},
      lastInventorySyncTime: 0,
      isOnline: true,
      syncStatus: 'idle',
      pendingTransactions: [],

      login: (user) => set({ currentUser: user, isAuthenticated: true }),
      logout: () =>
        set({
          currentUser: null,
          isAuthenticated: false,
          cart: [],
          subtotal: 0,
          discount: 0,
          discountReason: '',
          tax: 0,
          total: 0,
        }),
      setTerminal: (terminalId) => set({ currentTerminal: terminalId }),

      addItemToCart: (item, quantity = 1) =>
        set((state) => {
          const existing = state.cart.find((c) => c.id === item.id)
          let newCart: CartItem[]
          if (existing) {
            newCart = state.cart.map((c) =>
              c.id === item.id
                ? { ...c, cartQty: c.cartQty + quantity, lineTotal: (c.cartQty + quantity) * c.price }
                : c
            )
          } else {
            newCart = [
              ...state.cart,
              { ...item, cartQty: quantity, lineTotal: quantity * item.price },
            ]
          }
          const { subtotal, tax, total } = calculateTotals(newCart, state.discount)
          return { cart: newCart, subtotal, tax, total }
        }),

      removeItemFromCart: (itemId) =>
        set((state) => {
          const newCart = state.cart.filter((c) => c.id !== itemId)
          const { subtotal, tax, total } = calculateTotals(newCart, state.discount)
          return { cart: newCart, subtotal, tax, total }
        }),

      updateItemQuantity: (itemId, quantity) =>
        set((state) => {
          if (quantity <= 0) return { cart: state.cart.filter((c) => c.id !== itemId) } as any
          const newCart = state.cart.map((c) =>
            c.id === itemId ? { ...c, cartQty: quantity, lineTotal: quantity * c.price } : c
          )
          const { subtotal, tax, total } = calculateTotals(newCart, state.discount)
          return { cart: newCart, subtotal, tax, total }
        }),

      clearCart: () => set({ cart: [], subtotal: 0, discount: 0, discountReason: '', tax: 0, total: 0 }),

      applyDiscount: (amount, reason) =>
        set((state) => {
          const { subtotal, tax, total } = calculateTotals(state.cart, amount)
          return { discount: amount, discountReason: reason, subtotal, tax, total }
        }),

      setInventoryCache: (items) => {
        const cache: Record<string, InventoryItem> = {}
        for (const item of items) {
          cache[item.sku] = { ...item, lastUpdated: Date.now() }
          cache[item.id] = { ...item, lastUpdated: Date.now() }
        }
        set({ inventoryCache: cache, lastInventorySyncTime: Date.now() })
      },

      updateInventoryCacheItem: (item) =>
        set((state) => ({
          inventoryCache: {
            ...state.inventoryCache,
            [item.sku]: item,
            [item.id]: item,
          },
        })),

      setOnlineStatus: (online) => set({ isOnline: online }),
      setSyncStatus: (status, error) => set({ syncStatus: status, syncError: error }),
      addPendingTransaction: (t) => set((s) => ({ pendingTransactions: [...s.pendingTransactions, t] })),
      removePendingTransaction: (id) =>
        set((s) => ({ pendingTransactions: s.pendingTransactions.filter((t) => t.id !== id) })),
      clearPendingTransactions: () => set({ pendingTransactions: [] }),
      recalculateTotals: () =>
        set((state) => {
          const { subtotal, tax, total } = calculateTotals(state.cart, state.discount)
          return { subtotal, tax, total }
        }),
    }),
    {
      name: 'adonai-pos-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentUser: state.currentUser,
        currentTerminal: state.currentTerminal,
        isAuthenticated: state.isAuthenticated,
        inventoryCache: state.inventoryCache,
        lastInventorySyncTime: state.lastInventorySyncTime,
        pendingTransactions: state.pendingTransactions,
      }),
    }
  )
)
