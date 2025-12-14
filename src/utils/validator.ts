/**
 * Validation utility functions
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
 * Validate whether a numeric value is within a range
 */
export function validateRange(
  value: number,
  min: number,
  max: number,
  paramName: string = 'Value',
): ValidationResult {
  if (!isFiniteNumber(value)) {
    return { valid: false, error: `${paramName} must be a valid number` }
  }
  if (value < min || value > max) {
    return {
      valid: false,
      error: `${paramName} must be between ${min} and ${max} (current: ${value})`,
    }
  }
  return { valid: true }
}

/**
 * Validate device ID format
 */
export function validateDeviceId(deviceId: string): ValidationResult {
  if (!isNonEmptyString(deviceId)) {
    return { valid: false, error: 'Device ID cannot be empty' }
  }
  const pattern = /^[A-Za-z0-9_-]+$/
  if (!pattern.test(deviceId)) {
    return {
      valid: false,
      error: 'Invalid Device ID format (only letters, numbers, underscore, and hyphen are allowed)',
    }
  }
  return { valid: true }
}

/**
 * Validate parameter name
 */
export function validateParameterName(parameter: string): ValidationResult {
  if (!isNonEmptyString(parameter)) {
    return { valid: false, error: 'Parameter name cannot be empty' }
  }
  // e.g. DOut01, DIn01
  const pattern = /^[A-Za-z][A-Za-z0-9_]*$/
  if (!pattern.test(parameter)) {
    return {
      valid: false,
      error:
        'Invalid parameter name format (must start with a letter, and can only contain letters, numbers, and underscores)',
    }
  }
  return { valid: true }
}

/**
 * Validate polling interval
 */
export function validateInterval(interval: number): ValidationResult {
  if (!isFiniteNumber(interval)) {
    return { valid: false, error: 'Polling interval must be a valid number' }
  }
  if (interval <= 0) {
    return { valid: false, error: 'Polling interval must be greater than 0' }
  }
  if (interval < 0.1) {
    return { valid: false, error: 'Polling interval cannot be less than 0.1 seconds' }
  }
  if (interval > 3600) {
    return { valid: false, error: 'Polling interval cannot exceed 3600 seconds (1 hour)' }
  }
  return { valid: true }
}

/**
 * Validate write value (generic)
 */
export function validateWriteValue(value: number): ValidationResult {
  if (!isFiniteNumber(value)) {
    return { valid: false, error: 'Write value must be a valid number' }
  }
  return { valid: true }
}

/**
 * Validate digital output value (0 or 1)
 */
export function validateDigitalOutput(value: number): ValidationResult {
  const result = validateWriteValue(value)
  if (!result.valid) return result
  if (value !== 0 && value !== 1) {
    return { valid: false, error: 'Digital output value must be 0 or 1' }
  }
  return { valid: true }
}

/**
 * Validate analog output value (typically 0-10V or 4-20mA)
 */
export function validateAnalogOutput(
  value: number,
  min: number = 0,
  max: number = 10,
): ValidationResult {
  return validateRange(value, min, max, 'Analog output value')
}

/**
 * Validate IP address
 */
export function validateIPAddress(ip: string): ValidationResult {
  if (!isNonEmptyString(ip)) {
    return { valid: false, error: 'IP address cannot be empty' }
  }
  const pattern = /^(\d{1,3}\.){3}\d{1,3}$/
  if (!pattern.test(ip)) {
    return { valid: false, error: 'Invalid IP address format' }
  }
  const parts = ip.split('.')
  for (const part of parts) {
    const num = Number(part)
    if (!Number.isInteger(num) || num < 0 || num > 255) {
      return { valid: false, error: 'Each part of the IP address must be between 0 and 255' }
    }
  }
  return { valid: true }
}

/**
 * Validate port
 */
export function validatePort(port: number): ValidationResult {
  if (!isFiniteNumber(port)) {
    return { valid: false, error: 'Port must be a valid number' }
  }
  if (!Number.isInteger(port)) {
    return { valid: false, error: 'Port must be an integer' }
  }
  if (port < 1 || port > 65535) {
    return { valid: false, error: 'Port must be between 1 and 65535' }
  }
  return { valid: true }
}

/**
 * Validate Modbus slave address
 */
export function validateSlaveAddress(address: number): ValidationResult {
  if (!isFiniteNumber(address)) {
    return { valid: false, error: 'Slave address must be a valid number' }
  }
  if (!Number.isInteger(address)) {
    return { valid: false, error: 'Slave address must be an integer' }
  }
  if (address < 1 || address > 247) {
    return { valid: false, error: 'Slave address must be between 1 and 247' }
  }
  return { valid: true }
}

/**
 * Validate register address
 */
export function validateRegisterAddress(address: number): ValidationResult {
  if (!isFiniteNumber(address)) {
    return { valid: false, error: 'Register address must be a valid number' }
  }
  if (!Number.isInteger(address)) {
    return { valid: false, error: 'Register address must be an integer' }
  }
  if (address < 0 || address > 65535) {
    return { valid: false, error: 'Register address must be between 0 and 65535' }
  }
  return { valid: true }
}

/**
 * Validate array is not empty
 */
export function validateNotEmpty<T>(array: T[], fieldName: string = 'Array'): ValidationResult {
  if (!Array.isArray(array) || array.length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty` }
  }
  return { valid: true }
}

/**
 * Validate WebSocket connection state
 * Use Set<number> to avoid includes() type narrowing limitations
 */
export function validateWebSocketState(state: number): ValidationResult {
  const validStates = new Set<number>([
    WebSocket.CONNECTING,
    WebSocket.OPEN,
    WebSocket.CLOSING,
    WebSocket.CLOSED,
  ])
  if (!validStates.has(state)) {
    return { valid: false, error: 'Invalid WebSocket state' }
  }
  return { valid: true }
}

/**
 * Batch validation
 */
export function validateAll(validations: ValidationResult[]): ValidationResult {
  const errors = validations.filter((v) => !v.valid).map((v) => v.error)
  if (errors.length > 0) {
    return { valid: false, error: errors.filter(Boolean).join('; ') }
  }
  return { valid: true }
}

/**
 * Validate an object contains required fields (zero any)
 */
export function validateRequiredFields(
  obj: Record<string, unknown>,
  requiredFields: readonly string[],
): ValidationResult {
  const missingFields = requiredFields.filter((field) => !(field in obj))
  if (missingFields.length > 0) {
    return { valid: false, error: `Missing required fields: ${missingFields.join(', ')}` }
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
