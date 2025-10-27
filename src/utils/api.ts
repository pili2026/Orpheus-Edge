/**
 * API 工具函數
 * 自動適應不同的部署環境
 */

import config from './config'
import type { Device, DeviceConfig, MonitoringStatusResponse } from '@/types'

// 使用配置管理器取得 API 基礎 URL
const API_BASE = config.apiBaseUrl

/**
 * 取得所有可監控的設備
 */
export async function getDevices(): Promise<Device[]> {
  try {
    const url = `${API_BASE}/monitoring/devices`
    console.log('[API] Fetching devices from:', url)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    return data.devices || []
  } catch (error) {
    console.error('[API] Failed to fetch devices:', error)
    throw error
  }
}

/**
 * 取得設備配置
 */
export async function getDeviceConfig(deviceId: string): Promise<DeviceConfig> {
  try {
    const url = `${API_BASE}/devices/${deviceId}/config`
    console.log('[API] Fetching device config from:', url)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error(`[API] Failed to fetch config for ${deviceId}:`, error)
    throw error
  }
}

/**
 * 取得監控服務狀態
 */
export async function getMonitoringStatus(): Promise<MonitoringStatusResponse> {
  try {
    const url = `${API_BASE}/monitoring/status`
    console.log('[API] Fetching monitoring status from:', url)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error('[API] Failed to fetch monitoring status:', error)
    throw error
  }
}

/**
 * WebSocket 連接選項
 */
interface WebSocketOptions {
  deviceId?: string
  deviceIds?: string[]
  parameters?: string[]
  interval?: number
}

/**
 * 建立 WebSocket 連接
 * 自動使用當前 host 和正確的協議（ws/wss）
 */
export function createWebSocketConnection(options: WebSocketOptions): WebSocket {
  const { deviceId, deviceIds, parameters, interval = 1.0 } = options

  let path: string

  if (deviceId) {
    // 單設備連接
    path = `/api/monitoring/device/${deviceId}`
    const params = new URLSearchParams()
    if (parameters && parameters.length > 0) {
      params.append('parameters', parameters.join(','))
    }
    params.append('interval', interval.toString())
    path += `?${params.toString()}`
  } else if (deviceIds && deviceIds.length > 0) {
    // 多設備連接
    path = `/api/monitoring/devices`
    const params = new URLSearchParams()
    params.append('device_ids', deviceIds.join(','))
    params.append('interval', interval.toString())
    path += `?${params.toString()}`
  } else {
    throw new Error('Must provide either deviceId or deviceIds')
  }

  // 使用配置管理器建構 WebSocket URL
  const url = config.getWebSocketUrl(path)
  console.log('[WebSocket] Connecting to:', url)

  return new WebSocket(url)
}

/**
 * 發送寫入命令到 WebSocket
 */
export function sendWriteCommand(
  ws: WebSocket,
  parameter: string,
  value: number,
  force: boolean = false,
): boolean {
  if (ws.readyState !== WebSocket.OPEN) {
    console.error('[WebSocket] Connection is not open')
    return false
  }

  try {
    const command = {
      action: 'write',
      data: { parameter, value, force, sentAt: Date.now() }, // ✅ 統一 data，並加 sentAt
    }
    console.log('[WebSocket] Sending write command:', command)
    ws.send(JSON.stringify(command))
    return true
  } catch (error) {
    console.error('[WebSocket] Failed to send write command:', error)
    return false
  }
}

export function sendPing(ws: WebSocket): boolean {
  if (ws.readyState !== WebSocket.OPEN) {
    console.error('[WebSocket] Connection is not open')
    return false
  }

  try {
    const command = { action: 'ping', data: { sentAt: Date.now() } } // ✅ 統一 data，並加 sentAt
    console.log('[WebSocket] Sending ping')
    ws.send(JSON.stringify(command))
    return true
  } catch (error) {
    console.error('[WebSocket] Failed to send ping:', error)
    return false
  }
}

/**
 * WebSocket 連接狀態文字
 */
export function getWebSocketStateText(state: number): string {
  const states: Record<number, string> = {
    [WebSocket.CONNECTING]: '連接中',
    [WebSocket.OPEN]: '已連接',
    [WebSocket.CLOSING]: '關閉中',
    [WebSocket.CLOSED]: '已關閉',
  }
  return states[state] ?? '未知'
}

/**
 * 檢查 WebSocket 是否已連接
 */
export function isWebSocketConnected(ws: WebSocket | null): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN
}

/**
 * 安全關閉 WebSocket 連接
 */
export function closeWebSocket(ws: WebSocket | null): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    console.log('[WebSocket] Closing connection')
    ws.close()
  }
}

// 匯出配置管理器供其他模組使用
export { config }
