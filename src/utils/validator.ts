/**
 * 驗證工具函數
 */

export interface ValidationResult {
  valid: boolean
  error?: string
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function isNonEmptyString(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0
}

/**
 * 驗證數值是否在範圍內
 */
export function validateRange(
  value: number,
  min: number,
  max: number,
  paramName: string = '數值',
): ValidationResult {
  if (!isFiniteNumber(value)) {
    return { valid: false, error: `${paramName} 必須是有效的數字` }
  }
  if (value < min || value > max) {
    return { valid: false, error: `${paramName} 必須在 ${min} 到 ${max} 之間 (目前: ${value})` }
  }
  return { valid: true }
}

/**
 * 驗證設備 ID 格式
 */
export function validateDeviceId(deviceId: string): ValidationResult {
  if (!isNonEmptyString(deviceId)) {
    return { valid: false, error: '設備 ID 不能為空' }
  }
  const pattern = /^[A-Za-z0-9_-]+$/
  if (!pattern.test(deviceId)) {
    return { valid: false, error: '設備 ID 格式不正確 (只能包含字母、數字、底線和連字號)' }
  }
  return { valid: true }
}

/**
 * 驗證參數名稱
 */
export function validateParameterName(parameter: string): ValidationResult {
  if (!isNonEmptyString(parameter)) {
    return { valid: false, error: '參數名稱不能為空' }
  }
  // 例如: DOut01, DIn01
  const pattern = /^[A-Za-z][A-Za-z0-9_]*$/
  if (!pattern.test(parameter)) {
    return {
      valid: false,
      error: '參數名稱格式不正確 (必須以字母開頭，只能包含字母、數字和底線)',
    }
  }
  return { valid: true }
}

/**
 * 驗證輪詢間隔
 */
export function validateInterval(interval: number): ValidationResult {
  if (!isFiniteNumber(interval)) {
    return { valid: false, error: '輪詢間隔必須是有效的數字' }
  }
  if (interval <= 0) {
    return { valid: false, error: '輪詢間隔必須大於 0' }
  }
  if (interval < 0.1) {
    return { valid: false, error: '輪詢間隔不能小於 0.1 秒' }
  }
  if (interval > 3600) {
    return { valid: false, error: '輪詢間隔不能超過 3600 秒 (1 小時)' }
  }
  return { valid: true }
}

/**
 * 驗證寫入值 (通用)
 */
export function validateWriteValue(value: number): ValidationResult {
  if (!isFiniteNumber(value)) {
    return { valid: false, error: '寫入值必須是有效的數字' }
  }
  return { valid: true }
}

/**
 * 驗證數位輸出值 (0 或 1)
 */
export function validateDigitalOutput(value: number): ValidationResult {
  const result = validateWriteValue(value)
  if (!result.valid) return result
  if (value !== 0 && value !== 1) {
    return { valid: false, error: '數位輸出值必須是 0 或 1' }
  }
  return { valid: true }
}

/**
 * 驗證類比輸出值 (通常 0-10V 或 4-20mA)
 */
export function validateAnalogOutput(
  value: number,
  min: number = 0,
  max: number = 10,
): ValidationResult {
  return validateRange(value, min, max, '類比輸出值')
}

/**
 * 驗證 IP 位址
 */
export function validateIPAddress(ip: string): ValidationResult {
  if (!isNonEmptyString(ip)) {
    return { valid: false, error: 'IP 位址不能為空' }
  }
  const pattern = /^(\d{1,3}\.){3}\d{1,3}$/
  if (!pattern.test(ip)) {
    return { valid: false, error: 'IP 位址格式不正確' }
  }
  const parts = ip.split('.')
  for (const part of parts) {
    const num = Number(part)
    if (!Number.isInteger(num) || num < 0 || num > 255) {
      return { valid: false, error: 'IP 位址的每個部分必須在 0-255 之間' }
    }
  }
  return { valid: true }
}

/**
 * 驗證連接埠
 */
export function validatePort(port: number): ValidationResult {
  if (!isFiniteNumber(port)) {
    return { valid: false, error: '連接埠必須是有效的數字' }
  }
  if (!Number.isInteger(port)) {
    return { valid: false, error: '連接埠必須是整數' }
  }
  if (port < 1 || port > 65535) {
    return { valid: false, error: '連接埠必須在 1-65535 之間' }
  }
  return { valid: true }
}

/**
 * 驗證 Modbus 從站位址
 */
export function validateSlaveAddress(address: number): ValidationResult {
  if (!isFiniteNumber(address)) {
    return { valid: false, error: '從站位址必須是有效的數字' }
  }
  if (!Number.isInteger(address)) {
    return { valid: false, error: '從站位址必須是整數' }
  }
  if (address < 1 || address > 247) {
    return { valid: false, error: '從站位址必須在 1-247 之間' }
  }
  return { valid: true }
}

/**
 * 驗證暫存器位址
 */
export function validateRegisterAddress(address: number): ValidationResult {
  if (!isFiniteNumber(address)) {
    return { valid: false, error: '暫存器位址必須是有效的數字' }
  }
  if (!Number.isInteger(address)) {
    return { valid: false, error: '暫存器位址必須是整數' }
  }
  if (address < 0 || address > 65535) {
    return { valid: false, error: '暫存器位址必須在 0-65535 之間' }
  }
  return { valid: true }
}

/**
 * 驗證陣列不為空
 */
export function validateNotEmpty<T>(array: T[], fieldName: string = '陣列'): ValidationResult {
  if (!Array.isArray(array) || array.length === 0) {
    return { valid: false, error: `${fieldName} 不能為空` }
  }
  return { valid: true }
}

/**
 * 驗證 WebSocket 連接狀態
 * 使用 Set<number> 避免 includes 的窄化型別限制
 */
export function validateWebSocketState(state: number): ValidationResult {
  const validStates = new Set<number>([
    WebSocket.CONNECTING,
    WebSocket.OPEN,
    WebSocket.CLOSING,
    WebSocket.CLOSED,
  ])
  if (!validStates.has(state)) {
    return { valid: false, error: 'WebSocket 狀態無效' }
  }
  return { valid: true }
}

/**
 * 批次驗證
 */
export function validateAll(validations: ValidationResult[]): ValidationResult {
  const errors = validations.filter((v) => !v.valid).map((v) => v.error)
  if (errors.length > 0) {
    return { valid: false, error: errors.filter(Boolean).join('; ') }
  }
  return { valid: true }
}

/**
 * 驗證物件包含必要欄位（零 any）
 */
export function validateRequiredFields(
  obj: Record<string, unknown>,
  requiredFields: readonly string[],
): ValidationResult {
  const missingFields = requiredFields.filter((field) => !(field in obj))
  if (missingFields.length > 0) {
    return { valid: false, error: `缺少必要欄位: ${missingFields.join(', ')}` }
  }
  return { valid: true }
}

export default {
  validateRange,
  validateDeviceId,
  validateParameterName,
  validateInterval,
  validateWriteValue,
  validateDigitalOutput,
  validateAnalogOutput,
  validateIPAddress,
  validatePort,
  validateSlaveAddress,
  validateRegisterAddress,
  validateNotEmpty,
  validateWebSocketState,
  validateAll,
  validateRequiredFields,
}
