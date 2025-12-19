/**
 * Device Store
 * Manages device list, selection, and details
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { deviceService, type DeviceApiResponse } from '@/services/device'
import type { Device, DeviceDetails, ParameterInfo } from '@/types'

export const useDeviceStore = defineStore('device', () => {
  // ===== State =====
  const devices = ref<Device[]>([])
  const selectedDeviceId = ref<string | null>(null)
  const selectedDeviceIds = ref<string[]>([])
  const selectedParameters = ref<string[]>([])
  const deviceDetails = ref<Record<string, DeviceDetails>>({})
  const loading = ref<boolean>(false)
  const error = ref<string | null>(null)

  // ===== Getters =====

  /** Get currently selected device */
  const selectedDevice = computed<Device | null>(() => {
    if (!selectedDeviceId.value) return null
    return devices.value.find((d) => d.device_id === selectedDeviceId.value) || null
  })

  /** Get currently selected multiple devices */
  const selectedDevices = computed<Device[]>(() => {
    return devices.value.filter((d) => selectedDeviceIds.value.includes(d.device_id))
  })

  /** Get online device count */
  const onlineDeviceCount = computed<number>(() => {
    return devices.value.filter((d) => !!d.is_online).length
  })

  // ===== Helper Functions =====

  /**
   * Convert API response to internal Device format
   */
  function convertApiResponseToDevice(apiDevice: DeviceApiResponse): Device {
    return {
      device_id: apiDevice.device_id,
      model: apiDevice.model,
      slave_address: parseInt(apiDevice.slave_id),
      is_online: apiDevice.connection_status === 'online',
    }
  }

  /**
   * Convert API response to DeviceDetails format
   */
  function convertApiResponseToDeviceDetails(apiDevice: DeviceApiResponse): DeviceDetails {
    // Convert available_parameters (string[]) to ParameterInfo[]
    const parameters: ParameterInfo[] = apiDevice.available_parameters.map((paramName) => {
      // Determine type based on parameter name pattern
      const isDigital =
        /^(DI|DO|ERROR|ALERT|STATUS|ON_OFF|RESET|RW_ON_OFF|RW_RESET|INVSTATUS)/.test(paramName)

      return {
        name: paramName,
        type: isDigital ? 'digital' : 'analog',
      }
    })

    return {
      device_id: apiDevice.device_id,
      model: apiDevice.model,
      slave_address: parseInt(apiDevice.slave_id),
      is_online: apiDevice.connection_status === 'online',
      parameters: parameters,
    }
  }

  // ===== Actions =====

  /** Load all devices */
  const loadAllDevices = async (): Promise<void> => {
    loading.value = true
    error.value = null

    try {
      const response = await deviceService.getAllDevices(false)

      // Convert API response to internal format
      devices.value = response.devices.map(convertApiResponseToDevice)

      console.log(`[Device Store] Loaded ${devices.value.length} devices:`, devices.value)
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to load devices'
      error.value = msg
      console.error('[Device Store] Load devices error:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /** Load device details */
  const loadDeviceDetails = async (deviceId: string): Promise<DeviceDetails> => {
    try {
      // If already loaded, return cached data
      if (deviceDetails.value[deviceId]) {
        console.log(`[Device Store] Using cached details for: ${deviceId}`)
        return deviceDetails.value[deviceId]
      }

      console.log(`[Device Store] Loading details for device: ${deviceId}`)
      const apiResponse = await deviceService.getDeviceDetails(deviceId, true)

      // Convert API response to internal format
      const details = convertApiResponseToDeviceDetails(apiResponse)
      deviceDetails.value[deviceId] = details

      console.log(`[Device Store] Loaded details for ${deviceId}:`, details)
      console.log(`[Device Store] Available parameters:`, details.parameters)

      return details
    } catch (err: unknown) {
      console.error(`[Device Store] Failed to load device ${deviceId}:`, err)
      throw err
    }
  }

  /** Select a device */
  const selectDevice = async (deviceId: string): Promise<void> => {
    selectedDeviceId.value = deviceId
    console.log(`[Device Store] Selected device: ${deviceId}`)

    // Auto-load device details if not already loaded
    if (!deviceDetails.value[deviceId]) {
      await loadDeviceDetails(deviceId)
    }
  }

  /** Deselect device */
  const deselectDevice = (): void => {
    selectedDeviceId.value = null
    selectedParameters.value = []
  }

  /** Select multiple devices */
  const selectMultipleDevices = (deviceIds: string[]): void => {
    selectedDeviceIds.value = deviceIds
  }

  /** Select parameters */
  const selectParameters = (parameters: string[]): void => {
    selectedParameters.value = parameters
  }

  /** Get device parameters as ParameterInfo[] */
  const getDeviceParameters = (deviceId: string): ParameterInfo[] => {
    const details = deviceDetails.value[deviceId]

    if (!details || !details.parameters) {
      console.warn(`[Device Store] No parameters found for device: ${deviceId}`)
      return []
    }

    // Parameters is already ParameterInfo[]
    const params = Array.isArray(details.parameters) ? details.parameters : []
    console.log(`[Device Store] Returning ${params.length} parameters for ${deviceId}`)

    return params.map((p) => ({ ...p }))
  }

  /** Get specific parameter info by name */
  const getParameterInfo = (deviceId: string, paramName: string): ParameterInfo | null => {
    const details = deviceDetails.value[deviceId]

    if (!details || !details.parameters) {
      return null
    }

    const params: ParameterInfo[] = Array.isArray(details.parameters) ? details.parameters : []
    const found = params.find((p) => p.name === paramName)
    return found ? { ...found } : null
  }

  /** Check device connectivity status */
  const checkDeviceConnectivity = async (deviceId: string): Promise<boolean> => {
    try {
      const response = await deviceService.checkConnectivity(deviceId)

      // Update device status
      const device = devices.value.find((d) => d.device_id === deviceId)
      if (device) {
        device.is_online = response.is_online
      }

      return response.is_online
    } catch (err: unknown) {
      console.error(`[Device Store] Check connectivity error for ${deviceId}:`, err)
      return false
    }
  }

  /** Batch check connectivity for multiple devices */
  const batchCheckConnectivity = async (deviceIds: string[]): Promise<void> => {
    try {
      const results = await deviceService.batchCheckConnectivity(deviceIds)

      // Update device status
      Object.entries(results).forEach(([deviceId, isOnline]) => {
        const device = devices.value.find((d) => d.device_id === deviceId)
        if (device) {
          device.is_online = isOnline
        }
      })
    } catch (err: unknown) {
      console.error('[Device Store] Batch check connectivity error:', err)
    }
  }

  /** Refresh all device status */
  const refreshAllDeviceStatus = async (): Promise<void> => {
    const deviceIds = devices.value.map((d) => d.device_id)
    await batchCheckConnectivity(deviceIds)
  }

  /** Reset store to initial state */
  const $reset = (): void => {
    devices.value = []
    selectedDeviceId.value = null
    selectedDeviceIds.value = []
    selectedParameters.value = []
    deviceDetails.value = {}
    loading.value = false
    error.value = null
  }

  return {
    // State
    devices,
    selectedDeviceId,
    selectedDeviceIds,
    selectedParameters,
    deviceDetails,
    loading,
    error,
    // Getters
    selectedDevice,
    selectedDevices,
    onlineDeviceCount,
    // Actions
    loadAllDevices,
    loadDeviceDetails,
    selectDevice,
    deselectDevice,
    selectMultipleDevices,
    selectParameters,
    getDeviceParameters,
    getParameterInfo,
    checkDeviceConnectivity,
    batchCheckConnectivity,
    refreshAllDeviceStatus,
    $reset,
  }
})
