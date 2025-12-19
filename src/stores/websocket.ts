// src/stores/websocket.ts

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export interface DeviceSnapshot {
  device_id: string
  model: string
  slave_id?: number
  type: string
  is_online: boolean
  sampling_ts: string
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
  // 狀態
  const devices = ref<Map<string, TransformedDevice>>(new Map())
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const error = ref<string | null>(null)
  const lastMessage = ref<any>(null)

  // WebSocket 實例（全局單例）
  let ws: WebSocket | null = null
  let reconnectTimer: number | null = null
  let reconnectAttempts = 0
  const MAX_RECONNECT_ATTEMPTS = 5

  // Computed
  const deviceList = computed(() => Array.from(devices.value.values()))
  const totalDevices = computed(() => devices.value.size)
  const onlineCount = computed(() => deviceList.value.filter((d) => d.is_online).length)
  const offlineCount = computed(() => deviceList.value.filter((d) => !d.is_online).length)

  // 根據參數名稱推測單位
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

  // 轉換設備數據
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
      timestamp: raw.sampling_ts,
      data,
    }
  }

  // 連接 WebSocket
  const connect = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected')
      return
    }

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

          // 過濾 keepalive 消息
          if (message.type === 'keepalive') {
            console.log('[WebSocket] Received keepalive')
            return
          }

          // 過濾沒有 device_id 的消息
          if (!message.device_id) {
            console.log('[WebSocket] Received non-device message:', message.type)
            return
          }

          console.log('[WebSocket] Received snapshot:', message.device_id)

          // 轉換並存儲
          const transformed = transformSnapshot(message)
          devices.value.set(transformed.deviceId, transformed)
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err)
        }
      }

      ws.onerror = (err) => {
        console.error('[WebSocket] Error:', err)
        error.value = 'WebSocket 連接錯誤'
      }

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected')
        isConnected.value = false
        isConnecting.value = false

        // 自動重連
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++
          console.log(
            `[WebSocket] Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
          )

          reconnectTimer = window.setTimeout(() => {
            connect()
          }, 3000)
        } else {
          error.value = '無法連接到監控服務，請刷新頁面重試'
        }
      }
    } catch (err) {
      console.error('[WebSocket] Failed to create connection:', err)
      error.value = '建立 WebSocket 連接失敗'
      isConnecting.value = false
    }
  }

  // 斷開連接
  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (ws) {
      ws.close()
      ws = null
    }

    isConnected.value = false
    devices.value.clear()
  }

  // 獲取單個設備
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
