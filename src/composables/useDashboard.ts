import { storeToRefs } from 'pinia'
import { useWebSocketStore } from '@/stores/websocket'

export const useDashboard = () => {
  const store = useWebSocketStore()

  // Destructure refs from the store
  const {
    devices,
    isConnecting,
    error: connectionError,
    totalDevices,
    onlineCount,
    offlineCount,
  } = storeToRefs(store)

  console.log('[useDashboard] Initialized, devices:', devices.value.length)

  return {
    devices,
    isConnecting,
    connectionError,
    totalDevices,
    onlineCount,
    offlineCount,
  }
}
