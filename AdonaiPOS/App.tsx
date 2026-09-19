import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import LoginScreen from './src/screens/LoginScreen'
import RegisterScreen from './src/screens/RegisterScreen'
import POSScreen from './src/screens/POSScreen'
import PaymentScreen from './src/screens/PaymentScreen'
import ReceiptScreen from './src/screens/ReceiptScreen'
import ShiftSummaryScreen from './src/screens/ShiftSummaryScreen'
import ItemIntakeScreen from './src/screens/ItemIntakeScreen'
import { usePOSStore } from './src/store/posStore'
import { useSync } from './src/hooks/useSync'

const Stack = createNativeStackNavigator()

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: '#0a1f3f', secondary: '#059669' },
}

function Root() {
  const isAuthenticated = usePOSStore((s) => s.isAuthenticated)
  useSync()
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            {/* allow deep nav to POS when already authenticated via persist */}
            <Stack.Screen name="POS" component={POSScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="POS" component={POSScreen} />
            <Stack.Screen name="Payment" component={PaymentScreen} />
            <Stack.Screen name="Receipt" component={ReceiptScreen} />
            <Stack.Screen name="ShiftSummary" component={ShiftSummaryScreen} />
            <Stack.Screen name="Intake" component={ItemIntakeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={theme as any}>
        <StatusBar style="light" />
        <Root />
      </PaperProvider>
    </GestureHandlerRootView>
  )
}
