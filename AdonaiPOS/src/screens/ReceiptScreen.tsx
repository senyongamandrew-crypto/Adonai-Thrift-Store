import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Share, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { Transaction } from '../types'
import { formatUGX, formatDateKampala } from '../utils/formatters'

export default function ReceiptScreen({ navigation, route }: any) {
  const transaction: Transaction | undefined = route?.params?.transaction

  if (!transaction) {
    return (
      <SafeAreaView style={styles.wrap}>
        <Text>No receipt data.</Text>
        <TouchableOpacity onPress={() => navigation.replace('POS')}>
          <Text>Back to POS</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const receiptHtml = buildReceiptHtml(transaction)

  const shareReceipt = async () => {
    try {
      const text = buildReceiptText(transaction)
      await Share.share({ message: text, title: `Receipt ${transaction.id}` })
    } catch {}
  }

  const printReceipt = async () => {
    try {
      await Print.printAsync({ html: receiptHtml })
    } catch (e: any) {
      Alert.alert('Print failed', e?.message ?? String(e))
    }
  }

  const savePdf = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: receiptHtml })
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri)
      else Alert.alert('Saved', uri)
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? String(e))
    }
  }

  return (
    <SafeAreaView style={styles.wrap} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>ADONAI THRIFT STORE</Text>
        <Text style={styles.sub}>Kampala  •  Thank you for shopping with us!</Text>

        <View style={styles.meta}>
          <Text style={styles.metaText}>Receipt {transaction.id}</Text>
          <Text style={styles.metaText}>{formatDateKampala(transaction.timestamp)}</Text>
          <Text style={styles.metaText}>
            {transaction.terminalId}  •  {transaction.cashierId}  •  {transaction.paymentMethod === 'mobile_money' ? 'Mobile Money' : 'Cash'}
          </Text>
          {transaction.mobileMoneyRef ? <Text style={styles.metaText}>Ref {transaction.mobileMoneyRef}</Text> : null}
          {!transaction.synced ? <Text style={[styles.metaText, styles.pending]}>⏳ Pending sync — will upload when online</Text> : null}
        </View>

        <View style={styles.divider} />

        {transaction.items.map((it) => (
          <View key={it.id} style={styles.line}>
            <Text style={styles.lineName} numberOfLines={1}>
              {it.name}
            </Text>
            <Text style={styles.lineQty}>×{it.cartQty}</Text>
            <Text style={styles.lineTotal}>{formatUGX(it.lineTotal)}</Text>
          </View>
        ))}

        <View style={styles.divider} />
        <Row label="Subtotal" value={formatUGX(transaction.subtotal)} />
        <Row label="VAT 18%" value={formatUGX(transaction.tax)} muted />
        {transaction.discount > 0 ? <Row label={`Discount${transaction.discountReason ? ` (${transaction.discountReason})` : ''}`} value={`−${formatUGX(transaction.discount)}`} highlight /> : null}
        <Row label="TOTAL" value={formatUGX(transaction.total)} bold large />
        <Row label="Tendered" value={formatUGX(transaction.amountTendered)} />
        <Row label="Change" value={formatUGX(transaction.change)} bold />

        <Text style={styles.foot}>Goods sold as seen. No refund on thrift items unless faulty. Keep this receipt.</Text>
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity onPress={shareReceipt} style={[styles.btn, styles.btnGhost]}>
          <Text style={styles.btnGhostText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={savePdf} style={[styles.btn, styles.btnGhost]}>
          <Text style={styles.btnGhostText}>Save PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={printReceipt} style={[styles.btn, styles.btnPrimary]}>
          <Text style={styles.btnPrimaryText}>Print</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => navigation.replace('POS')} style={styles.done}>
        <Text style={styles.doneText}>New sale →</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

function Row({ label, value, bold, large, muted, highlight }: any) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.bold, large && styles.large, muted && styles.muted, highlight && styles.highlight]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.bold, large && styles.large, highlight && styles.highlight]}>{value}</Text>
    </View>
  )
}

function buildReceiptHtml(t: Transaction): string {
  const lines = t.items.map((it) => `<tr><td>${esc(it.name)}</td><td style="text-align:center">×${it.cartQty}</td><td style="text-align:right">${formatUGX(it.lineTotal)}</td></tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:monospace;padding:24px;color:#111}
    h1{font-size:18px;margin:0} table{width:100%;border-collapse:collapse;margin-top:12px}
    td{padding:4px 0;font-size:12px} .tot{margin-top:12px;font-size:12px}
    .bold{font-weight:800} .large{font-size:15px}
  </style></head><body>
  <h1>ADONAI THRIFT STORE</h1><div>Kampala</div>
  <div style="margin-top:8px;font-size:11px;color:#555">Receipt ${esc(t.id)} — ${esc(formatDateKampala(t.timestamp))} — ${esc(t.terminalId)} / ${esc(t.cashierId)} — ${esc(t.paymentMethod)}</div>
  <table>${lines}</table>
  <div class="tot"><div>Subtotal ${esc(formatUGX(t.subtotal))} &nbsp; VAT ${esc(formatUGX(t.tax))}</div>
  ${t.discount ? `<div>Discount −${esc(formatUGX(t.discount))}${t.discountReason ? ` (${esc(t.discountReason)})` : ''}</div>` : ''}
  <div class="bold large" style="margin-top:8px">TOTAL ${esc(formatUGX(t.total))}</div>
  <div>Tendered ${esc(formatUGX(t.amountTendered))} &nbsp; Change ${esc(formatUGX(t.change))}</div></div>
  <div style="margin-top:16px;font-size:10px;color:#666">Goods sold as seen. No refund unless faulty.</div>
  </body></html>`
}

function buildReceiptText(t: Transaction): string {
  const lines = t.items.map((it) => `${it.name}  ×${it.cartQty}  ${formatUGX(it.lineTotal)}`).join('\n')
  return [
    'ADONAI THRIFT STORE — Kampala',
    `Receipt ${t.id}  ${formatDateKampala(t.timestamp)}`,
    `${t.terminalId} / ${t.cashierId} — ${t.paymentMethod}`,
    '---',
    lines,
    '---',
    `Subtotal ${formatUGX(t.subtotal)}  VAT ${formatUGX(t.tax)}`,
    t.discount ? `Discount −${formatUGX(t.discount)}${t.discountReason ? ` (${t.discountReason})` : ''}` : null,
    `TOTAL ${formatUGX(t.total)}`,
    `Tendered ${formatUGX(t.amountTendered)}  Change ${formatUGX(t.change)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  brand: { fontSize: 16, fontWeight: '900', color: '#0a1f3f', textAlign: 'center', letterSpacing: 1 },
  sub: { fontSize: 11, color: '#6b7280', textAlign: 'center', marginTop: 2 },
  meta: { marginTop: 14, alignItems: 'center', gap: 2 },
  metaText: { fontSize: 11, color: '#374151' },
  pending: { color: '#d97706', fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 14 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, gap: 8 },
  lineName: { flex: 1, fontSize: 12, color: '#111827' },
  lineQty: { fontSize: 12, color: '#6b7280' },
  lineTotal: { fontSize: 12, fontWeight: '700', color: '#111827', minWidth: 90, textAlign: 'right' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  rowLabel: { fontSize: 12, color: '#374151' },
  rowValue: { fontSize: 12, fontWeight: '700', color: '#111827' },
  bold: { fontWeight: '900' },
  large: { fontSize: 15 },
  muted: { color: '#6b7280' },
  highlight: { color: '#059669' },
  foot: { fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 16, lineHeight: 14 },
  actions: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#0a1f3f' },
  btnPrimaryText: { color: '#fff', fontWeight: '800' },
  btnGhost: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  btnGhostText: { fontWeight: '700', color: '#374151' },
  done: { backgroundColor: '#059669', margin: 12, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  doneText: { color: '#fff', fontWeight: '900' },
})
