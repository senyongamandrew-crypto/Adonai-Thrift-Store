/**
 * MultiAngleCapture — the phone-side companion to web's compressImageFile +
 * multi-angle pipeline. Lets the user snap front/back/texture/label in order
 * and guarantees exactly one primary (front default) before upload.
 */
import React, { useState } from 'react'
import { View, Text, TouchableOpacity, Image, StyleSheet, Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { ProductImage, ImageTag } from '../types'

const TAGS: { tag: ImageTag; label: string; hint: string }[] = [
  { tag: 'front', label: 'Front', hint: 'Primary — must be exactly one' },
  { tag: 'back', label: 'Back', hint: 'Rear / label back' },
  { tag: 'texture', label: 'Texture', hint: 'Close-up fabric' },
  { tag: 'label', label: 'Label', hint: 'Brand / wash tag' },
]

interface Props {
  images: ProductImage[]
  onChange: (images: ProductImage[]) => void
}

export default function MultiAngleCapture({ images, onChange }: Props) {
  const pick = async (tag: ImageTag) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Camera permission required')
      return
    }
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.78,
      base64: true,
      exif: false,
    })
    if (res.canceled || !res.assets?.[0]) return
    const asset = res.assets[0]
    // Client-side cap is already quality:0.78; result is base64 for /api/media/upload
    const url = `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64 ?? ''}`
    // Actually upload immediately and use the returned URL? Keep data URL until parent uploads
    // For DX simplicity keep data URL and let parent call uploadMediaBase64 sequentially.
    const id = `${tag}-${Date.now()}`
    const next: ProductImage[] = [...images.filter((i) => i.tag !== tag), { id, url, isPrimary: tag === 'front' ? true : images.length === 0 ? true : false, tag, order: orderFor(tag) }]
    // enforce exactly one primary: if front inserted it becomes primary
    enforcePrimary(next)
    onChange(next)
  }

  const remove = (tag: ImageTag) => {
    const next = images.filter((i) => i.tag !== tag)
    enforcePrimary(next)
    onChange(next)
  }

  const setPrimary = (tag: ImageTag) => {
    const next = images.map((i) => ({ ...i, isPrimary: i.tag === tag }))
    onChange(next)
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.head}>Multi-angle photos</Text>
      <Text style={styles.sub}>Tap a card to snap. Exactly one must be primary — the front is primary by default.</Text>
      <View style={styles.grid}>
        {TAGS.map(({ tag, label, hint }) => {
          const img = images.find((i) => i.tag === tag)
          return (
            <View key={tag} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.tagLabel}>{label}</Text>
                {img?.isPrimary ? <Text style={styles.primaryBadge}>PRIMARY</Text> : null}
              </View>
              <Text style={styles.hint}>{hint}</Text>
              {img?.url ? <Image source={{ uri: img.url }} style={styles.preview} /> : <View style={[styles.preview, styles.previewEmpty]}><Text style={{ color: '#9ca3af', fontSize: 11 }}>No photo</Text></View>}
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => pick(tag)} style={[styles.btn, styles.btnDark]}>
                  <Text style={styles.btnDarkText}>{img ? 'Retake' : 'Snap'}</Text>
                </TouchableOpacity>
                {img ? (
                  <TouchableOpacity onPress={() => remove(tag)} style={[styles.btn, styles.btnGhost]}>
                    <Text style={styles.btnGhostText}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {img ? (
                <TouchableOpacity onPress={() => setPrimary(tag)} style={styles.primaryLink}>
                  <Text style={[styles.primaryLinkText, img.isPrimary && styles.primaryLinkActive]}>
                    {img.isPrimary ? '✓ Primary' : 'Set as primary'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        })}
      </View>
      {images.length > 0 && images.filter((i) => i.isPrimary).length !== 1 ? (
        <Text style={styles.warn}>Exactly one image must be marked primary before saving.</Text>
      ) : null}
    </View>
  )
}

function orderFor(tag: ImageTag): number {
  const order: Record<ImageTag, number> = { front: 0, back: 1, texture: 2, label: 3, other: 99 }
  return order[tag] ?? 99
}

function enforcePrimary(arr: ProductImage[]) {
  if (arr.length === 0) return
  const primaries = arr.filter((i) => i.isPrimary)
  if (primaries.length === 0) {
    // default to front, else first
    const front = arr.find((i) => i.tag === 'front')
    if (front) front.isPrimary = true
    else arr[0].isPrimary = true
  } else if (primaries.length > 1) {
    let first = true
    for (const it of arr) {
      if (it.isPrimary) {
        if (first) first = false
        else it.isPrimary = false
      }
    }
  }
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  head: { fontSize: 13, fontWeight: '800', color: '#111827', letterSpacing: 0.4, textTransform: 'uppercase' as any },
  sub: { fontSize: 12, color: '#6b7280' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  card: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tagLabel: { fontSize: 12, fontWeight: '800', color: '#0a1f3f' },
  primaryBadge: { fontSize: 9, fontWeight: '800', color: '#fff', backgroundColor: '#059669', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' as any },
  hint: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  preview: { width: '100%', aspectRatio: 1, borderRadius: 8, marginTop: 8, backgroundColor: '#f3f4f6' },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  btn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  btnDark: { backgroundColor: '#0a1f3f' },
  btnDarkText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnGhost: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  btnGhostText: { color: '#374151', fontWeight: '700', fontSize: 12 },
  primaryLink: { marginTop: 6, alignItems: 'center' },
  primaryLinkText: { fontSize: 11, color: '#0a1f3f', fontWeight: '600' },
  primaryLinkActive: { color: '#059669' },
  warn: { color: '#dc2626', fontSize: 12, marginTop: 6 },
})
