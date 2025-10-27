/**
 * WebSocket Store
 * 管理 WebSocket 連接狀態和通訊
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { websocketService } from '@/services/websocket'
import { useDataStore } from './data'
import type {
  ConnectionConfig,
  WebSocketMessage,
  WebSocketCommand,
  DataMessage,
  WriteResultMessage,
  Statistics,
  PrimitiveValue,
} from '@/types'

export const useWebSocketStore = defineStore('websocket', () => {
  /** ==== 型別輔助：把 Data/WriteResult 等與 WebSocketMessage 做交集，並加上固定的 type 值 ==== */
  type WSConnectedMessage = WebSocketMessage<{ device_ids?: string[]; message?: string }> & {
    type: 'connected'
  }

  type WSDataMessage = WebSocketMessage<unknown> &
    DataMessage & {
      type: 'data'
    }

  type WSWriteResultMessage = WebSocketMessage<unknown> &
    WriteResultMessage & {
      type: 'write_result'
    }

  type WSErrorMessage = WebSocketMessage<{ message?: string }> & {
    type: 'error'
  }

  // ===== State =====
  const isConnected = ref<boolean>(false)
  const isConnecting = ref<boolean>(false)
  const connectionConfig = ref<ConnectionConfig | null>(null)

  const messageCount = ref<number>(0) // 收到的消息數（當作 messages_received）
  const sentCount = ref<number>(0)
  const errorCount = ref<number>(0)

  const connectionError = ref<string | null>(null)

  // 供外部直接讀取目前設備與最後一則訊息（修正組件取用）
  const deviceId = ref<string>('') // 單設備 ID（若是 multiple，視需求改成陣列或保留第一個）
  const lastMessage = ref<WebSocketMessage<unknown> | null>(null)

  // ===== Getters =====
  const stats = computed<Statistics>(() => ({
    messages_sent: sentCount.value,
    messages_received: messageCount.value,
    connection_time: undefined,
    uptime: undefined,
  }))

  // ===== Actions =====

  /**
   * 連接到 WebSocket（單設備或多設備）
   */
  const connect = async (config: ConnectionConfig): Promise<void> => {
    if (isConnected.value) {
      throw new Error('Already connected. Disconnect first.')
    }

    isConnecting.value = true
    connectionError.value = null

    try {
      // 設置事件處理器
      websocketService.onOpen = handleOpen
      websocketService.onClose = handleClose
      websocketService.onError = handleError
      websocketService.onMessage = handleMessage

      // 連接
      await websocketService.connect(config)

      // 保存配置
      connectionConfig.value = config
      deviceId.value = config.deviceId ?? '' // 供組件直接讀取
      isConnected.value = true
    } catch (e: unknown) {
      const errMsg = (e as { message?: string })?.message ?? 'Connection failed'
      connectionError.value = errMsg
      throw e
    } finally {
      isConnecting.value = false
    }
  }

  /**
   * 中斷 WebSocket 連接
   */
  const disconnect = async (): Promise<void> => {
    try {
      websocketService.disconnect()
      isConnected.value = false
      connectionConfig.value = null
      connectionError.value = null
      lastMessage.value = null
      deviceId.value = ''
    } catch (e) {
      console.error('Disconnect error:', e)
      throw e
    }
  }

  // 寫入參數
  const writeParameter = async (
    parameter: string,
    value: PrimitiveValue,
    force: boolean = false,
  ): Promise<void> => {
    if (!isConnected.value) throw new Error('WebSocket not connected')
    try {
      websocketService.send({
        action: 'write',
        data: { parameter, value, force, sentAt: Date.now() },
      } satisfies WebSocketCommand<{
        parameter: string
        value: PrimitiveValue
        force: boolean
        sentAt: number
      }>)
      sentCount.value++
    } catch (e) {
      errorCount.value++
      throw e
    }
  }

  // 發送 Ping
  const sendPing = (): void => {
    if (!isConnected.value) throw new Error('WebSocket not connected')
    try {
      websocketService.send({
        action: 'ping',
        data: { sentAt: Date.now() },
      } satisfies WebSocketCommand<{ sentAt: number }>)
      sentCount.value++
    } catch (e) {
      errorCount.value++
      throw e
    }
  }

  /**
   * 重置所有狀態
   */
  const $reset = (): void => {
    // 先中斷連接
    if (isConnected.value) {
      websocketService.disconnect()
    }

    // 重置所有狀態
    isConnected.value = false
    isConnecting.value = false
    connectionConfig.value = null

    messageCount.value = 0
    sentCount.value = 0
    errorCount.value = 0

    connectionError.value = null
    lastMessage.value = null
    deviceId.value = ''
  }

  /** ==== 型別守衛 ==== */
  function isConnectedMsg(msg: WebSocketMessage<unknown>): msg is WSConnectedMessage {
    return msg.type === 'connected'
  }

  function isDataMsg(msg: WebSocketMessage<unknown>): msg is WSDataMessage {
    // 同時檢查 discriminant 與 payload 形狀
    return (
      msg.type === 'data' &&
      typeof (msg as { timestamp?: unknown }).timestamp === 'string' &&
      typeof (msg as { device_id?: unknown }).device_id === 'string' && // 必要：DataMessage 的 device_id
      (typeof (msg as { data?: unknown }).data === 'object' ||
        typeof (msg as { devices?: unknown }).devices === 'object')
    )
  }

  function isWriteResultMsg(msg: WebSocketMessage<unknown>): msg is WSWriteResultMessage {
    return (
      msg.type === 'write_result' &&
      typeof (msg as { device_id?: unknown }).device_id === 'string' &&
      typeof (msg as { parameter?: unknown }).parameter === 'string' &&
      (typeof (msg as { value?: unknown }).value === 'number' ||
        typeof (msg as { value?: unknown }).value === 'string' ||
        typeof (msg as { value?: unknown }).value === 'boolean')
    )
  }

  function isErrorMsg(msg: WebSocketMessage<unknown>): msg is WSErrorMessage {
    return msg.type === 'error'
  }

  // ===== Event Handlers =====

  const handleOpen = (): void => {
    const dataStore = useDataStore()
    dataStore.addLog('WebSocket 連接成功', 'success')
  }

  const handleClose = (): void => {
    isConnected.value = false
    const dataStore = useDataStore()
    dataStore.addLog('WebSocket 連接已關閉', 'warn') // ← 'warning' 改成 'warn'
  }

  const handleError = (): void => {
    errorCount.value++
    connectionError.value = 'WebSocket 連接錯誤'
    const dataStore = useDataStore()
    dataStore.addLog('WebSocket 錯誤', 'error')
  }

  const handleMessage = (data: WebSocketMessage<unknown>): void => {
    messageCount.value++
    lastMessage.value = data
    const dataStore = useDataStore()

    if (isConnectedMsg(data)) {
      const text = data.data?.device_ids?.length
        ? data.data.device_ids.join(', ')
        : (data.device_id ?? deviceId.value)
      dataStore.addLog(`已連接設備: ${text}`, 'success')
      return
    }

    if (isDataMsg(data)) {
      dataStore.updateData(data) // data 已縮窄成 WSDataMessage (兼容 data/devices)
      return
    }

    if (isWriteResultMsg(data)) {
      dataStore.handleWriteResult(data)
      return
    }

    if (data.type === 'pong') {
      dataStore.addLog('收到 Pong 響應', 'info')
      return
    }

    if (isErrorMsg(data)) {
      errorCount.value++
      const msg = (data as WSErrorMessage).data?.message ?? 'Unknown error'
      dataStore.addLog(`錯誤: ${msg}`, 'error')
      return
    }

    console.warn('Unknown message type:', data.type)
  }

  return {
    // State
    isConnected,
    isConnecting,
    connectionConfig,
    messageCount,
    sentCount,
    errorCount,
    connectionError,
    deviceId,
    lastMessage,

    // Getters
    stats,

    // Actions
    connect,
    disconnect,
    writeParameter,
    sendPing,
    $reset,
  }
})
