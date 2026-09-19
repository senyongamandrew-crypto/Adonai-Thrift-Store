import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { usePOSStore } from '../store/posStore'

export default function OfflineIndicator() {
  const isOnline = usePOSStore((s) => s.isOnline)
  const syncStatus = usePOSStore((s) => s.syncStatus)
  const syncError = usePOSStore((s) => s.syncError)
  const pending = usePOSStore((s) => s.pendingTransactions.length)

  if (isOnline && syncStatus !== 'error') {
    if (pending > 0)
      return (
        <View style={[styles.bar, styles.syncing]}>
          <Text style={styles.text}>Syncing {pending} transaction{pending > 1 ? 's' : ''}…</Text>
        </View>
      )
    return null
  }

  return (
    <View style={[styles.bar, syncStatus === 'error' ? styles.error : styles.offline]}>
      <Text style={styles.text}>
        {!isOnline ? 'Offline — sales will sync when back online' : syncError ?? 'Sync error — will retry'}
        {pending > 0 ? `  •  ${pending} pending` : ''}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
  offline: { backgroundColor: '#f59e0b' },
  syncing: { backgroundColor: '#2563eb' },
  error: { backgroundColor: '#dc2626' },
  text: { color: '#fff', fontSize: 12, fontWeight: '600' },
})
