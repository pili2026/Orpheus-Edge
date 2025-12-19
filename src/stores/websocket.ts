// src/stores/websocket.ts

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export interface DeviceSnapshot {
  device_id: string
  model: string
  slave_id?: number
  type: string
  is_online: boolean
  sampling_datetime: string
  values: Record<string, number>
  port?: string
}

export interface TransformedDevice {
  deviceId: string
  displayName: string
  model: string
  type: string
  slaveId?: number
  port?: string
  is_online: boolean
  timestamp: string
  data: Record<string, { value: number; unit: string; label: string }>
}

export const useWebSocketStore = defineStore('websocket', () => {
  // State
  const devices = ref<Map<string, TransformedDevice>>(new Map())
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const error = ref<string | null>(null)
  const lastMessage = ref<any>(null)

  // WebSocket instance (global singleton)
  let ws: WebSocket | null = null
  let reconnectTimer: number | null = null
  let reconnectAttempts = 0
  const MAX_RECONNECT_ATTEMPTS = 5
  let isManualDisconnect = false

  // Computed
  const deviceList = computed(() => Array.from(devices.value.values()))
  const totalDevices = computed(() => devices.value.size)
  const onlineCount = computed(() => deviceList.value.filter((d) => d.is_online).length)
  const offlineCount = computed(() => deviceList.value.filter((d) => !d.is_online).length)

  // Infer unit from parameter name
  const getUnitForParam = (paramName: string): string => {
    const upperName = paramName.toUpperCase()

    if (upperName.includes('VOLTAGE') || upperName === 'V') return 'V'
    if (upperName.includes('CURRENT') || upperName === 'I') return 'A'
    if (upperName.includes('KW') && !upperName.includes('KWH')) return 'kW'
    if (upperName.includes('KWH')) return 'kWh'
    if (upperName.includes('HZ') || upperName.includes('FREQ')) return 'Hz'
    if (upperName.includes('TEMP')) return '°C'
    if (upperName.includes('RPM')) return 'RPM'
    if (upperName.includes('PERCENT') || upperName === '%') return '%'

    return ''
  }

  // Transform device snapshot data
  const transformSnapshot = (raw: DeviceSnapshot): TransformedDevice => {
    const data: Record<string, { value: number; unit: string; label: string }> = {}

    if (raw.values) {
      Object.entries(raw.values).forEach(([key, value]) => {
        data[key] = {
          value,
          label: key,
          unit: getUnitForParam(key),
        }
      })
    }

    return {
      deviceId: raw.device_id,
      displayName: `${raw.model}_${raw.slave_id || ''}`,
      model: raw.model,
      type: raw.type,
      slaveId: raw.slave_id,
      port: raw.port,
      is_online: raw.is_online,
      timestamp: raw.sampling_datetime,
      data,
    }
  }

  // Connect to WebSocket
  const connect = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected')
      return
    }

    if (ws && ws.readyState === WebSocket.CONNECTING) {
      console.log('[WebSocket] Already connecting')
      return
    }

    isManualDisconnect = false

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/api/monitoring/subscribe/dashboard`

    console.log('[WebSocket] Connecting to:', wsUrl)
    isConnecting.value = true
    error.value = null

    try {
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('[WebSocket] Connected')
        isConnected.value = true
        isConnecting.value = false
        reconnectAttempts = 0
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          lastMessage.value = message

          // Filter keepalive messages
          if (message.type === 'keepalive') {
            console.log('[WebSocket] Received keepalive')
            return
          }

          // Filter messages without device_id
          if (!message.device_id) {
            console.log('[WebSocket] Received non-device message:', message.type)
            return
          }

          console.log('[WebSocket] Received snapshot:', message.device_id)

          // Transform and store
          const transformed = transformSnapshot(message)
          devices.value.set(transformed.deviceId, transformed)
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err)
        }
      }

      ws.onerror = (err) => {
        console.error('[WebSocket] Error:', err)
        error.value = 'WebSocket connection error'
      }

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected')
        isConnected.value = false
        isConnecting.value = false

        if (!isManualDisconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++
          console.log(
            `[WebSocket] Auto-reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
          )

          reconnectTimer = window.setTimeout(() => {
            if (!isManualDisconnect) {
              connect()
            }
          }, 3000)
        } else if (isManualDisconnect) {
          console.log('[WebSocket] Manual disconnect, not reconnecting')
        } else {
          console.error('[WebSocket] Max reconnection attempts reached')
          error.value = 'Unable to connect to monitoring service, please refresh the page'
        }
      }
    } catch (err) {
      console.error('[WebSocket] Failed to create connection:', err)
      error.value = 'Failed to establish WebSocket connection'
      isConnecting.value = false
    }
  }

  // Disconnect from WebSocket
  const disconnect = () => {
    console.log('[WebSocket] Disconnecting manually')
    isManualDisconnect = true

    // 清除重連計時器
    if (reconnectTimer) {
      console.log('[WebSocket] Clearing reconnect timer')
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    // 關閉連接
    if (ws) {
      ws.close()
      ws = null
    }

    isConnected.value = false
    devices.value.clear()
  }

  // Get single device
  const getDevice = (deviceId: string) => {
    return devices.value.get(deviceId)
  }

  return {
    // State
    devices: deviceList,
    isConnected,
    isConnecting,
    error,
    lastMessage,
    totalDevices,
    onlineCount,
    offlineCount,

    // Actions
    connect,
    disconnect,
    getDevice,
  }
})
