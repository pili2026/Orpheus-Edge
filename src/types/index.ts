/**
 * Global type definitions
 */

// ==================== Language ====================

export type Language = 'zh-TW' | 'en'

// ==================== Common Types ====================

/** Common serializable primitive values */
export type PrimitiveValue = number | boolean | string

// ==================== Device ====================

export interface Device {
  device_id: string
  model?: string
  port?: string
  slave_address?: number
  description?: string
  is_online?: boolean
}

export interface DeviceDetails extends Device {
  /** Recommended to use a dictionary for fast lookup by parameter name (used in multiple places via key access) */
  parameters?: Record<string, ParameterInfo>
  /** If the backend returns parameter constraints, the frontend can display/validate them */
  constraints?: Record<string, { min?: number; max?: number }>
  status?: string
  last_update?: string
}

export interface DeviceConfig {
  device_id: string
  polling_interval?: number
  parameters?: string[]
  auto_reconnect?: boolean
}

export interface DeviceData {
  deviceId: string
  timestamp: string
  data: Record<string, ParameterData>
  is_online?: boolean | null
}

// ==================== Parameter ====================

export interface ParameterInfo {
  name: string
  type: 'digital' | 'analog'
  address?: number
  description?: string
  unit?: string
  min?: number
  max?: number
  decimals?: number
}

export interface ParameterData {
  value: PrimitiveValue
  unit?: string
  timestamp?: string
  quality?: 'good' | 'bad' | 'uncertain'
}

export interface ReadParameterRequest {
  device_id: string
  parameters: string[]
}

export interface ReadParameterResponse {
  device_id: string
  parameters: Record<string, ParameterData>
  timestamp: string
}

export interface WriteParameterRequest {
  device_id: string
  parameter: string
  value: PrimitiveValue
}

export interface WriteParameterResponse {
  success: boolean
  device_id: string
  parameter: string
  value: PrimitiveValue
  message?: string
}

// ==================== WebSocket ====================

export type ConnectionMode = 'single' | 'multiple'

export interface ConnectionConfig {
  deviceId: string
  interval?: number
  parameters?: string[]
  autoReconnect?: boolean
  /** Compatible with multi-device / multi-mode */
  mode?: ConnectionMode
  deviceIds?: string[]
}

export interface WebSocketMessage<T = unknown> {
  type: string
  data?: T
  timestamp?: string
  device_id?: string
}

export interface WebSocketCommand<T = unknown> {
  /** Some legacy code uses `action`, others use `command`; both are supported */
  command?: string
  action?: string
  data?: T
  device_id?: string
}

/** Compatible with both single-device (data) and multi-device (devices) payloads */
export interface DataMessage {
  device_id?: string
  timestamp: string
  data?: Record<string, ParameterData>
  devices?: Record<string, Record<string, ParameterData>>
  is_online?: boolean
}

/** Compatible with legacy fields `new_value` / `error` */
export interface WriteResultMessage {
  success: boolean
  device_id: string
  parameter: string
  value: PrimitiveValue
  message?: string
  new_value?: PrimitiveValue
  error?: string
}

export interface Statistics {
  messages_sent: number
  messages_received: number
  connection_time?: string
  uptime?: number
}

// ==================== API ====================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface DeviceListResponse {
  devices: Device[]
  total: number
}

export interface ConnectivityResponse {
  device_id: string
  is_online: boolean
  last_seen?: string
}

export interface MonitoringStatusResponse {
  is_monitoring: boolean
  device_id?: string
  started_at?: string
  parameters?: string[]
}

// ==================== Logging ====================

/** Include 'warning' for compatibility with existing usage */
export type LogType = 'debug' | 'info' | 'success' | 'warn' | 'warning' | 'error'

export interface LogEntry {
  id: string
  type: LogType
  message: string
  timestamp: string
  details?: Record<string, unknown> | string
}

// ==================== Statistics ====================

export interface DataStatistics {
  min: number
  max: number
  avg: number
  count: number
  latest: number
}

// ==================== Others ====================

export interface TimeRange {
  start: string
  end: string
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'txt'
  timeRange?: TimeRange
  includeDetails?: boolean
}
