/**
 * Thermal printer helper — stubbed.
 * Wire to a Bluetooth ESC/POS printer (e.g. 58mm) via
 * `react-native-bluetooth-classic` or `expo-print` + `react-native-esc-pos`.
 * Search by name `Printer-...` and send receiptHtml via ESC/POS.
 */
import * as Print from 'expo-print'

export async function printReceiptHtml(html: string) {
  // Fallback to system print dialog; replace with bluetooth raw send when you have a printer MAC
  await Print.printAsync({ html })
}

export async function isPrinterAvailable(): Promise<boolean> {
  // TODO: Bluetooth discovery
  return false
}
