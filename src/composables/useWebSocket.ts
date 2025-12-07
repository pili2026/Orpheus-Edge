/**
 * WebSocket Composable
 * Handles WebSocket connection, data reception, and device control.
 * Fully type-safe with no `any` types.
 *
 * Singleton pattern: all components share the same WebSocket state.
 */

import { ref } from 'vue'
import { useDataStore } from '@/stores/data'

// ===== WebSocket Message Type Definitions =====

/** Connection configuration */
interface ConnectionConfig {
  mode: 'single' | 'multiple'
  deviceId?: string
  deviceIds?: string[]
  interval: number
  parameters?: string[]
  autoReconnect?: boolean
}

/** Connection statistics */
interface ConnectionStats {
  messages_received: number
  messages_sent: number
  last_message_at?: string
}

/** Connection confirmation message */
interface WsConnectedMessage {
  type: 'connected'
  device_id?: string
  device_ids?: string[]
  parameters: string[]
  interval: number
  features?: {
    monitoring: boolean
    control: boolean
  }
}

/** Single-device data message */
interface WsSingleDeviceDataMessage {
  type: 'data'
  device_id: string
  timestamp: string
  data: Record<string, { value: number | string | boolean; unit?: string }>
}

/** Multi-device data message */
interface WsMultiDeviceDataMessage {
  type: 'data'
  timestamp: string
  devices: Record<string, Record<string, { value: number | string | boolean; unit?: string }>>
}

/** Write result message */
interface WsWriteResultMessage {
  type: 'write_result'
  device_id: string
  parameter: string
  value: number
  success: boolean
  previous_value?: number
  new_value?: number
  was_forced?: boolean
  message?: string
  timestamp?: string
}

/** Error message */
interface WsErrorMessage {
  type: 'error'
  message: string
  details?: string
  code?: string
}

/** Pong message */
interface WsPongMessage {
  type: 'pong'
  timestamp?: string
}

/** All possible WebSocket message types */
type WebSocketMessage =
  | WsConnectedMessage
  | WsSingleDeviceDataMessage
  | WsMultiDeviceDataMessage
  | WsWriteResultMessage
  | WsErrorMessage
  | WsPongMessage

/** Write command */
interface WriteCommand {
  action: 'write'
  parameter: string
  value: number
  force: boolean
}

/** Ping command */
interface PingCommand {
  action: 'ping'
}

// ===== Global State (Singleton) - Shared Across Components =====
const ws = ref<WebSocket | null>(null)
const isConnected = ref(false)
const isConnecting = ref(false)
const connectionConfig = ref<ConnectionConfig | null>(null)
const stats = ref<ConnectionStats>({
  messages_received: 0,
  messages_sent: 0,
})

let shouldPreventReconnect = false
// ===== Composable =====

export function useWebSocket() {
  const dataStore = useDataStore()

  // ===== WebSocket URL Builder =====
  const buildWebSocketUrl = (config: ConnectionConfig): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host || 'localhost:8000'
    const baseUrl = `${protocol}//${host}/api/monitoring`

    if (config.mode === 'single' && config.deviceId) {
      const params = new URLSearchParams()
      params.append('interval', config.interval.toString())
      if (config.parameters && config.parameters.length > 0) {
        params.append('parameters', config.parameters.join(','))
      }
      return `${baseUrl}/device/${config.deviceId}?${params.toString()}`
    }

    if (config.mode === 'multiple' && config.deviceIds) {
      const params = new URLSearchParams()
      params.append('device_ids', config.deviceIds.join(','))
      params.append('interval', config.interval.toString())
      if (config.parameters && config.parameters.length > 0) {
        params.append('parameters', config.parameters.join(','))
      }
      return `${baseUrl}/devices?${params.toString()}`
    }

    throw new Error('Invalid connection configuration')
  }

  // ===== Type Guards =====
  const isSingleDeviceDataMessage = (msg: WebSocketMessage): msg is WsSingleDeviceDataMessage => {
    return msg.type === 'data' && 'device_id' in msg
  }

  const isMultiDeviceDataMessage = (msg: WebSocketMessage): msg is WsMultiDeviceDataMessage => {
    return msg.type === 'data' && 'devices' in msg
  }

  const isWriteResultMessage = (msg: WebSocketMessage): msg is WsWriteResultMessage => {
    return msg.type === 'write_result'
  }

  const isErrorMessage = (msg: WebSocketMessage): msg is WsErrorMessage => {
    return msg.type === 'error'
  }

  const isConnectedMessage = (msg: WebSocketMessage): msg is WsConnectedMessage => {
    return msg.type === 'connected'
  }

  const isPongMessage = (msg: WebSocketMessage): msg is WsPongMessage => {
    return msg.type === 'pong'
  }

  // ===== Connect =====
  const connect = async (config: ConnectionConfig): Promise<void> => {
    if (isConnected.value) {
      await disconnect()
    }

    shouldPreventReconnect = false

    isConnecting.value = true

    try {
      const url = buildWebSocketUrl(config)
      console.log('[WebSocket] Connecting to:', url)

      ws.value = new WebSocket(url)

      // Connection opened
      ws.value.onopen = () => {
        console.log('[WebSocket] ✅ Connected')
        isConnected.value = true
        isConnecting.value = false
        connectionConfig.value = config
        dataStore.addLog('WebSocket connected successfully', 'success')
      }

      // Listen for incoming messages
      ws.value.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage
          console.log('[WebSocket] Received:', message)

          stats.value.messages_received++
          stats.value.last_message_at = new Date().toISOString()

          handleMessage(message)
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error)
        }
      }

      // Connection closed
      ws.value.onclose = (event: CloseEvent) => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason)
        isConnected.value = false
        isConnecting.value = false
        dataStore.addLog(`WebSocket connection closed (${event.code})`, 'warn')

        // Auto-reconnect
        if (config.autoReconnect && event.code !== 1000) {
          console.log('[WebSocket] Reconnecting in 3s...')
          setTimeout(() => {
            if (!isConnected.value && !shouldPreventReconnect) {
              connect(config)
            }
          }, 3000)
        }
      }

      // Connection error
      ws.value.onerror = (error: Event) => {
        console.error('[WebSocket] Error:', error)
        isConnecting.value = false
        dataStore.addLog('WebSocket connection error', 'error')
      }
    } catch (error) {
      isConnecting.value = false
      throw error
    }
  }

  // ===== Disconnect =====
  const disconnect = async (): Promise<void> => {
    if (ws.value) {
      ws.value.close(1000, 'Client disconnect')
      ws.value = null
    }
    isConnected.value = false
    connectionConfig.value = null
    dataStore.addLog('WebSocket connection disconnected', 'info')
  }

  // ===== Data Transformation Helper =====
  /**
   * Transform data: convert `unit: null` to `undefined` to match the ParameterData type.
   */
  const transformParameterData = (
    data: Record<string, { value: number | string | boolean; unit?: string }>,
  ): Record<string, { value: number | string | boolean; unit?: string }> => {
    const result: Record<string, { value: number | string | boolean; unit?: string }> = {}
    for (const [key, param] of Object.entries(data)) {
      result[key] = {
        value: param.value,
        ...(param.unit !== null && param.unit !== undefined ? { unit: param.unit } : {}),
      }
    }
    return result
  }

  const transformDevicesData = (
    devices: Record<string, Record<string, { value: number | string | boolean; unit?: string }>>,
  ): Record<string, Record<string, { value: number | string | boolean; unit?: string }>> => {
    const result: Record<
      string,
      Record<string, { value: number | string | boolean; unit?: string }>
    > = {}
    for (const [deviceId, data] of Object.entries(devices)) {
      result[deviceId] = transformParameterData(data)
    }
    return result
  }

  // ===== Handle Incoming Messages =====
  const handleMessage = (message: WebSocketMessage): void => {
    if (isConnectedMessage(message)) {
      console.log('[WebSocket] 📡 Connection confirmed:', message)
    } else if (isSingleDeviceDataMessage(message)) {
      // Single device data – transform before storing
      const transformedData = transformParameterData(message.data)
      console.log('[WebSocket] 📊 Storing device data:', message.device_id, transformedData)

      dataStore.updateData({
        device_id: message.device_id,
        timestamp: message.timestamp,
        data: transformedData,
      })
    } else if (isMultiDeviceDataMessage(message)) {
      // Multi-device data – transform before storing
      const transformedDevices = transformDevicesData(message.devices)
      console.log('[WebSocket] 📊 Storing multi-device data:', transformedDevices)

      dataStore.updateData({
        timestamp: message.timestamp,
        devices: transformedDevices,
      })
    } else if (isWriteResultMessage(message)) {
      dataStore.handleWriteResult(message)
    } else if (isErrorMessage(message)) {
      console.error('[WebSocket] Server error:', message.message)
      if (message.code === 'DEVICE_UNHEALTHY') {
        shouldPreventReconnect = true
        dataStore.addLog(`Device unhealthy: ${message.message}`, 'error')
      } else {
        dataStore.addLog(`Error: ${message.message}`, 'error')
      }
    } else if (isPongMessage(message)) {
      console.log('[WebSocket] 🏓 Pong received')
    } else {
      // Unknown message type
      console.warn('[WebSocket] Unknown message type:', message)
    }
  }

  // ===== Write Parameter (Device Control) =====
  /**
   * Write a parameter to a device.
   * @param parameter Parameter name
   * @param value Value to write
   * @param force Whether to force the write
   */
  const writeParameter = async (
    parameter: string,
    value: number,
    force: boolean = false,
  ): Promise<void> => {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    // Correct format: flat structure
    const message: WriteCommand = {
      action: 'write',
      parameter: parameter,
      value: value,
      force: force,
    }

    console.log('[WebSocket] 📤 Sending write command:', message)

    ws.value.send(JSON.stringify(message))
    stats.value.messages_sent++

    // Wait for the write_result response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Write timeout'))
      }, 5000)

      if (!ws.value) {
        clearTimeout(timeout)
        reject(new Error('WebSocket is not connected'))
        return
      }

      // Preserve the WebSocket reference to avoid null issues
      const websocket = ws.value
      const originalOnMessage = websocket.onmessage

      websocket.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data) as WebSocketMessage

          // Invoke the original handler first (using saved reference)
          if (originalOnMessage && websocket) {
            originalOnMessage.call(websocket, event)
          }

          // Check if this is the corresponding write_result
          if (isWriteResultMessage(msg) && msg.parameter === parameter) {
            clearTimeout(timeout)
            if (msg.success) {
              resolve()
            } else {
              reject(new Error(msg.message || 'Write failed'))
            }
          }
        } catch (error) {
          clearTimeout(timeout)
          reject(error)
        }
      }
    })
  }

  // ===== Ping =====
  const ping = (): void => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      const message: PingCommand = { action: 'ping' }
      ws.value.send(JSON.stringify(message))
      stats.value.messages_sent++
    }
  }

  return {
    // State
    ws,
    isConnected,
    isConnecting,
    connectionConfig,
    stats,

    // Methods
    connect,
    disconnect,
    writeParameter,
    ping,
  }
}
