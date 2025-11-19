/**
 * Device API Service
 */

import api from './api'
import type { DeviceListResponse, DeviceDetails, ConnectivityResponse } from '@/types'

export const deviceService = {
  /**
   * Get the list of all devices
   */
  async getAllDevices(): Promise<DeviceListResponse> {
    const response = await api.get<DeviceListResponse>('/devices/')
    return response.data
  },

  /**
   * Get detailed information of a device
   * @param deviceId Device ID
   */
  async getDeviceDetails(deviceId: string): Promise<DeviceDetails> {
    const response = await api.get<DeviceDetails>(`/devices/${deviceId}`)
    return response.data
  },

  /**
   * Get constraint information of a device
   * @param deviceId Device ID
   */
  async getDeviceConstraints(deviceId: string): Promise<DeviceDetails> {
    const response = await api.get(`/constraints/${deviceId}`)

    // The API returns an array, use the first element
    let constraintsData = response.data

    if (Array.isArray(constraintsData)) {
      console.log('[DeviceService] Constraints API returned array, using first element')
      constraintsData = constraintsData[0]
    }

    console.log('[DeviceService] Device constraints:', constraintsData)
    return constraintsData as DeviceDetails
  },

  /**
   * Check device connectivity status
   * @param deviceId Device ID
   */
  async checkConnectivity(deviceId: string): Promise<ConnectivityResponse> {
    const response = await api.get<ConnectivityResponse>(`/devices/${deviceId}/connectivity`)
    return response.data
  },

  /**
   * Batch check connectivity status for multiple devices
   * @param deviceIds List of device IDs
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
