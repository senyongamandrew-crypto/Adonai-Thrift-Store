import { useEffect } from 'react'
import syncEngine from '../store/syncEngine'

export function useSync() {
  useEffect(() => {
    syncEngine.start()
    return () => syncEngine.stop()
  }, [])
  return () => syncEngine.getStatus()
}
