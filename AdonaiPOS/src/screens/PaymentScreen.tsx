import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { usePOSStore } from '../store/posStore'
import apiClient from '../services/api'
import PaymentMethodModal from '../components/PaymentMethodModal'
import { formatUGX } from '../utils/formatters'
import { Transaction } from '../types'
import uuid from 'react-native-uuid'

export default function PaymentScreen({ navigation }: any) {
  const cart = usePOSStore((s) => s.cart)
  const subtotal = usePOSStore((s) => s.subtotal)
  const discount = usePOSStore((s) => s.discount)
  const discountReason = usePOSStore((s) => s.discountReason)
  const tax = usePOSStore((s) => s.tax)
  const total = usePOSStore((s) => s.total)
  const currentUser = usePOSStore((s) => s.currentUser)
  const currentTerminal = usePOSStore((s) => s.currentTerminal)
  const isOnline = usePOSStore((s) => s.isOnline)
  const addPendingTransaction = usePOSStore((s) => s.addPendingTransaction)
  const clearCart = usePOSStore((s) => s.clearCart)
  const applyDiscount = usePOSStore((s) => s.applyDiscount)

  const [showPay, setShowPay] = useState(false)
  const [discountValue, setDiscountValue] = useState(discount ? String(discount) : '')
  const [reason, setReason] = useState(discountReason)
  const [paying, setPaying] = useState(false)

  const handlePay = async (input: { method: 'cash' | 'mobile_money'; amountTendered: number; mobileMoneyRef?: string }) => {
    setPaying(true)
    try {
      const now = Date.now()
      const transaction: Transaction = {
        id: `TX-${String(uuid.v4()).slice(0, 8).toUpperCase()}`,
        timestamp: now,
        cashierId: currentUser?.name ?? 'Cashier',
        terminalId: currentTerminal,
        items: cart.map((c) => ({ ...c })),
        subtotal,
        discount,
        discountReason: discountReason || undefined,
        tax,
        total,
        paymentMethod: input.method,
        amountTendered: input.amountTendered,
        change: Math.max(0, input.amountTendered - total),
        mobileMoneyRef: input.mobileMoneyRef,
        synced: false,
      }

      if (input.method === 'mobile_money' && input.mobileMoneyRef && isOnline) {
        try {
          const intent: any = await apiClient.initiateMobileMoneyPayment(total, input.mobileMoneyRef)
          transaction.mobileMoneyRef = intent.referenceId ?? input.mobileMoneyRef
          // optional verify — don't block receipt
          apiClient.verifyMobileMoneyPayment(transaction.mobileMoneyRef!).catch(() => {})
        } catch (e: any) {
          Alert.alert('MoMo request failed', e?.message ?? 'Saved offline — will retry.')
        }
      }

      if (isOnline) {
        try {
          await apiClient.createTransaction(transaction as any)
          transaction.synced = true
          transaction.syncedAt = Date.now()
        } catch {
          addPendingTransaction(transaction)
        }
      } else {
        addPendingTransaction(transaction)
      }

      if (!transaction.synced) addPendingTransaction(transaction)
      // clear and go to receipt
      clearCart()
      setShowPay(false)
      navigation.replace('Receipt', { transaction })
    } catch (e: any) {
      Alert.alert('Payment failed', e?.message ?? 'Try again.')
    } finally {
      setPaying(false)
    }
  }

  const applyDisc = () => {
    const v = Number(discountValue.replace(/[^0-9]/g, '') || '0')
    applyDiscount(v, reason.trim())
  }

  return (
    <SafeAreaView style={styles.wrap} edges={['top']}>
      <Text style={styles.title}>Payment</Text>

      <View style={styles.summary}>
        <Row label="Subtotal" value={formatUGX(subtotal)} />
        <Row label="VAT 18%" value={formatUGX(tax)} muted />
        {discount > 0 && <Row label={`Discount${discountReason ? ` — ${discountReason}` : ''}`} value={`−${formatUGX(discount)}`} highlight />}
        <Row label="Total to pay" value={formatUGX(total)} bold large />
        <Text style={styles.online}>{isOnline ? 'Online — receipt will sync immediately' : 'Offline — transaction will sync when online'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Discount (optional)</Text>
        <TextInput value={discountValue} onChangeText={setDiscountValue} placeholder="0" keyboardType="numeric" style={styles.input} />
        <TextInput value={reason} onChangeText={setReason} placeholder="Reason (manager approval, damage, etc.)" style={[styles.input, { marginTop: 8 }]} />
        <TouchableOpacity onPress={applyDisc} style={styles.discBtn}>
          <Text style={styles.discBtnText}>Apply discount</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.ghost}>
          <Text style={styles.ghostText}>Back to cart</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowPay(true)} style={styles.primary} disabled={paying}>
          {paying ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Choose payment</Text>}
        </TouchableOpacity>
      </View>

      <PaymentMethodModal visible={showPay} total={total} onClose={() => setShowPay(false)} onSelect={handlePay} />
    </SafeAreaView>
  )
}

function Row({ label, value, bold, large, muted, highlight }: any) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, bold && styles.bold, large && styles.large, muted && styles.muted, highlight && styles.highlight]}>{label}</Text>
      <Text style={[styles.value, bold && styles.bold, large && styles.large, highlight && styles.highlight]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 18, fontWeight: '900', color: '#111827' },
  summary: { marginTop: 14, backgroundColor: '#f9fafb', borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e5e7eb', gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 12, color: '#374151' },
  value: { fontSize: 12, fontWeight: '700', color: '#111827' },
  bold: { fontWeight: '900' },
  large: { fontSize: 16 },
  muted: { color: '#6b7280' },
  highlight: { color: '#059669' },
  online: { fontSize: 11, color: '#059669', marginTop: 6 },
  card: { marginTop: 16, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e5e7eb' },
  cardTitle: { fontSize: 12, fontWeight: '800', color: '#111827', textTransform: 'uppercase' as any, letterSpacing: 0.6 },
  input: { marginTop: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  discBtn: { marginTop: 10, backgroundColor: '#f3f4f6', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  discBtnText: { fontWeight: '700', color: '#374151', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 'auto', paddingTop: 16 },
  ghost: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  ghostText: { fontWeight: '700', color: '#374151' },
  primary: { flex: 1, backgroundColor: '#0a1f3f', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '900' },
})
