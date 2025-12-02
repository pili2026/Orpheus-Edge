/**
 * Parameter API Service
 */

import api from './api'
import type {
  ReadParameterRequest,
  ReadParameterResponse,
  WriteParameterRequest,
  WriteParameterResponse,
} from '@/types'

export const parameterService = {
  /**
   * Read a single parameter
   * @param request Read request
   */
  async readParameter(request: ReadParameterRequest): Promise<ReadParameterResponse> {
    const response = await api.post<ReadParameterResponse>('/parameters/read', request)
    return response.data
  },

  /**
   * Read multiple parameters
   * @param deviceId Device ID
   * @param parameters List of parameters
   */
  async readMultipleParameters(
    deviceId: string,
    parameters: string[],
  ): Promise<ReadParameterResponse> {
    const response = await api.post<ReadParameterResponse>('/parameters/read-multiple', {
      device_id: deviceId,
      parameters,
    })
    return response.data
  },

  /**
   * Write a parameter
   * @param request Write request
   */
  async writeParameter(request: WriteParameterRequest): Promise<WriteParameterResponse> {
    const response = await api.post<WriteParameterResponse>('/parameters/write', request)
    return response.data
  },

  /**
   * Batch write the same parameter to multiple devices
   * @param deviceIds List of device IDs
   * @param parameter Parameter name
   * @param value Value to write
   * @param force Whether to force write
   */
  async batchWrite(
    deviceIds: string[],
    parameter: string,
    value: number,
    force: boolean = false,
  ): Promise<unknown> {
    const response = await api.post('/batch/write', {
      device_ids: deviceIds,
      parameter,
      value,
      force,
    })
    return response.data
  },
}
