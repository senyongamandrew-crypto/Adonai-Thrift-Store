/**
 * Adonai POS — Shared types
 * Mirrors the web catalogue types in app/services/catalogue_store.ts
 * so the phone and website never disagree on a field name.
 */

// ---------------------------------------------------------------------------
// User / Auth
// ---------------------------------------------------------------------------
export interface User {
  id: string
  name: string
  phone: string
  role: 'cashier' | 'manager' | 'admin'
  pin: string
  terminalId?: string
}

// ---------------------------------------------------------------------------
// Multi-angle pipeline
// ---------------------------------------------------------------------------
export type ImageTag = 'front' | 'back' | 'texture' | 'label' | 'other'

export interface ProductImage {
  id: string
  url: string
  isPrimary: boolean
  tag: ImageTag
  order: number
}

// ---------------------------------------------------------------------------
// Inventory — what lives on the shelf
// ---------------------------------------------------------------------------
export interface InventoryItem {
  id: string
  sku: string
  name: string
  description?: string
  category: string
  price: number // UGX - integer shillings
  cost: number // UGX cost for margin calc
  costPrice?: number
  quantity: number
  stockQuantity?: number
  lowStockThreshold?: number
  condition?: 'new' | 'like-new' | 'good' | 'fair' | string
  image?: string
  gallery?: string[]
  galleryLabels?: string[]
  images?: ProductImage[]
  size?: string
  sizes?: string[]
  color?: string
  colours?: string[]
  bin?: string
  available: boolean
  lastUpdated: number // epoch ms
}

// Intake payload — used by ItemIntakeScreen → POST /api/pos/intake (strict)
export interface ItemIntakeFormData {
  name: string
  sku: string
  price: number
  costPrice: number
  stockQuantity: number
  lowStockThreshold: number
  category: string
  description?: string
  images: ProductImage[]
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------
export interface CartItem extends InventoryItem {
  cartQty: number
  lineTotal: number
}

// ---------------------------------------------------------------------------
// Transaction — what leaves the till
// ---------------------------------------------------------------------------
export interface Transaction {
  id: string
  timestamp: number
  cashierId: string
  terminalId: string
  items: CartItem[]
  subtotal: number
  discount: number
  discountReason?: string
  tax: number
  total: number
  paymentMethod: 'cash' | 'mobile_money'
  amountTendered: number
  change: number
  mobileMoneyRef?: string
  notes?: string
  synced: boolean
  syncedAt?: number
}

export interface PendingSync {
  transactions: Transaction[]
  lastSyncTime: number
}

export interface APIResponse<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
}

// Backend envelope helpers
export interface PosCatalogResponse {
  ok: boolean
  count: number
  items: InventoryItem[]
  products?: InventoryItem[]
}
