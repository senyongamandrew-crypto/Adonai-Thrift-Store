import React, { useMemo } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Share } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { usePOSStore } from '../store/posStore'
import { formatUGX, formatDateKampala } from '../utils/formatters'

export default function ShiftSummaryScreen({ navigation }: any) {
  const pendingTransactions = usePOSStore((s) => s.pendingTransactions)
  const terminal = usePOSStore((s) => s.currentTerminal)
  const user = usePOSStore((s) => s.currentUser)

  // Also show last synced? For now pending only + "today" computed from pending
  const stats = useMemo(() => {
    const total = pendingTransactions.reduce((sum, t) => sum + t.total, 0)
    const byMethod = pendingTransactions.reduce<Record<string, number>>((acc, t) => {
      acc[t.paymentMethod] = (acc[t.paymentMethod] ?? 0) + t.total
      return acc
    }, {})
    return { count: pendingTransactions.length, total, byMethod }
  }, [pendingTransactions])

  const share = async () => {
    const header = `${terminal} — ${user?.name ?? 'Till'}  ${formatDateKampala(Date.now())}`
    const lines = pendingTransactions
      .map((t) => `${t.id}  ${formatDateKampala(t.timestamp)}  ${formatUGX(t.total)}  ${t.paymentMethod}${!t.synced ? ' (pending)' : ''}`)
      .join('\n')
    await Share.share({
      message: [header, `Transactions: ${stats.count}`, `Total: ${formatUGX(stats.total)}`, `Cash: ${formatUGX(stats.byMethod.cash ?? 0)}  MoMo: ${formatUGX(stats.byMethod.mobile_money ?? 0)}`, '---', lines || '(no pending transactions)'].join('\n'),
    })
  }

  return (
    <SafeAreaView style={styles.wrap} edges={['top']}>
      <Text style={styles.title}>Shift summary</Text>
      <Text style={styles.sub}>
        {terminal}  •  {user?.name ?? '—'}  •  {formatDateKampala(Date.now())}
      </Text>

      <View style={styles.cards}>
        <Card label="Transactions" value={String(stats.count)} />
        <Card label="Total" value={formatUGX(stats.total)} />
        <Card label="Cash" value={formatUGX(stats.byMethod.cash ?? 0)} />
        <Card label="Mobile Money" value={formatUGX(stats.byMethod.mobile_money ?? 0)} />
      </View>

      <FlatList
        data={pendingTransactions}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          <Text style={styles.empty}>No pending transactions — everything is synced. Sale history lives in /api/orders on the website.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => navigation.navigate('Receipt', { transaction: item })} style={styles.row}>
            <View>
              <Text style={styles.txId}>{item.id}</Text>
              <Text style={styles.txMeta}>
                {formatDateKampala(item.timestamp)}  •  {item.paymentMethod}  {item.mobileMoneyRef ? `• ${item.mobileMoneyRef}` : ''}
              </Text>
            </View>
            <Text style={styles.txTotal}>{formatUGX(item.total)}</Text>
          </TouchableOpacity>
        )}
      />

      <View style={styles.actions}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.btn, styles.btnGhost]}>
          <Text style={styles.btnGhostText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={share} style={[styles.btn, styles.btnPrimary]}>
          <Text style={styles.btnPrimaryText}>Share summary</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 16, fontWeight: '900', color: '#111827', paddingHorizontal: 16, paddingTop: 8 },
  sub: { fontSize: 11, color: '#6b7280', paddingHorizontal: 16, marginTop: 4 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  card: { width: '48%', backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e5e7eb' },
  cardLabel: { fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 0.6, textTransform: 'uppercase' as any },
  cardValue: { fontSize: 14, fontWeight: '900', color: '#0a1f3f', marginTop: 4 },
  empty: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 24, lineHeight: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  txId: { fontSize: 12, fontWeight: '800', color: '#111827' },
  txMeta: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  txTotal: { fontSize: 13, fontWeight: '800', color: '#0a1f3f' },
  actions: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#0a1f3f' },
  btnPrimaryText: { color: '#fff', fontWeight: '800' },
  btnGhost: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  btnGhostText: { fontWeight: '700', color: '#374151' },
})
