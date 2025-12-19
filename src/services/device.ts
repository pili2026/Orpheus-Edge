/**
 * Device API Service
 */
import api from './api'

// ==================== API Response Types ====================
// These types match your backend API response structure

/**
 * Single device response from API
 * Matches: GET /api/devices/{device_id}
 */
export interface DeviceApiResponse {
  device_id: string
  model: string
  slave_id: string
  connection_status: 'online' | 'offline' | 'unknown'
  available_parameters: string[]
  last_seen: string | null
}

/**
 * Device list response from API
 * Matches: GET /api/devices/
 */
export interface DeviceListApiResponse {
  status: 'success' | 'error'
  timestamp: string
  message: string | null
  devices: DeviceApiResponse[]
  total_count: number
}

/**
 * Connectivity response from API
 */
export interface ConnectivityApiResponse {
  device_id: string
  is_online: boolean
  last_seen?: string
}

// ==================== Service ====================

export const deviceService = {
  /**
   * Get the list of all devices
   * GET /api/devices/?include_status=false
   */
  async getAllDevices(includeStatus: boolean = false): Promise<DeviceListApiResponse> {
    const response = await api.get<DeviceListApiResponse>('/devices/', {
      params: { include_status: includeStatus },
    })
    return response.data
  },

  /**
   * Get detailed information of a device
   * GET /api/devices/{device_id}?include_status=true
   * @param deviceId Device ID
   */
  async getDeviceDetails(
    deviceId: string,
    includeStatus: boolean = true,
  ): Promise<DeviceApiResponse> {
    const response = await api.get<DeviceApiResponse>(`/devices/${deviceId}`, {
      params: { include_status: includeStatus },
    })
    return response.data
  },

  /**
   * Get constraint information of a device
   * GET /api/constraints/{device_id}
   * @param deviceId Device ID
   */
  async getDeviceConstraints(deviceId: string): Promise<any> {
    const response = await api.get(`/constraints/${deviceId}`)
    // The API returns an array, use the first element
    let constraintsData = response.data
    if (Array.isArray(constraintsData)) {
      console.log('[DeviceService] Constraints API returned array, using first element')
      constraintsData = constraintsData[0]
    }
    console.log('[DeviceService] Device constraints:', constraintsData)
    return constraintsData
  },

  /**
   * Check device connectivity status
   * GET /api/devices/{device_id}/connectivity
   * @param deviceId Device ID
   */
  async checkConnectivity(deviceId: string): Promise<ConnectivityApiResponse> {
    const response = await api.get<ConnectivityApiResponse>(`/devices/${deviceId}/connectivity`)
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
        } catch {
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
