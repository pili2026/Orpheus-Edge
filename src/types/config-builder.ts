/**
 * Config Builder Types
 * Types for the Talos Config Builder UI (control_condition.yml and alert_condition.yml)
 */

// ==================== Device ====================

export interface ConfigDevice {
  model: string
  slave_id: number
  type?: string
  pins?: Pin[]
}

export interface Pin {
  name: string
  readable: boolean
  writable: boolean
  type?: 'digital' | 'analog'
  description?: string
}

export interface DevicePins {
  readable: Pin[]
  writable: Pin[]
}

// ==================== Control Config ====================

export type ConditionMode = 'all' | 'any'
export type Operator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'
export type PolicyType = 'discrete_setpoint' | 'incremental_linear'
export type ActionType = 'write_do' | 'set_frequency' | 'adjust_frequency'

export interface ControlSource {
  id: string
  device_model: string
  device_slave_id: number
  pin: string
  operator: Operator
  threshold: number | null
  hysteresis?: number | null
  debounce_sec?: number | null
}

export interface ControlCondition {
  mode: ConditionMode
  sources: ControlSource[]
}

export interface DiscreteSetpointPolicy {
  type: 'discrete_setpoint'
}

export interface IncrementalLinearPolicy {
  type: 'incremental_linear'
  input_source: string
  gain_hz_per_unit: number | null
}

export type ControlPolicy = DiscreteSetpointPolicy | IncrementalLinearPolicy

export interface ControlAction {
  id: string
  device_model: string
  device_slave_id: number
  type: ActionType
  target_pin: string
  value?: number | null
  emergency_override?: boolean
}

export interface ControlRule {
  id: string
  name: string
  code: string
  priority: number | null
  blocking: boolean
  condition: ControlCondition
  policy: ControlPolicy
  actions: ControlAction[]
}

// ==================== Alert Config ====================

export type AlertType =
  | 'threshold'
  | 'schedule_threshold'
  | 'schedule_expected_state'
  | 'average'
  | 'sum'
  | 'min'
  | 'max'

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL'
export type ExpectedState = 'on' | 'off'

export interface ActiveHours {
  start: string // HH:mm
  end: string // HH:mm
}

export interface AlertRule {
  id: string
  code: string
  name: string
  device_name: string
  device_model: string
  device_slave_id: number
  sources: string[]
  type: AlertType
  condition: Operator
  threshold: number | null
  severity: AlertSeverity
  message?: string
  // schedule_threshold specific
  active_hours?: ActiveHours
  // schedule_expected_state specific
  expected_state?: ExpectedState
}

// ==================== API Payloads ====================

export interface ValidateResponse {
  valid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  field: string
  message: string
}

export interface GenerateControlPayload {
  device_model: string
  device_slave_id: number
  rules: ControlRule[]
}

export interface GenerateAlertPayload {
  device_model: string
  device_slave_id: number
  rules: AlertRule[]
}

export interface GenerateYamlResponse {
  yaml: string
}

export interface DiagramResponse {
  mermaid: string
}
