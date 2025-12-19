/**
 * Parameter API Type Definitions
 */

export enum ResponseStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  PARTIAL_SUCCESS = 'partial_success',
}

export enum ParameterType {
  READ_ONLY = 'read_only',
  READ_WRITE = 'read_write',
}

export interface ReadSingleParameterRequest {
  device_id: string
  parameter: string
}

export interface ReadMultipleParametersRequest {
  device_id: string
  parameters: string[]
}

export interface WriteParameterRequest {
  device_id: string
  parameter: string
  value: number
  force?: boolean
}

export interface ParameterValue {
  name: string
  value: number
  unit?: string | null
  type: ParameterType
  is_valid: boolean
  error_message?: string | null
}

export interface ReadParameterResponse {
  status: ResponseStatus
  device_id: string
  parameter: ParameterValue
  message?: string | null
}

export interface ReadMultipleParametersResponse {
  status: ResponseStatus
  device_id: string
  parameters: ParameterValue[]
  success_count: number
  error_count: number
}

export interface WriteParameterResponse {
  status: ResponseStatus
  device_id: string
  parameter: string
  previous_value?: number | null
  new_value: number
  was_forced: boolean
}
