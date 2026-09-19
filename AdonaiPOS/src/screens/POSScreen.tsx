import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { usePOSStore } from '../store/posStore'
import { useBarcode } from '../hooks/useBarcode'
import OfflineIndicator from '../components/OfflineIndicator'
import CartLedger from '../components/CartLedger'
import QuickSelectTiles from '../components/QuickSelectTiles'
import BarcodeScanner from '../components/BarcodeScanner'

export default function POSScreen({ navigation }: any) {
  const [skuInput, setSkuInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [mode, setMode] = useState<'cart' | 'browse'>('cart')
  const cart = usePOSStore((s) => s.cart)
  const currentTerminal = usePOSStore((s) => s.currentTerminal)
  const currentUser = usePOSStore((s) => s.currentUser)
  const logout = usePOSStore((s) => s.logout)
  const { handleScanned } = useBarcode()

  const submitSku = async () => {
    const sku = skuInput.trim()
    if (!sku) return
    setSkuInput('')
    await handleScanned(sku)
  }

  const goPay = () => {
    if (cart.length === 0) return Alert.alert('Empty cart', 'Scan an item first.')
    navigation.navigate('Payment')
  }

  return (
    <SafeAreaView style={styles.wrap} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.term}>{currentTerminal}  •  {currentUser?.name ?? 'Till'}</Text>
          <Text style={styles.cartMeta}>{cart.length} item{cart.length !== 1 ? 's' : ''} in cart</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('Intake')} style={styles.hdrBtn}>
            <Text style={styles.hdrBtnText}>+ Intake</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('ShiftSummary')} style={styles.hdrBtnGhost}>
            <Text style={styles.hdrBtnGhostText}>Shift</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Alert.alert('Sign out?', 'Cart will be cleared.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => { logout(); navigation.replace('Login') } },
              ])
            }}
            style={styles.hdrBtnGhost}
          >
            <Text style={styles.hdrBtnGhostText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <OfflineIndicator />

      <View style={styles.searchRow}>
        <TextInput
          value={skuInput}
          onChangeText={setSkuInput}
          placeholder="Scan or type SKU…"
          style={styles.searchInput}
          onSubmitEditing={submitSku}
          returnKeyType="search"
          autoCapitalize="none"
        />
        <TouchableOpacity onPress={submitSku} style={styles.searchBtn}>
          <Text style={styles.searchBtnText}>Add</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setScanning(true)} style={styles.scanBtn}>
          <Text style={styles.scanBtnText}>Scan 📷</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => setMode('cart')} style={[styles.tab, mode === 'cart' && styles.tabActive]}>
          <Text style={[styles.tabText, mode === 'cart' && styles.tabTextActive]}>Cart</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode('browse')} style={[styles.tab, mode === 'browse' && styles.tabActive]}>
          <Text style={[styles.tabText, mode === 'browse' && styles.tabTextActive]}>Browse</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>{mode === 'cart' ? <CartLedger /> : <QuickSelectTiles />}</View>

      <View style={styles.footer}>
        <TouchableOpacity onPress={() => usePOSStore.getState().clearCart()} style={styles.clearBtn}>
          <Text style={styles.clearBtnText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goPay} style={[styles.payBtn, cart.length === 0 && styles.payBtnDisabled]} disabled={cart.length === 0}>
          <Text style={styles.payBtnText}>Pay  →</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onScanned={async (code) => {
            setScanning(false)
            await handleScanned(code)
          }}
        />
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#0a1f3f' },
  term: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' as any },
  cartMeta: { color: '#cbd5e1', fontSize: 11, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 6 },
  hdrBtn: { backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  hdrBtnText: { color: '#0a1f3f', fontWeight: '800', fontSize: 11 },
  hdrBtnGhost: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  hdrBtnGhostText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  searchRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#f9fafb', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  searchInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  searchBtn: { backgroundColor: '#0a1f3f', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '800' },
  scanBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' },
  scanBtnText: { fontWeight: '800', color: '#0a1f3f' },
  tabs: { flexDirection: 'row', padding: 8, gap: 8, backgroundColor: '#fff' },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  tabActive: { backgroundColor: '#0a1f3f', borderColor: '#0a1f3f' },
  tabText: { fontWeight: '700', fontSize: 13, color: '#6b7280' },
  tabTextActive: { color: '#fff' },
  body: { flex: 1, backgroundColor: '#fff' },
  footer: { flexDirection: 'row', padding: 12, gap: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  clearBtn: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  clearBtnText: { fontWeight: '700', color: '#374151' },
  payBtn: { flex: 1, backgroundColor: '#059669', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  payBtnDisabled: { backgroundColor: '#9ca3af' },
  payBtnText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },
})
