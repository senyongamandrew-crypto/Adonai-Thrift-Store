import React, { useState } from 'react'
import { Modal, View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native'
import { formatUGX } from '../utils/formatters'

interface Props {
  visible: boolean
  total: number
  onSelect: (input: { method: 'cash' | 'mobile_money'; amountTendered: number; mobileMoneyRef?: string }) => void
  onClose: () => void
}

export default function PaymentMethodModal({ visible, total, onSelect, onClose }: Props) {
  const [method, setMethod] = useState<'cash' | 'mobile_money'>('cash')
  const [amount, setAmount] = useState(String(total))
  const [phone, setPhone] = useState('')

  React.useEffect(() => {
    if (visible) setAmount(String(total))
  }, [visible, total])

  const tendered = Number(amount.replace(/[^0-9]/g, '') || '0')

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Payment</Text>
          <Text style={styles.total}>{formatUGX(total)}</Text>

          <View style={styles.tabs}>
            {(['cash', 'mobile_money'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMethod(m)}
                style={[styles.tab, method === m && styles.tabActive]}
              >
                <Text style={[styles.tabText, method === m && styles.tabTextActive]}>
                  {m === 'cash' ? 'Cash' : 'Mobile Money'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {method === 'cash' ? (
            <>
              <Text style={styles.label}>Amount tendered (UGX)</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                style={styles.input}
                placeholder="0"
              />
              <Text style={styles.change}>
                Change: {formatUGX(Math.max(0, tendered - total))}
                {tendered < total ? '  •  Insufficient' : ''}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.label}>Customer phone (MTN MoMo)</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                style={styles.input}
                placeholder="+256 7xx xxx xxx"
              />
              <Text style={styles.change}>A prompt will be sent to this number.</Text>
            </>
          )}

          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                onSelect({
                  method,
                  amountTendered: method === 'cash' ? tendered : total,
                  mobileMoneyRef: method === 'mobile_money' ? phone.trim() : undefined,
                })
              }
              style={[styles.btn, method === 'mobile_money' && !phone.trim() ? styles.btnDisabled : styles.btnPrimary]}
              disabled={method === 'mobile_money' && !phone.trim()}
            >
              <Text style={styles.btnPrimaryText}>{method === 'cash' ? 'Complete sale' : 'Request payment'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  total: { fontSize: 28, fontWeight: '900', color: '#0a1f3f', marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 16 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  tabActive: { backgroundColor: '#0a1f3f', borderColor: '#0a1f3f' },
  tabText: { fontWeight: '700', fontSize: 13, color: '#374151' },
  tabTextActive: { color: '#fff' },
  label: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 16 },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  change: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#0a1f3f' },
  btnDisabled: { backgroundColor: '#9ca3af' },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnGhost: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  btnGhostText: { fontWeight: '700', color: '#374151' },
})
