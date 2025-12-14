/**
 * API Utility Functions
 * Automatically adapts to different deployment environments
 */

import config from './config'
import type { Device, DeviceConfig, MonitoringStatusResponse } from '@/types'

// Get API base URL from configuration manager
const API_BASE = config.apiBaseUrl

/**
 * Fetch all monitorable devices
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
 * Fetch device configuration
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
 * Fetch monitoring service status
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
 * WebSocket connection options
 */
interface WebSocketOptions {
  deviceId?: string
  deviceIds?: string[]
  parameters?: string[]
  interval?: number
}

/**
 * Create WebSocket connection
 * Automatically uses the current host and correct protocol (ws / wss)
 */
export function createWebSocketConnection(options: WebSocketOptions): WebSocket {
  const { deviceId, deviceIds, parameters, interval = 1.0 } = options

  let path: string

  if (deviceId) {
    // Single-device connection
    path = `/api/monitoring/device/${deviceId}`
    const params = new URLSearchParams()
    if (parameters && parameters.length > 0) {
      params.append('parameters', parameters.join(','))
    }
    params.append('interval', interval.toString())
    path += `?${params.toString()}`
  } else if (deviceIds && deviceIds.length > 0) {
    // Multi-device connection
    path = `/api/monitoring/devices`
    const params = new URLSearchParams()
    params.append('device_ids', deviceIds.join(','))
    params.append('interval', interval.toString())
    path += `?${params.toString()}`
  } else {
    throw new Error('Must provide either deviceId or deviceIds')
  }

  // Build WebSocket URL using configuration manager
  const url = config.getWebSocketUrl(path)
  console.log('[WebSocket] Connecting to:', url)

  return new WebSocket(url)
}

/**
 * Send write command via WebSocket
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
      data: { parameter, value, force, sentAt: Date.now() }, // Unified data payload with sentAt timestamp
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
    const command = { action: 'ping', data: { sentAt: Date.now() } } // Unified data payload with sentAt timestamp
    console.log('[WebSocket] Sending ping')
    ws.send(JSON.stringify(command))
    return true
  } catch (error) {
    console.error('[WebSocket] Failed to send ping:', error)
    return false
  }
}

/**
 * WebSocket connection state text
 */
export function getWebSocketStateText(state: number): string {
  const states: Record<number, string> = {
    [WebSocket.CONNECTING]: 'Connecting',
    [WebSocket.OPEN]: 'Connected',
    [WebSocket.CLOSING]: 'Closing',
    [WebSocket.CLOSED]: 'Closed',
  }
  return states[state] ?? 'Unknown'
}

/**
 * Check whether WebSocket is connected
 */
export function isWebSocketConnected(ws: WebSocket | null): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN
}

/**
 * Safely close WebSocket connection
 */
export function closeWebSocket(ws: WebSocket | null): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    console.log('[WebSocket] Closing connection')
    ws.close()
  }
}

// Export configuration manager for other modules
export { config }
