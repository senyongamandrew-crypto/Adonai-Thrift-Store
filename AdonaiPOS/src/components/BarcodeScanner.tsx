import React, { useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'

interface Props {
  onScanned: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onScanned, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [locked, setLocked] = React.useState(false)

  useEffect(() => {
    if (!permission?.granted) requestPermission()
  }, [permission?.granted])

  if (!permission) return <View style={styles.wrap} />
  if (!permission.granted) {
    return (
      <View style={[styles.wrap, styles.center]}>
        <Text style={styles.hint}>Camera access needed to scan barcodes.</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.btn}>
          <Text style={styles.btnText}>Grant camera permission</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={[styles.btn, styles.btnGhost]}>
          <Text style={styles.btnGhostText}>Close</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={(res) => {
          if (locked) return
          const code = res.data?.trim()
          if (!code) return
          setLocked(true)
          onScanned(code)
          setTimeout(() => setLocked(false), 1200)
        }}
      />
      <View style={styles.reticleOuter}>
        <View style={styles.reticle} />
        <Text style={styles.hint}>Align the barcode inside the frame</Text>
      </View>
      <TouchableOpacity onPress={onClose} style={styles.close}>
        <Text style={styles.closeText}>✕  Close</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#0a1f3f' },
  hint: { color: '#fff', marginTop: 12, fontSize: 13, textAlign: 'center' },
  reticleOuter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  reticle: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  btn: { marginTop: 16, backgroundColor: '#fff', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  btnText: { color: '#0a1f3f', fontWeight: '700' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#fff' },
  btnGhostText: { color: '#fff', fontWeight: '700' },
  close: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  closeText: { color: '#fff', fontWeight: '700' },
})
