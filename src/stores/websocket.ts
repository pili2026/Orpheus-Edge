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
  const RECONNECT_BASE_DELAY_MS = 3000
  const RECONNECT_JITTER_RATIO = 0.25
  let isManualDisconnect = false
  let shouldPreventReconnect = false

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

  // Connect to WebSocket. Explicit (external) calls grant a fresh retry
  // budget; the internal auto-reconnect timer passes resetBudget = false so
  // its scheduled retries stay bounded by MAX_RECONNECT_ATTEMPTS.
  const connect = (resetBudget = true) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected')
      return
    }

    if (ws && ws.readyState === WebSocket.CONNECTING) {
      console.log('[WebSocket] Already connecting')
      return
    }

    if (resetBudget) {
      reconnectAttempts = 0
    }
    isManualDisconnect = false
    shouldPreventReconnect = false

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/api/monitoring/subscribe/dashboard`

    console.log('[WebSocket] Connecting to:', wsUrl)
    isConnecting.value = true
    error.value = null

    try {
      ws = new WebSocket(wsUrl)
      // Each callback below belongs to this specific socket. If disconnect()
      // or a fresh connect() has replaced `ws` by the time a callback fires,
      // the callback is stale and must not touch shared store state.
      const socket = ws

      socket.onopen = () => {
        if (socket !== ws) return
        console.log('[WebSocket] Connected')
        isConnected.value = true
        isConnecting.value = false
      }

      socket.onmessage = (event) => {
        if (socket !== ws) return

        try {
          const message = JSON.parse(event.data)
          lastMessage.value = message

          // Filter keepalive messages
          if (message.type === 'keepalive') {
            // The retry counter resets only on a recognized valid message
            // (keepalive or snapshot), not in onopen and not on arbitrary
            // frames: a connection that opens, or emits garbage, and then
            // closes has not proven itself, and resetting for it would
            // defeat the retry ceiling.
            reconnectAttempts = 0
            console.log('[WebSocket] Received keepalive')
            return
          }

          // Filter messages without device_id
          if (!message.device_id) {
            console.log('[WebSocket] Received non-device message:', message.type)
            return
          }

          reconnectAttempts = 0
          console.log('[WebSocket] Received snapshot:', message.device_id)

          // Transform and store
          const transformed = transformSnapshot(message)
          devices.value.set(transformed.deviceId, transformed)
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err)
        }
      }

      socket.onerror = (err) => {
        if (socket !== ws) return
        console.error('[WebSocket] Error:', err)
        error.value = 'WebSocket connection error'
      }

      socket.onclose = (event: CloseEvent) => {
        if (socket !== ws) return
        console.log('[WebSocket] Disconnected:', event.code, event.reason)
        isConnected.value = false
        isConnecting.value = false

        // 1013: the backend deliberately refuses the dashboard subscription
        // (WS_UNAVAILABLE, e.g. API running in standalone mode); 1000 is a
        // clean close. Neither should trigger a reconnect.
        if (!isManualDisconnect && (event.code === 1000 || event.code === 1013)) {
          shouldPreventReconnect = true
          if (event.code === 1013) {
            error.value =
              event.reason || 'Dashboard monitoring is unavailable in the current server mode'
          }
        }

        if (
          !isManualDisconnect &&
          !shouldPreventReconnect &&
          reconnectAttempts < MAX_RECONNECT_ATTEMPTS
        ) {
          reconnectAttempts++
          console.log(
            `[WebSocket] Auto-reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
          )

          // Jitter spreads reconnects out so multiple clients do not retry in
          // lockstep against a struggling backend.
          const jitter = (Math.random() * 2 - 1) * RECONNECT_JITTER_RATIO * RECONNECT_BASE_DELAY_MS
          reconnectTimer = window.setTimeout(
            () => {
              if (!isManualDisconnect && !shouldPreventReconnect) {
                connect(false)
              }
            },
            Math.round(RECONNECT_BASE_DELAY_MS + jitter),
          )
        } else if (isManualDisconnect) {
          console.log('[WebSocket] Manual disconnect, not reconnecting')
        } else if (shouldPreventReconnect) {
          console.log(
            '[WebSocket] Server refused or cleanly closed the connection, not reconnecting',
          )
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
