import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { usePOSStore } from '../store/posStore'
import apiClient from '../services/api'

export default function LoginScreen({ navigation }: any) {
  const [pin, setPin] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const login = usePOSStore((s) => s.login)
  const setInventoryCache = usePOSStore((s) => s.setInventoryCache)

  const handleLogin = async () => {
    const p = pin.trim()
    if (!p) return Alert.alert('Enter PIN', 'The shop PIN is required (default 7890).')
    setLoading(true)
    try {
      const res: any = await apiClient.login(phone.trim() || p, p)
      login({
        id: res.user?.id ?? 'owner',
        name: res.user?.name ?? 'Shop owner',
        phone: res.user?.phone ?? phone.trim() ?? '',
        role: (res.user?.role as any) ?? 'admin',
        pin: p,
      })
      // warm catalogue so quick-select works immediately
      try {
        const catalog: any = await apiClient.fetchPosCatalog(true)
        const items = (catalog.items ?? catalog.products ?? []) as any[]
        if (Array.isArray(items)) {
          // normalize loosely — posStore syncEngine also normalizes
          setInventoryCache(
            items.map((r: any) => ({
              id: String(r.id),
              sku: String(r.sku ?? r.id),
              name: String(r.name),
              price: Number(r.unitPrice ?? r.price ?? 0),
              cost: Number(r.cost ?? r.costPrice ?? 0),
              quantity: Number(r.quantity ?? r.stockQuantity ?? 0),
              category: String(r.category ?? 'General'),
              image: r.image ?? r.gallery?.[0],
              gallery: r.gallery,
              images: r.images,
              available: r.available !== false,
              lastUpdated: Date.now(),
            })) as any
          )
        }
      } catch {}
      navigation.replace('POS')
    } catch (e: any) {
      Alert.alert('Login failed', e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message ?? 'Check PIN and network.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.brand}>Adonai</Text>
        <Text style={styles.brandSub}>THRIFT STORE  •  POS</Text>
        <Text style={styles.title}>Till login</Text>
        <Text style={styles.hint}>Use the shop PIN from the website admin (default 7890). Phone is optional.</Text>

        <Text style={styles.label}>Phone (optional)</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="+256 7xx xxx xxx"
          keyboardType="phone-pad"
          style={styles.input}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Shop PIN</Text>
        <TextInput
          value={pin}
          onChangeText={setPin}
          placeholder="7890"
          keyboardType="numeric"
          secureTextEntry
          style={styles.input}
          onSubmitEditing={handleLogin}
          returnKeyType="go"
        />

        <TouchableOpacity onPress={handleLogin} style={[styles.btn, loading && styles.btnDisabled]} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign in to till</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.link}>
          <Text style={styles.linkText}>Register terminal →</Text>
        </TouchableOpacity>

        <Text style={styles.foot}>Backend: {(process.env.EXPO_PUBLIC_API_URL as any) || 'https://adonai-thrift-store-hqg3.onrender.com'}</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a1f3f', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20 },
  brand: { fontSize: 22, fontWeight: '900', color: '#0a1f3f', letterSpacing: 1 },
  brandSub: { fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 2, marginTop: 2 },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', marginTop: 18 },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 16 },
  input: { marginTop: 6, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  btn: { marginTop: 20, backgroundColor: '#0a1f3f', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  link: { marginTop: 14, alignItems: 'center' },
  linkText: { color: '#0a1f3f', fontWeight: '700', fontSize: 12 },
  foot: { marginTop: 14, fontSize: 10, color: '#9ca3af', textAlign: 'center' },
})
