// @ts-nocheck
// ---------------------------------------------------------------------------
// Database Schema & Type Definitions — Item Intake Pipeline
// ---------------------------------------------------------------------------
// This file re-exports the canonical types from the catalogue store so that
// both the API layer and the React intake panel share a single strict source
// of truth. The underlying storage is the JSON catalogue (catalogue.json),
// whose shape is defined in app/services/catalogue_store.ts.

export type ImageTag = 'front' | 'back' | 'texture' | 'label' | 'other'

export interface ProductImage {
  id: string
  url: string
  isPrimary: boolean
  tag: ImageTag
  order: number
}

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

// Re-export for convenience
export type { StoredProduct, ProductInput } from '#services/catalogue_store'
