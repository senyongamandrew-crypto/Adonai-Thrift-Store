import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { usePOSStore } from '../store/posStore'

/**
 * Terminal registration — local-only. The web has a single PIN (7890);
 * this screen lets the phone remember cashier name + terminal id so
 * receipts read "Served by Sarah @ REGISTER-002".
 */
export default function RegisterScreen({ navigation }: any) {
  const [name, setName] = useState('')
  const [terminal, setTerminal] = useState(usePOSStore.getState().currentTerminal)
  const setTerminalStore = usePOSStore((s) => s.setTerminal)

  const save = () => {
    if (!name.trim()) return Alert.alert('Name required', 'Enter the cashier name for this shift.')
    if (!terminal.trim()) return Alert.alert('Terminal required', 'e.g. REGISTER-001')
    setTerminalStore(terminal.trim().toUpperCase())
    // store cashier locally by mutating currentUser if logged in
    const cur = usePOSStore.getState().currentUser
    if (cur) {
      usePOSStore.setState({ currentUser: { ...cur, name: name.trim(), terminalId: terminal.trim().toUpperCase() } as any })
    }
    Alert.alert('Terminal saved', `${name.trim()} @ ${terminal.trim().toUpperCase()} — you can now sign in.`)
    navigation.goBack()
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Register terminal</Text>
        <Text style={styles.hint}>Assign this phone to a till so receipts and shift reports are labelled correctly. No account is created on the server.</Text>

        <Text style={styles.label}>Cashier name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Sarah" style={styles.input} />

        <Text style={styles.label}>Terminal ID</Text>
        <TextInput value={terminal} onChangeText={setTerminal} placeholder="REGISTER-001" autoCapitalize="characters" style={styles.input} />

        <TouchableOpacity onPress={save} style={styles.btn}>
          <Text style={styles.btnText}>Save terminal</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.link}>
          <Text style={styles.linkText}>← Back to login</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f3f4f6', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e5e7eb' },
  title: { fontSize: 16, fontWeight: '800', color: '#111827' },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 16 },
  input: { marginTop: 6, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  btn: { marginTop: 20, backgroundColor: '#0a1f3f', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
  link: { marginTop: 14, alignItems: 'center' },
  linkText: { color: '#6b7280', fontWeight: '700', fontSize: 12 },
})
