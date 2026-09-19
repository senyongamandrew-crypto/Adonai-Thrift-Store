// @ts-nocheck
// ---------------------------------------------------------------------------
// Item Intake Panel — Multi-Angle Asset Pipeline
// ---------------------------------------------------------------------------
// Implements the full intake form component with dynamic image tagging,
// thumbnail sorting, automated primary image defaulting, and stock quantity
// registration. Processes binary images client-side before uploading to
// prevent network bottlenecks and field drop-off errors.
// ---------------------------------------------------------------------------

import React, { useState, ChangeEvent } from 'react'
import { Camera, Trash2, Star, AlertCircle, Plus } from 'lucide-react'

// Types for Product Intake Assets
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

// ---------------------------------------------------------------------------
// Resilient Error-Handling & Compression
// ---------------------------------------------------------------------------

/**
 * Compress an image client-side using a canvas.
 * - Resizes to max 1600px on the longest side to prevent network bottlenecks.
 * - Encodes as JPEG at quality 0.78 (or keeps PNG/WebP when transparency needed).
 * - Returns a Blob ready for upload; falls back to original file on failure.
 */
async function compressImage(file: File, maxDimension = 1600, quality = 0.78): Promise<Blob> {
  // If the file is already small (< 800KB) or not an image, don't recompress
  if (file.size < 800 * 1024) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img

      // Preserve aspect ratio, constrain longest side
      if (width > maxDimension || height > maxDimension) {
        const ratio = width / height
        if (ratio > 1) {
          width = maxDimension
          height = Math.round(maxDimension / ratio)
        } else {
          height = maxDimension
          width = Math.round(maxDimension * ratio)
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }

      // White background for JPEG (in case source has transparency)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      // Prefer WebP when supported, otherwise JPEG
      const type = file.type === 'image/png' && hasTransparency(ctx, width, height) ? 'image/png' : 'image/jpeg'

      canvas.toBlob(
        (blob) => resolve(blob ?? file),
        type,
        type === 'image/png' ? undefined : quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }

    img.src = url
  })
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const data = ctx.getImageData(0, 0, Math.min(w, 10), Math.min(h, 10)).data
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true
    }
  } catch {
    // Security error (tainted canvas) — assume no transparency
  }
  return false
}

function stockStatus(qty: number, threshold: number): { label: string; color: string } {
  if (qty <= 0) return { label: 'Out of stock', color: 'bg-red-100 text-red-700 border-red-200' }
  if (qty <= threshold) return { label: 'Low stock', color: 'bg-amber-100 text-amber-700 border-amber-200' }
  return { label: 'In stock', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
}

export const ItemIntakePanel: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    price: 0,
    costPrice: 0,
    stockQuantity: 0,
    lowStockThreshold: 5,
    category: '',
    description: '',
  })

  const [images, setImages] = useState<ProductImage[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isCompressing, setIsCompressing] = useState(false)

  // File Processing & Automated Compression
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null)
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsCompressing(true)
    try {
      const fileArray = Array.from(files)

      const newImages: ProductImage[] = await Promise.all(
        fileArray.map(async (file, index) => {
          const isFirstImage = images.length === 0 && index === 0
          let blob: Blob = file
          try {
            blob = await compressImage(file)
          } catch {
            // Fall through to original file on compression failure
            blob = file
          }

          // In production replace this object URL with the S3/Cloudinary URL
          // returned after uploading the compressed blob.
          const safeFile = blob instanceof File ? blob : new File([blob], file.name, { type: blob.type || file.type })
          const url = URL.createObjectURL(safeFile)

          return {
            id: `img_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
            url,
            isPrimary: isFirstImage,
            tag: isFirstImage ? 'front' : 'other',
            order: images.length + index,
          }
        })
      )

      setImages((prev) => {
        const merged = [...prev, ...newImages].map((img, idx) => ({ ...img, order: idx }))
        return merged
      })
    } catch (err: any) {
      setErrorMsg(`Image processing failed: ${err?.message ?? 'unknown error'}. Try smaller photos.`)
    } finally {
      setIsCompressing(false)
      // Reset input so the same file can be re-selected after removal
      e.target.value = ''
    }
  }

  const setPrimaryImage = (selectedId: string) => {
    setImages((prev) =>
      prev.map((img) => ({
        ...img,
        isPrimary: img.id === selectedId,
        tag: img.id === selectedId ? 'front' : img.tag === 'front' ? 'other' : img.tag,
      }))
    )
  }

  const updateImageTag = (id: string, tag: ProductImage['tag']) => {
    setImages((prev) =>
      prev.map((img) => {
        if (img.id === id) {
          const isNowFront = tag === 'front'
          return {
            ...img,
            tag,
            isPrimary: isNowFront ? true : img.isPrimary,
          }
        }
        // If another image became 'front', demote previous primary tag if necessary
        return tag === 'front' ? { ...img, isPrimary: false } : img
      })
    )
  }

  const removeImage = (id: string) => {
    setImages((prev) => {
      const toRemove = prev.find((i) => i.id === id)
      if (toRemove) URL.revokeObjectURL(toRemove.url)
      const filtered = prev.filter((img) => img.id !== id).map((img, idx) => ({ ...img, order: idx }))
      // Ensure at least one primary image remains if array is not empty
      if (filtered.length > 0 && !filtered.some((img) => img.isPrimary)) {
        filtered[0].isPrimary = true
        filtered[0].tag = 'front'
      }
      return filtered
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Strict Validation — client-side enforcement of server rules
    if (images.length === 0) {
      setErrorMsg('Validation Error: You must upload at least one image (Front View required).')
      return
    }

    const primaries = images.filter((img) => img.isPrimary)
    if (primaries.length !== 1) {
      setErrorMsg('Validation Error: Exactly one image must be marked as the primary (Front) view for product grid display.')
      return
    }

    if (!primaries.some((img) => img.tag === 'front')) {
      setErrorMsg('Validation Error: The primary image must have the Front View tag.')
      return
    }

    if (formData.stockQuantity < 0) {
      setErrorMsg('Validation Error: Stock Quantity cannot be negative.')
      return
    }

    if (!formData.name.trim() || !formData.sku.trim()) {
      setErrorMsg('Validation Error: Product Title and SKU are required.')
      return
    }

    const payload: ItemIntakeFormData = {
      ...formData,
      images: [...images].sort((a, b) => a.order - b.order),
    }

    console.log('Successfully Submitting Item Intake Payload:', payload)
    // Submit payload to POS backend API endpoint — e.g.:
    // fetch('/api/pos/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-adonai-pin': '...' }, body: JSON.stringify(payload) })
  }

  const stock = stockStatus(formData.stockQuantity, formData.lowStockThreshold)

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white shadow-lg rounded-xl border border-gray-100">
      <div className="border-b pb-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Item Intake Configuration</h2>
        <p className="text-sm text-gray-500">Configure core product details, image catalog, and stock metrics.</p>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 flex items-center gap-3 text-red-700 rounded">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Product Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Product Title</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g., Vintage Denim Jacket"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">SKU / Barcode</label>
            <input
              type="text"
              required
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g., AD-JKT-001"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Category</label>
            <input
              type="text"
              required
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g., Outerwear"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Cost Price (UGX)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.costPrice}
              onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g., 20000"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none min-h-24"
            placeholder="Stone-washed denim, no marks..."
          />
        </div>

        {/* Stock Quantity Setup — Optimized Stock Count Data Entry with visual feedback */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
              Initial Stock Quantity <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              required
              value={formData.stockQuantity}
              onChange={(e) => setFormData({ ...formData, stockQuantity: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-lg font-bold border rounded-md focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            />
            <span
              className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${stock.color}`}
            >
              {stock.label} · {formData.stockQuantity} units
            </span>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Low Stock Alert Level</label>
            <input
              type="number"
              min="1"
              value={formData.lowStockThreshold}
              onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            />
            <p className="mt-1 text-[11px] text-gray-500">Alert when stock ≤ {formData.lowStockThreshold}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Retail Unit Price</label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              placeholder="45000"
            />
          </div>
        </div>

        {/* Multi-Angle Image Intake Section */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="block text-xs font-bold text-gray-700 uppercase">
              Product Images (Front, Back, Texture, Label Views)
            </label>
            <span className="text-xs text-gray-500">First upload defaults to Primary (Front View)</span>
          </div>

          {/* Upload Dropzone */}
          <div className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-lg p-6 text-center transition-colors">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              id="image-upload-input"
              disabled={isCompressing}
            />
            <label htmlFor="image-upload-input" className="cursor-pointer flex flex-col items-center justify-center gap-2">
              <Camera className="w-8 h-8 text-gray-400" />
              <span className="text-sm font-semibold text-gray-600">
                {isCompressing ? 'Compressing images…' : 'Click to upload product angles'}
              </span>
              <span className="text-xs text-gray-400">Supports Front, Back, Fabric Texture, and Tag/Label shots</span>
            </label>
          </div>

          {/* Image Preview Grid */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              {images
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((img) => (
                  <div
                    key={img.id}
                    className={`relative rounded-lg border p-2 flex flex-col gap-2 transition-all ${
                      img.isPrimary ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50/20' : 'border-gray-200'
                    }`}
                  >
                    <div className="relative h-32 w-full rounded overflow-hidden bg-gray-100">
                      <img src={img.url} alt="Product view" className="object-cover w-full h-full" />
                      <button
                        type="button"
                        onClick={() => removeImage(img.id)}
                        className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition"
                        title="Remove image"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {img.isPrimary && (
                        <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                          MAIN / FRONT
                        </span>
                      )}
                    </div>

                    {/* Image Tag Selector */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Angle Tag</label>
                      <select
                        value={img.tag}
                        onChange={(e) => updateImageTag(img.id, e.target.value as ProductImage['tag'])}
                        className="text-xs border rounded p-1 bg-white outline-none"
                      >
                        <option value="front">Front View</option>
                        <option value="back">Back View</option>
                        <option value="texture">Texture / Detail</option>
                        <option value="label">Tag / Label</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    {/* Set Primary Button */}
                    <button
                      type="button"
                      onClick={() => setPrimaryImage(img.id)}
                      disabled={img.isPrimary}
                      className={`mt-auto flex items-center justify-center gap-1 py-1 px-2 rounded text-xs font-semibold transition ${
                        img.isPrimary
                          ? 'bg-blue-100 text-blue-700 cursor-default'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Star className={`w-3 h-3 ${img.isPrimary ? 'fill-blue-600 text-blue-600' : ''}`} />
                      {img.isPrimary ? 'Main Image' : 'Set as Main'}
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Submit Actions */}
        <div className="pt-4 border-t flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              images.forEach((img) => URL.revokeObjectURL(img.url))
              setImages([])
              setFormData({ name: '', sku: '', price: 0, costPrice: 0, stockQuantity: 0, lowStockThreshold: 5, category: '', description: '' })
              setErrorMsg(null)
            }}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-md hover:bg-gray-50"
          >
            Reset Form
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-md hover:bg-blue-700 shadow-md transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Save &amp; Add Product to POS
          </button>
        </div>
      </form>
    </div>
  )
}

export default ItemIntakePanel
