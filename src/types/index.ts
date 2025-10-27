/**
 * 全域類型定義
 */

// ==================== 語言相關 ====================

export type Language = 'zh-TW' | 'en'

// ==================== 公用型別 ====================

/** 常見可序列化原始值 */
export type PrimitiveValue = number | boolean | string

// ==================== 設備相關 ====================

export interface Device {
  device_id: string
  model?: string
  port?: string
  slave_address?: number
  description?: string
  is_online?: boolean
}

export interface DeviceDetails extends Device {
  /** 建議用字典，方便以參數名稱快速索引（多處程式以 key 取值） */
  parameters?: Record<string, ParameterInfo>
  /** 若後端會回傳參數約束，讓前端可顯示/檢查 */
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
}

// ==================== 參數相關 ====================

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

// ==================== WebSocket 相關 ====================

export type ConnectionMode = 'single' | 'multiple'

export interface ConnectionConfig {
  deviceId: string
  interval?: number
  parameters?: string[]
  autoReconnect?: boolean
  /** ✅ 相容多設備/模式 */
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
  /** 有些舊碼用 action，有些用 command，兩者皆支援 */
  command?: string
  action?: string
  data?: T
  device_id?: string
}

/** ✅ 同時相容單裝置(data)與多裝置(devices)兩種形態 */
export interface DataMessage {
  device_id?: string
  timestamp: string
  data?: Record<string, ParameterData>
  devices?: Record<string, Record<string, ParameterData>>
}

/** ✅ 相容舊欄位 new_value / error */
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

// ==================== API 相關 ====================

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

// ==================== 日誌相關 ====================

/** ✅ 加入 'warning' 以相容既有用法 */
export type LogType = 'debug' | 'info' | 'success' | 'warn' | 'warning' | 'error'

export interface LogEntry {
  id: string
  type: LogType
  message: string
  timestamp: string
  details?: Record<string, unknown> | string
}

// ==================== 統計相關 ====================

export interface DataStatistics {
  min: number
  max: number
  avg: number
  count: number
  latest: number
}

// ==================== 其他 ====================

export interface TimeRange {
  start: string
  end: string
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'txt'
  timeRange?: TimeRange
  includeDetails?: boolean
}
