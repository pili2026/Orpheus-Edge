/**
 * Data Store
 * 管理即時數據、日誌和寫入結果
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  DeviceData,
  LogEntry,
  DataMessage,
  WriteResultMessage,
  ParameterData,
  PrimitiveValue,
  LogType,
} from '@/types'

/** ===== 工具型別守衛（零 any） ===== */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isRecordOfParameterData(v: unknown): v is Record<string, ParameterData> {
  if (!isPlainObject(v)) return false
  for (const val of Object.values(v)) {
    if (!isPlainObject(val)) return false
    if (!('value' in val)) return false
  }
  return true
}

/**
 * 單設備資料守衛（結構型）：保證
 * - device_id: string
 * - data: Record<string, ParameterData>（非可選）
 * - timestamp 可有可無（我們會 fallback）
 */
type SingleDataShape = {
  device_id: string
  timestamp?: string
  data: Record<string, ParameterData>
}
function isSingleData(msg: unknown): msg is SingleDataShape {
  if (!isPlainObject(msg)) return false
  const did = (msg as Record<string, unknown>)['device_id']
  const data = (msg as Record<string, unknown>)['data']
  return isString(did) && isRecordOfParameterData(data)
}

/** 多設備資料守衛：devices 為 Record<string, Record<string, ParameterData>> */
type MultiDataMessage = {
  timestamp?: string
  devices: Record<string, Record<string, ParameterData>>
}
function isMultiData(msg: unknown): msg is MultiDataMessage {
  if (!isPlainObject(msg)) return false
  const devices = (msg as Record<string, unknown>)['devices']
  if (!isPlainObject(devices)) return false
  for (const v of Object.values(devices)) {
    if (!isRecordOfParameterData(v)) return false
  }
  return true
}

export const useDataStore = defineStore('data', () => {
  // ===== State =====
  const latestData = ref<Record<string, DeviceData>>({})
  const logs = ref<LogEntry[]>([])
  const maxLogs = ref<number>(200) // 最多保留 200 條日誌
  const deviceParameters = ref<Record<string, string[]>>({})

  // ===== Getters =====

  /** 獲取特定設備的最新數據 */
  const getDeviceData = computed(() => {
    return (deviceId: string): DeviceData | null => {
      return latestData.value[deviceId] || null
    }
  })

  /** 獲取所有設備的數據列表 */
  const allDeviceData = computed<DeviceData[]>(() => Object.values(latestData.value))

  /** 獲取最近的日誌 */
  const recentLogs = computed(() => {
    return (count: number = 50): LogEntry[] => logs.value.slice(-count)
  })

  /** 獲取不同類型的日誌數量 */
  const logStats = computed(() => {
    return {
      total: logs.value.length,
      info: logs.value.filter((l) => l.type === 'info').length,
      success: logs.value.filter((l) => l.type === 'success').length,
      warn: logs.value.filter((l) => l.type === 'warn').length,
      error: logs.value.filter((l) => l.type === 'error').length,
    }
  })

  // ===== Actions =====

  /** 更新設備數據（從 WebSocket 訊息） */
  const updateData = (message: DataMessage | MultiDataMessage): void => {
    const fallbackTs = new Date().toISOString()

    if (isSingleData(message)) {
      const timestamp = isString(message.timestamp) ? message.timestamp : fallbackTs
      const { device_id, data } = message // data 已被守衛保證不是 undefined
      latestData.value[device_id] = {
        deviceId: device_id,
        timestamp,
        data,
      }
      return
    }

    if (isMultiData(message)) {
      const timestamp = isString(message.timestamp) ? message.timestamp : fallbackTs
      // 明確斷言 entries 的 tuple 形狀，避免 value 被推成可能 undefined
      const entries = Object.entries(message.devices) as Array<
        [string, Record<string, ParameterData>]
      >
      for (const [devId, params] of entries) {
        latestData.value[devId] = {
          deviceId: devId,
          timestamp,
          data: params, // 這裡不會再是 Record | undefined 的聯集
        }
      }
    }
  }
  const setDeviceParameters = (deviceId: string, parameters: string[]): void => {
    deviceParameters.value[deviceId] = parameters
  }

  /** 處理寫入結果 */
  const handleWriteResult = (message: WriteResultMessage): void => {
    if (message.success) {
      addLog(
        `✓ 寫入成功: ${message.parameter} = ${message.value} (設備: ${message.device_id})`,
        'success',
      )
    } else {
      addLog(`✗ 寫入失敗: ${message.parameter} - ${message.message || 'Unknown error'}`, 'error')
    }
  }

  /** 產生 LogEntry ID */
  const makeLogId = (): string =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  /** 新增日誌 */
  const addLog = (message: string, type: LogType = 'info'): void => {
    const log: LogEntry = {
      id: makeLogId(),
      timestamp: new Date().toISOString(),
      message,
      type,
    }
    logs.value.push(log)
    if (logs.value.length > maxLogs.value) {
      logs.value = logs.value.slice(-maxLogs.value)
    }
  }

  /** 清除特定設備的數據 */
  const clearDeviceData = (deviceId: string): void => {
    delete latestData.value[deviceId]
    addLog(`已清除設備 ${deviceId} 的數據`, 'info')
  }

  /** 清除所有數據 */
  const clearAllData = (): void => {
    latestData.value = {}
    addLog('已清除所有數據', 'info')
  }

  /** 清除日誌 */
  const clearLogs = (): void => {
    logs.value = []
    addLog('日誌已清除', 'info')
  }

  /** 獲取特定設備的特定參數值 */
  const getParameterValue = (deviceId: string, paramName: string): PrimitiveValue | null => {
    const value = latestData.value[deviceId]?.data?.[paramName]?.value
    return value ?? null
  }

  /** 導出數據為 JSON */
  const exportDataAsJson = (): string => {
    return JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        devices: latestData.value,
        logs: logs.value,
      },
      null,
      2,
    )
  }

  /** 導出數據為 CSV */
  const exportDataAsCsv = (): string => {
    const rows: string[] = []
    rows.push('Device ID,Timestamp,Parameter,Value,Unit') // 標題
    Object.values(latestData.value).forEach((deviceData) => {
      Object.entries(deviceData.data).forEach(([paramName, paramData]) => {
        rows.push(
          `${deviceData.deviceId},${deviceData.timestamp},${paramName},${paramData.value},${paramData.unit || ''}`,
        )
      })
    })
    return rows.join('\n')
  }

  /** 重置所有狀態 */
  const $reset = (): void => {
    latestData.value = {}
    logs.value = []
  }

  return {
    // State
    latestData,
    logs,
    maxLogs,
    deviceParameters,
    setDeviceParameters,
    // Getters
    getDeviceData,
    allDeviceData,
    recentLogs,
    logStats,
    // Actions
    updateData,
    handleWriteResult,
    addLog,
    clearDeviceData,
    clearAllData,
    clearLogs,
    getParameterValue,
    exportDataAsJson,
    exportDataAsCsv,
    $reset,
  }
})
