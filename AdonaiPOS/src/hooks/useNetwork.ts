import { useEffect } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { usePOSStore } from '../store/posStore'

export function useNetwork() {
  const { isOnline, setOnlineStatus } = usePOSStore()
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      setOnlineStatus(Boolean(state.isConnected))
    })
    return () => sub()
  }, [setOnlineStatus])
  return { isOnline }
}
