/**
 * Device API Service
 */

import api from './api'
import type { DeviceListResponse, DeviceDetails, ConnectivityResponse } from '@/types'

export const deviceService = {
  /**
   * 獲取所有設備列表
   */
  async getAllDevices(): Promise<DeviceListResponse> {
    const response = await api.get<DeviceListResponse>('/devices/')
    return response.data
  },

  /**
   * 獲取設備詳細資訊
   * @param deviceId 設備 ID
   */
  async getDeviceDetails(deviceId: string): Promise<DeviceDetails> {
    const response = await api.get<DeviceDetails>(`/devices/${deviceId}`)
    return response.data
  },

  /**
   * 獲取設備約束資訊
   * @param deviceId 設備 ID
   */
  async getDeviceConstraints(deviceId: string): Promise<DeviceDetails> {
    const response = await api.get(`/constraints/${deviceId}`)

    // API返回的是數組格式，取第一個元素
    let constraintsData = response.data

    if (Array.isArray(constraintsData)) {
      console.log('[DeviceService] Constraints API returned array, using first element')
      constraintsData = constraintsData[0]
    }

    console.log('[DeviceService] Device constraints:', constraintsData)

    return constraintsData as DeviceDetails
  },

  /**
   * 檢查設備連線狀態
   * @param deviceId 設備 ID
   */
  async checkConnectivity(deviceId: string): Promise<ConnectivityResponse> {
    const response = await api.get<ConnectivityResponse>(`/devices/${deviceId}/connectivity`)
    return response.data
  },

  /**
   * 批次檢查多個設備的連線狀態
   * @param deviceIds 設備 ID 列表
   */
  async batchCheckConnectivity(deviceIds: string[]): Promise<Record<string, boolean>> {
    const results = await Promise.all(
      deviceIds.map(async (deviceId) => {
        try {
          const response = await this.checkConnectivity(deviceId)
          return { deviceId, isOnline: response.is_online }
        } catch (error) {
          return { deviceId, isOnline: false }
        }
      }),
    )

    return results.reduce(
      (acc, { deviceId, isOnline }) => {
        acc[deviceId] = isOnline
        return acc
      },
      {} as Record<string, boolean>,
    )
  },
}
