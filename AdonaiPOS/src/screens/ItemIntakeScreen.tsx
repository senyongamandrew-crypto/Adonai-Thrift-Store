/**
 * ItemIntakeScreen — phones in new stock.
 * Uses MultiAngleCapture + posts to the strict endpoint POST /api/pos/intake
 * that the web's pos_api_controller validates (exactly one primary, stock≥0).
 * Flow: snap → per-tag upload to /api/media/upload → compose images[] → POST /api/pos/intake
 */
import React, { useState } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import MultiAngleCapture from '../components/MultiAngleCapture'
import { ProductImage } from '../types'
import apiClient from '../services/api'
import { validateIntake } from '../utils/validators'

export default function ItemIntakeScreen({ navigation }: any) {
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [price, setPrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [stockQuantity, setStockQuantity] = useState('1')
  const [lowStockThreshold, setLowStockThreshold] = useState('2')
  const [category, setCategory] = useState('General')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<ProductImage[]>([])
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const priceNum = Number(price.replace(/[^0-9]/g, '') || '0')
    const costNum = Number(costPrice.replace(/[^0-9]/g, '') || '0')
    const stock = Number(stockQuantity.replace(/[^0-9-]/g, '') || '0')
    const low = Number(lowStockThreshold.replace(/[^0-9]/g, '') || '2')

    const err = validateIntake({ name, sku, price: priceNum, stockQuantity: stock, images })
    if (err) return Alert.alert('Fix the form', err)
    if (priceNum <= 0) return Alert.alert('Price required', 'Enter a valid UGX price.')

    setSaving(true)
    try {
      // 1) upload each data-URL to /api/media/upload to get real URLs
      const uploaded: ProductImage[] = []
      for (const img of images) {
        if (img.url.startsWith('http')) {
          uploaded.push(img)
        } else if (img.url.startsWith('data:')) {
          const res: any = await apiClient.uploadMediaBase64(img.url)
          const url = res?.url ?? res?.media?.url ?? img.url
          uploaded.push({ ...img, url })
        } else {
          uploaded.push(img)
        }
      }

      // normalize primary (server also normalizes but strict validates exactly one)
      const primaries = uploaded.filter((i) => i.isPrimary)
      if (primaries.length === 0 && uploaded.length > 0) uploaded[0].isPrimary = true
      if (primaries.length > 1) {
        let first = true
        for (const it of uploaded) if (it.isPrimary) first ? (first = false) : (it.isPrimary = false)
      }

      const payload = {
        name: name.trim(),
        sku: sku.trim(),
        // server accepts unitPrice/price
        price: priceNum,
        unitPrice: priceNum,
        costPrice: costNum,
        cost: costNum,
        stockQuantity: stock,
        quantity: stock,
        lowStockThreshold: low,
        category: category.trim() || 'General',
        description: description.trim() || undefined,
        images: uploaded.map((it, idx) => ({
          id: it.id || `img-${idx}`,
          url: it.url,
          isPrimary: it.isPrimary,
          tag: it.tag,
          order: it.order ?? idx,
        })),
      }

      await apiClient.createIntakeItem(payload)
      Alert.alert('Saved', `"${name.trim()}" is now live on the website.`)
      navigation.goBack()
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message ?? 'Upload failed.'
      Alert.alert('Save failed', msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.wrap} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>New stock — intake</Text>
        <Text style={styles.sub}>Multi-angle pipeline (front → back → texture → label). The website uses the same validation.</Text>

        <Text style={styles.label}>Item name *</Text>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Vintage Denim Jacket" style={styles.input} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>SKU *</Text>
            <TextInput value={sku} onChangeText={setSku} placeholder="e.g. DN-204" autoCapitalize="characters" style={styles.input} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Category</Text>
            <TextInput value={category} onChangeText={setCategory} placeholder="General" style={styles.input} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Price (UGX) *</Text>
            <TextInput value={price} onChangeText={setPrice} placeholder="35000" keyboardType="numeric" style={styles.input} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Cost (UGX)</Text>
            <TextInput value={costPrice} onChangeText={setCostPrice} placeholder="15000" keyboardType="numeric" style={styles.input} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Stock qty *</Text>
            <TextInput value={stockQuantity} onChangeText={setStockQuantity} keyboardType="numeric" style={styles.input} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Low-stock at</Text>
            <TextInput value={lowStockThreshold} onChangeText={setLowStockThreshold} keyboardType="numeric" style={styles.input} />
          </View>
        </View>

        <Text style={styles.label}>Description</Text>
        <TextInput value={description} onChangeText={setDescription} placeholder="Condition, size, bin…" multiline numberOfLines={3} style={[styles.input, styles.textarea]} />

        <View style={{ marginTop: 16 }}>
          <MultiAngleCapture images={images} onChange={setImages} />
        </View>

        <TouchableOpacity onPress={save} style={[styles.btn, saving && styles.btnDisabled]} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save to website</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.link}>
          <Text style={styles.linkText}>← Back to till</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 16, fontWeight: '900', color: '#111827' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: '700', color: '#374151', marginTop: 12, letterSpacing: 0.4, textTransform: 'uppercase' as any },
  input: { marginTop: 6, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, backgroundColor: '#fff' },
  textarea: { minHeight: 72, textAlignVertical: 'top' as any },
  row: { flexDirection: 'row', gap: 12 },
  btn: { marginTop: 20, backgroundColor: '#0a1f3f', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '900' },
  link: { marginTop: 14, alignItems: 'center' },
  linkText: { color: '#6b7280', fontWeight: '700', fontSize: 12 },
})
