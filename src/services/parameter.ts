/**
 * Parameter Service
 * 處理參數讀取和寫入的 API 請求
 */

import api from '@/services/api'
import type {
  ReadSingleParameterRequest,
  ReadMultipleParametersRequest,
  WriteParameterRequest,
  ReadParameterResponse,
  ReadMultipleParametersResponse,
  WriteParameterResponse,
} from '@/types/parameter'

class ParameterService {
  /**
   * 讀取單一參數
   */
  async readSingleParameter(deviceId: string, parameter: string): Promise<ReadParameterResponse> {
    const payload: ReadSingleParameterRequest = {
      device_id: deviceId,
      parameter: parameter,
    }

    const response = await api.post<ReadParameterResponse>('/parameters/read', payload)
    return response.data
  }

  /**
   * 讀取多個參數
   */
  async readMultipleParameters(
    deviceId: string,
    parameters: string[],
  ): Promise<ReadMultipleParametersResponse> {
    const payload: ReadMultipleParametersRequest = {
      device_id: deviceId,
      parameters: parameters,
    }

    const response = await api.post<ReadMultipleParametersResponse>(
      '/parameters/read-multiple',
      payload,
    )
    return response.data
  }

  /**
   * 寫入參數
   */
  async writeParameter(
    deviceId: string,
    parameter: string,
    value: number,
    force: boolean = false,
  ): Promise<WriteParameterResponse> {
    const payload: WriteParameterRequest = {
      device_id: deviceId,
      parameter: parameter,
      value: value,
      force: force,
    }

    const response = await api.post<WriteParameterResponse>('/parameters/write', payload)
    return response.data
  }
}

export const parameterService = new ParameterService()
