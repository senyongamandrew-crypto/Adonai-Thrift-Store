# Adonai POS — Mobile Companion for Adonai Thrift Store

Production-ready Android POS app (Expo + React Native + Zustand) that syncs with your existing Adonai Thrift Store backend at `https://adonai-thrift-store-hqg3.onrender.com`.

> Your website stays the source of truth. The phone is the till.

---

## 0. Prerequisites

```bash
node --version   # >=18 (22 recommended, 16+ works)
npm --version
java -version    # JDK 17 for latest Android builds
# Android Studio + SDK or Expo Go on phone
npm i -g expo-cli eas-cli
```

## 1. Install & Run (Expo — fastest)

```bash
cd AdonaiPOS
npm install
# point at your backend (or keep the default Render URL)
# create .env if you need to override:
# echo "EXPO_PUBLIC_API_URL=https://adonai-thrift-store-hqg3.onrender.com" > .env

npx expo start
# scan QR with Expo Go (Android) / Camera (iOS)
```

**No Expo? Bare React Native:**

```bash
npx react-native init AdonaiPOS --template react-native-template-typescript
# then copy src/ into it and npm install
```

## 2. Backend Wiring

`src/services/api.ts` reads:

```
EXPO_PUBLIC_API_URL || app.json.extra.apiUrl || https://adonai-thrift-store-hqg3.onrender.com
```

Auth:

- `POST /api/pos/admin/session` with `{ pin }` → `{ token }`
- Subsequent writes send `x-adonai-admin-session: <token>`  (fallback `x-adonai-pin: 7890`)
- Uses `POST /api/pos/catalog` (retry-safe UPSERT), `GET /api/pos/catalog`, `GET /api/catalog`, `POST /api/orders`, `POST /api/media/upload`

Default PIN `7890` (change `ADMIN_PIN` on Render → Environment).

## 3. Project Structure

```
src/
  screens/ LoginScreen, RegisterScreen (POS), PaymentScreen, ReceiptScreen, ShiftSummaryScreen, ItemIntakeScreen
  components/ BarcodeScanner, CartLedger, QuickSelectTiles, PaymentMethodModal, OfflineIndicator, MultiAngleCapture
  store/ posStore (Zustand + AsyncStorage), syncEngine (offline queue)
  services/ api (axios + retry + token), inventory, printer, payment
  hooks/ useBarcode, useNetwork, useSync
  types/ index (InventoryItem, CartItem, Transaction, User, PendingSync)
  utils/ validators, formatters
```

## 4. Core Flows

- **Login** → `POST /api/pos/admin/session` → persist `adonai:authToken` → download `GET /api/pos/catalog` → cache.
- **Scan / Quick-select** → `useBarcode` validates SKU/ID/size, checks `quantity>0`, adds to Zustand `cart` (dedup).
- **Cart** → `recalculateTotals()` (18% VAT Uganda, configurable), discount reason tracked.
- **Payment** → `cash` or `mobile_money` (MTN MoMo) → `POST /api/orders` if online else queued in `pendingTransactions` → `Receipt`.
- **Offline** → NetInfo gates `syncEngine`. Every 30s it `POST /transactions/batch` + `GET /inventory/sync?since=…`. Conflicts (409) surface in UI.
- **Intake** (phone → website): `ItemIntakeScreen` captures 4 angles (`front|back|texture|label`) with expo-camera + client-side canvas compression (1600px, 0.78 JPEG) → `POST /api/pos/intake` (strict: exactly one `isPrimary:true` + `front` tag). First upload auto-primary.

## 5. Build APK

```bash
npm i -g eas-cli
eas login
# preview APK on your phone without Play Store
eas build --platform android --profile preview
# production APK/AAB
eas build --platform android --profile production
# or local
npx expo prebuild && cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Install: `adb install app-release.apk` or send the `eas` link via WhatsApp.

## 6. Env

| Variable | Default | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://adonai-thrift-store-hqg3.onrender.com` | Backend base |
| `EXPO_PUBLIC_TAX_RATE` | `0.18` | VAT |
| `EXPO_PUBLIC_TERMINAL_ID` | `REGISTER-001` | Default till name |

## 7. Next

- Bluetooth thermal printer: `src/services/printer.ts` → `expo-print` + `react-native-bluetooth-classic` (search `00:11:...`, ESC/POS).
- Shift summary: `X`/`Z` reports from `pendingTransactions` + `GET /api/orders?status=open`.
- Deep link: `adonai-pos://scan?sku=...`.

Questions? Check `src/services/api.ts` header comments and `DEPLOYMENT.md` in the web repo.

