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
   * 讀取單個參數
   * @param request 讀取請求
   */
  async readParameter(request: ReadParameterRequest): Promise<ReadParameterResponse> {
    const response = await api.post<ReadParameterResponse>('/parameters/read', request)
    return response.data
  },

  /**
   * 讀取多個參數
   * @param deviceId 設備 ID
   * @param parameters 參數列表
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
   * 寫入參數
   * @param request 寫入請求
   */
  async writeParameter(request: WriteParameterRequest): Promise<WriteParameterResponse> {
    const response = await api.post<WriteParameterResponse>('/parameters/write', request)
    return response.data
  },

  /**
   * 批次寫入相同參數到多個設備
   * @param deviceIds 設備 ID 列表
   * @param parameter 參數名稱
   * @param value 寫入值
   * @param force 是否強制寫入
   */
  async batchWrite(
    deviceIds: string[],
    parameter: string,
    value: number,
    force: boolean = false,
  ): Promise<any> {
    const response = await api.post('/batch/write', {
      device_ids: deviceIds,
      parameter,
      value,
      force,
    })
    return response.data
  },
}
