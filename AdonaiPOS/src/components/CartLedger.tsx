import React from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { usePOSStore } from '../store/posStore'
import { formatUGX } from '../utils/formatters'
import { CartItem } from '../types'

export default function CartLedger({ onEdit }: { onEdit?: (item: CartItem) => void }) {
  const cart = usePOSStore((s) => s.cart)
  const subtotal = usePOSStore((s) => s.subtotal)
  const discount = usePOSStore((s) => s.discount)
  const tax = usePOSStore((s) => s.tax)
  const total = usePOSStore((s) => s.total)
  const discountReason = usePOSStore((s) => s.discountReason)
  const removeItemFromCart = usePOSStore((s) => s.removeItemFromCart)
  const updateItemQuantity = usePOSStore((s) => s.updateItemQuantity)

  if (cart.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Cart empty — scan a barcode or tap a tile</Text>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        data={cart}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingBottom: 12 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.sku}>{item.sku}  •  {formatUGX(item.price)}</Text>
            </View>
            <View style={styles.qty}>
              <TouchableOpacity
                onPress={() => updateItemQuantity(item.id, Math.max(1, item.cartQty - 1))}
                style={styles.qtyBtn}
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.cartQty}</Text>
              <TouchableOpacity onPress={() => updateItemQuantity(item.id, item.cartQty + 1)} style={styles.qtyBtn}>
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.lineTotal}>{formatUGX(item.lineTotal)}</Text>
            <TouchableOpacity onPress={() => removeItemFromCart(item.id)}>
              <Text style={styles.remove}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      <View style={styles.totals}>
        <Row label="Subtotal" value={formatUGX(subtotal)} />
        <Row label="VAT 18%" value={formatUGX(tax)} muted />
        {discount > 0 && <Row label={`Discount${discountReason ? ` — ${discountReason}` : ''}`} value={`−${formatUGX(discount)}`} highlight />}
        <Row label="Total" value={formatUGX(total)} bold large />
      </View>
    </View>
  )
}

function Row({ label, value, bold, large, muted, highlight }: any) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, bold && styles.bold, large && styles.large, muted && styles.muted, highlight && styles.highlight]}>{label}</Text>
      <Text style={[styles.totalValue, bold && styles.bold, large && styles.large, highlight && styles.highlight]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  empty: { padding: 28, alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  info: { flex: 1 },
  name: { fontSize: 13, fontWeight: '600', color: '#111827' },
  sku: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 4 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0a1f3f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnText: { color: '#fff', fontSize: 16, lineHeight: 18, fontWeight: '700' },
  qtyText: { minWidth: 18, textAlign: 'center', fontWeight: '700', fontSize: 13 },
  lineTotal: { width: 88, textAlign: 'right', fontWeight: '700', fontSize: 13, color: '#111827' },
  remove: { color: '#9ca3af', fontSize: 16, paddingHorizontal: 4 },
  totals: { borderTopWidth: 1, borderTopColor: '#0a1f3f', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#f9fafb', gap: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 12, color: '#374151' },
  totalValue: { fontSize: 12, fontWeight: '600', color: '#111827' },
  bold: { fontWeight: '800' },
  large: { fontSize: 15 },
  muted: { color: '#6b7280' },
  highlight: { color: '#059669' },
})
