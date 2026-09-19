import React, { useMemo } from 'react'
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet } from 'react-native'
import { usePOSStore } from '../store/posStore'
import { formatUGX } from '../utils/formatters'

export default function QuickSelectTiles({ onSearchSubmit }: { onSearchSubmit?: (sku: string) => void }) {
  const inventoryCache = usePOSStore((s) => s.inventoryCache)
  const addItemToCart = usePOSStore((s) => s.addItemToCart)

  const items = useMemo(() => {
    const seen = new Set<string>()
    const list: any[] = []
    for (const v of Object.values(inventoryCache as any)) {
      if (seen.has((v as any).id)) continue
      seen.add((v as any).id)
      if ((v as any).available === false) continue
      list.push(v)
      if (list.length >= 24) break
    }
    return list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [inventoryCache])

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No inventory cached — pull down or check connection.</Text>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.head}>Quick select</Text>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        numColumns={3}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.tile}
            onPress={() => addItemToCart(item as any, 1)}
            activeOpacity={0.75}
          >
            {item.image || item.gallery?.[0] ? (
              <Image source={{ uri: item.image ?? item.gallery?.[0] }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]} />
            )}
            <Text style={styles.tileName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.tileSku} numberOfLines={1}>
              {item.sku}
            </Text>
            <Text style={styles.tilePrice}>{formatUGX(item.price)}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 8 },
  head: { fontSize: 12, fontWeight: '700', color: '#374151', paddingHorizontal: 12, marginBottom: 6, letterSpacing: 0.6, textTransform: 'uppercase' as any },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 12 },
  tile: {
    flex: 1,
    margin: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    maxWidth: '33%',
  },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#f3f4f6' },
  thumbPlaceholder: { backgroundColor: '#e5e7eb' },
  tileName: { fontSize: 11, fontWeight: '600', color: '#111827', marginTop: 6, minHeight: 28 },
  tileSku: { fontSize: 10, color: '#6b7280' },
  tilePrice: { fontSize: 12, fontWeight: '800', color: '#0a1f3f', marginTop: 2 },
})
