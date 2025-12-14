/**
 * Data Store
 * Manages real-time data, logs, and write results
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

/** ===== Utility type guards (zero any) ===== */
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
 * Single-device data guard (structural): guarantees
 * - device_id: string
 * - data: Record<string, ParameterData> (non-optional)
 * - timestamp may be present or absent (we will fallback)
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

/** Multi-device data guard: devices is Record<string, Record<string, ParameterData>> */
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
  const maxLogs = ref<number>(200) // Keep up to 200 log entries
  const deviceParameters = ref<Record<string, string[]>>({})

  // ===== Getters =====

  /** Get latest data for a specific device */
  const getDeviceData = computed(() => {
    return (deviceId: string): DeviceData | null => {
      return latestData.value[deviceId] || null
    }
  })

  /** Get data list of all devices */
  const allDeviceData = computed<DeviceData[]>(() => Object.values(latestData.value))

  /** Get recent logs */
  const recentLogs = computed(() => {
    return (count: number = 50): LogEntry[] => logs.value.slice(-count)
  })

  /** Get log counts by type */
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

  /** Update device data (from WebSocket message) */
  const updateData = (message: DataMessage | MultiDataMessage): void => {
    const fallbackTs = new Date().toISOString()

    if (isSingleData(message)) {
      const timestamp = isString(message.timestamp) ? message.timestamp : fallbackTs
      const { device_id, data } = message // guarded: data is guaranteed non-undefined
      latestData.value[device_id] = {
        deviceId: device_id,
        timestamp,
        data,
      }
      return
    }

    if (isMultiData(message)) {
      const timestamp = isString(message.timestamp) ? message.timestamp : fallbackTs
      // Explicitly assert the tuple shape of entries to avoid value being inferred as possibly undefined
      const entries = Object.entries(message.devices) as Array<
        [string, Record<string, ParameterData>]
      >
      for (const [devId, params] of entries) {
        latestData.value[devId] = {
          deviceId: devId,
          timestamp,
          data: params, // no longer a Record | undefined union here
        }
      }
    }
  }
  const setDeviceParameters = (deviceId: string, parameters: string[]): void => {
    deviceParameters.value[deviceId] = parameters
  }

  /** Handle write result */
  const handleWriteResult = (message: WriteResultMessage): void => {
    if (message.success) {
      addLog(
        `✓ Write succeeded: ${message.parameter} = ${message.value} (Device: ${message.device_id})`,
        'success',
      )
    } else {
      addLog(
        `✗ Write failed: ${message.parameter} - ${message.message || 'Unknown error'}`,
        'error',
      )
    }
  }

  /** Generate LogEntry ID */
  const makeLogId = (): string =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  /** Add a log entry */
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

  /** Clear data for a specific device */
  const clearDeviceData = (deviceId: string): void => {
    delete latestData.value[deviceId]
    addLog(`Cleared data for device ${deviceId}`, 'info')
  }

  /** Clear all data */
  const clearAllData = (): void => {
    latestData.value = {}
    addLog('Cleared all data', 'info')
  }

  /** Clear logs */
  const clearLogs = (): void => {
    logs.value = []
    addLog('Logs cleared', 'info')
  }

  /** Get a specific parameter value for a device */
  const getParameterValue = (deviceId: string, paramName: string): PrimitiveValue | null => {
    const value = latestData.value[deviceId]?.data?.[paramName]?.value
    return value ?? null
  }

  /** Export data as JSON */
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

  /** Export data as CSV */
  const exportDataAsCsv = (): string => {
    const rows: string[] = []
    rows.push('Device ID,Timestamp,Parameter,Value,Unit') // Header
    Object.values(latestData.value).forEach((deviceData) => {
      Object.entries(deviceData.data).forEach(([paramName, paramData]) => {
        rows.push(
          `${deviceData.deviceId},${deviceData.timestamp},${paramName},${paramData.value},${paramData.unit || ''}`,
        )
      })
    })
    return rows.join('\n')
  }

  /** Reset all state */
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
