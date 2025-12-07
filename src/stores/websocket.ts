/**
 * WebSocket Store
 * Manages WebSocket connection state and communication
 */

import { ElMessage } from 'element-plus'
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
  /** ==== Type Helpers ==== */
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

  type WSErrorMessage = WebSocketMessage<{ message?: string; code?: string }> & {
    type: 'error'
  }

  // ===== State =====
  const isConnected = ref<boolean>(false)
  const isConnecting = ref<boolean>(false)
  const connectionConfig = ref<ConnectionConfig | null>(null)

  const messageCount = ref<number>(0)
  const sentCount = ref<number>(0)
  const errorCount = ref<number>(0)

  const connectionError = ref<string | null>(null)

  const deviceId = ref<string>('')
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
   * Connect to WebSocket (single or multiple devices)
   */
  const connect = async (config: ConnectionConfig): Promise<void> => {
    if (isConnected.value) {
      throw new Error('Already connected. Disconnect first.')
    }

    isConnecting.value = true
    connectionError.value = null

    try {
      // Set event handlers
      websocketService.onOpen = handleOpen
      websocketService.onClose = handleClose
      websocketService.onError = handleError
      websocketService.onMessage = handleMessage

      // Connect
      await websocketService.connect(config)

      // Save configuration
      connectionConfig.value = config
      deviceId.value = config.deviceId ?? ''
      // Note: do not set isConnected = true here
      // Wait until the "connected" message is received
    } catch (e: unknown) {
      const errMsg = (e as { message?: string })?.message ?? 'Connection failed'
      connectionError.value = errMsg
      isConnecting.value = false // Reset connecting state on failure
      throw e
    }
  }

  /**
   * Disconnect WebSocket
   */
  const disconnect = async (): Promise<void> => {
    try {
      websocketService.disconnect()
      isConnected.value = false
      isConnecting.value = false // Reset connecting state
      connectionConfig.value = null
      connectionError.value = null
      lastMessage.value = null
      deviceId.value = ''
    } catch (e) {
      console.error('Disconnect error:', e)
      throw e
    }
  }

  // Write Parameter
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

  // Send Ping
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
   * Reset all state
   */
  const $reset = (): void => {
    if (isConnected.value) {
      websocketService.disconnect()
    }

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

  /** ==== Type Guards ==== */
  function isConnectedMsg(msg: WebSocketMessage<unknown>): msg is WSConnectedMessage {
    return msg.type === 'connected'
  }

  function isDataMsg(msg: WebSocketMessage<unknown>): msg is WSDataMessage {
    return (
      msg.type === 'data' &&
      typeof (msg as { timestamp?: unknown }).timestamp === 'string' &&
      typeof (msg as { device_id?: unknown }).device_id === 'string' &&
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
    dataStore.addLog('WebSocket connected, testing device...', 'info')
  }

  const handleClose = (): void => {
    isConnected.value = false
    isConnecting.value = false // Reset connecting state
    const dataStore = useDataStore()
    dataStore.addLog('WebSocket connection closed', 'warn')
  }

  const handleError = (): void => {
    errorCount.value++
    isConnecting.value = false // Reset state when a connection error occurs
    connectionError.value = 'WebSocket connection error'
    const dataStore = useDataStore()
    dataStore.addLog('WebSocket error', 'error')
  }

  const handleMessage = (data: WebSocketMessage<unknown>): void => {
    messageCount.value++
    lastMessage.value = data
    const dataStore = useDataStore()

    // Change: only mark as connected when a "connected" message is received
    if (isConnectedMsg(data)) {
      const text = data.data?.device_ids?.length
        ? data.data.device_ids.join(', ')
        : (data.device_id ?? deviceId.value)

      // Mark connection as successful
      isConnected.value = true
      isConnecting.value = false

      // Show success message
      ElMessage.success('Device connected successfully')
      dataStore.addLog(`✓ Connected to device(s): ${text}`, 'success')
      return
    }

    if (isDataMsg(data)) {
      dataStore.updateData(data)
      return
    }

    if (isWriteResultMsg(data)) {
      dataStore.handleWriteResult(data)
      return
    }

    if (data.type === 'pong') {
      dataStore.addLog('Received Pong response', 'info')
      return
    }

    // Error handling
    if (isErrorMsg(data)) {
      const msg = data.data?.message ?? 'Unknown error'
      const code = data.data?.code

      // Critical errors -> disconnect
      if (
        code === 'CONNECTION_FAILED' ||
        code === 'CONNECTION_LOST' ||
        code === 'CONNECTION_ERROR' ||
        code === 'TOO_MANY_ERRORS' ||
        code === 'DEVICE_UNHEALTHY'
      ) {
        ElMessage.error(
          code === 'DEVICE_UNHEALTHY'
            ? `Device is offline or unhealthy: ${msg}`
            : `Device connection failed: ${msg}`,
        )
        dataStore.addLog(`✗ Critical error [${code}]: ${msg}`, 'error')

        // Prevent automatic reconnection
        websocketService.preventReconnection()

        disconnect()
        return
      }

      // Normal errors
      dataStore.addLog(`Error: ${msg}`, 'error')
      errorCount.value++
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
