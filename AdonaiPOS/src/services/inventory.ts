import apiClient from './api'
import { InventoryItem } from '../types'

export async function fetchInventory(): Promise<InventoryItem[]> {
  const res: any = await apiClient.fetchInventory()
  return (res?.data?.items ?? res?.items ?? []) as InventoryItem[]
}

export async function getItemBySku(sku: string): Promise<InventoryItem | null> {
  return (await apiClient.searchInventoryBySKU(sku)) as InventoryItem | null
}

export async function createInventoryItem(payload: any) {
  return apiClient.createCatalogItem(payload)
}
