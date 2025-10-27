/**
 * WebSocket Composable
 * 處理 WebSocket 連接、數據接收和設備控制
 * 完全類型安全，無 any 類型
 *
 * ✅ 單例模式：所有組件共享同一個 WebSocket 狀態
 */

import { ref } from 'vue'
import { useDataStore } from '@/stores/data'

// ===== WebSocket 訊息類型定義 =====

/** 連接配置 */
interface ConnectionConfig {
  mode: 'single' | 'multiple'
  deviceId?: string
  deviceIds?: string[]
  interval: number
  parameters?: string[]
  autoReconnect?: boolean
}

/** 連接統計 */
interface ConnectionStats {
  messages_received: number
  messages_sent: number
  last_message_at?: string
}

/** 連接確認訊息 */
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

/** 單設備數據訊息 */
interface WsSingleDeviceDataMessage {
  type: 'data'
  device_id: string
  timestamp: string
  data: Record<string, { value: number | string | boolean; unit?: string }>
}

/** 多設備數據訊息 */
interface WsMultiDeviceDataMessage {
  type: 'data'
  timestamp: string
  devices: Record<string, Record<string, { value: number | string | boolean; unit?: string }>>
}

/** 寫入結果訊息 */
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

/** 錯誤訊息 */
interface WsErrorMessage {
  type: 'error'
  message: string
  details?: string
}

/** Pong 訊息 */
interface WsPongMessage {
  type: 'pong'
  timestamp?: string
}

/** 所有可能的 WebSocket 訊息類型 */
type WebSocketMessage =
  | WsConnectedMessage
  | WsSingleDeviceDataMessage
  | WsMultiDeviceDataMessage
  | WsWriteResultMessage
  | WsErrorMessage
  | WsPongMessage

/** 寫入命令 */
interface WriteCommand {
  action: 'write'
  parameter: string
  value: number
  force: boolean
}

/** Ping 命令 */
interface PingCommand {
  action: 'ping'
}

// ===== ✅ 全局狀態（單例）- 所有組件共享 =====
const ws = ref<WebSocket | null>(null)
const isConnected = ref(false)
const isConnecting = ref(false)
const connectionConfig = ref<ConnectionConfig | null>(null)
const stats = ref<ConnectionStats>({
  messages_received: 0,
  messages_sent: 0,
})

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
        dataStore.addLog('WebSocket 連接成功', 'success')
      }

      // Listen for messages
      ws.value.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage
          console.log('[WebSocket] 📥 Received:', message)

          stats.value.messages_received++
          stats.value.last_message_at = new Date().toISOString()

          handleMessage(message)
        } catch (error) {
          const err = error as Error
          console.error('[WebSocket] Failed to parse message:', err)
        }
      }

      // Connection closed
      ws.value.onclose = (event: CloseEvent) => {
        console.log('[WebSocket] ❌ Disconnected:', event.code, event.reason)
        isConnected.value = false
        isConnecting.value = false
        dataStore.addLog(`WebSocket 連接已關閉 (${event.code})`, 'warn')

        // Auto reconnect
        if (config.autoReconnect && event.code !== 1000) {
          console.log('[WebSocket] 🔄 Reconnecting in 3s...')
          setTimeout(() => {
            if (!isConnected.value) {
              connect(config)
            }
          }, 3000)
        }
      }

      // Connection error
      ws.value.onerror = (error: Event) => {
        console.error('[WebSocket] ⚠️ Error:', error)
        isConnecting.value = false
        dataStore.addLog('WebSocket 連接錯誤', 'error')
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
    dataStore.addLog('已中斷 WebSocket 連接', 'info')
  }

  // ===== Data Transformation Helper =====
  /**
   * 轉換數據：將 unit: null 轉為 undefined，確保符合 ParameterData 類型
   */
  const transformParameterData = (
    data: Record<string, { value: number | string | boolean; unit?: string }>,
  ): Record<string, { value: number | string | boolean; unit?: string }> => {
    const result: Record<string, { value: number | string | boolean; unit?: string }> = {}
    for (const [key, param] of Object.entries(data)) {
      result[key] = {
        value: param.value,
        // 如果 unit 是 null，轉為 undefined
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
      // 單設備數據 - 轉換後再存入
      const transformedData = transformParameterData(message.data)
      console.log('[WebSocket] 📊 Storing device data:', message.device_id, transformedData)

      dataStore.updateData({
        device_id: message.device_id,
        timestamp: message.timestamp,
        data: transformedData,
      })
    } else if (isMultiDeviceDataMessage(message)) {
      // 多設備數據 - 轉換後再存入
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
      dataStore.addLog(`錯誤: ${message.message}`, 'error')
    } else if (isPongMessage(message)) {
      console.log('[WebSocket] 🏓 Pong received')
    } else {
      // 未知訊息類型
      console.warn('[WebSocket] Unknown message type:', message)
    }
  }

  // ===== Write Parameter (Device Control) =====
  /**
   * 寫入參數到設備
   * @param parameter 參數名稱
   * @param value 要寫入的值
   * @param force 是否強制寫入
   */
  const writeParameter = async (
    parameter: string,
    value: number,
    force: boolean = false,
  ): Promise<void> => {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未連接')
    }

    // ✅ 正確格式：扁平結構
    const message: WriteCommand = {
      action: 'write',
      parameter: parameter,
      value: value,
      force: force,
    }

    console.log('[WebSocket] 📤 Sending write command:', message)

    ws.value.send(JSON.stringify(message))
    stats.value.messages_sent++

    // 等待 write_result 回應
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('寫入超時'))
      }, 5000)

      if (!ws.value) {
        clearTimeout(timeout)
        reject(new Error('WebSocket 未連接'))
        return
      }

      // ✅ 保存 WebSocket 引用，避免 null 問題
      const websocket = ws.value
      const originalOnMessage = websocket.onmessage

      websocket.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data) as WebSocketMessage

          // ✅ 先調用原本的 handler（使用保存的引用）
          if (originalOnMessage && websocket) {
            originalOnMessage.call(websocket, event)
          }

          // 檢查是否為對應的 write_result
          if (isWriteResultMessage(msg) && msg.parameter === parameter) {
            clearTimeout(timeout)
            if (msg.success) {
              resolve()
            } else {
              reject(new Error(msg.message || '寫入失敗'))
            }
          }
        } catch (error) {
          clearTimeout(timeout)
          const err = error as Error
          reject(err)
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
