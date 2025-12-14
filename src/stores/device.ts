/**
 * Device Store
 * Manages the device list, selection, and device details
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { deviceService } from '@/services/device'
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

  /** Get the currently selected device */
  const selectedDevice = computed<Device | null>(() => {
    if (!selectedDeviceId.value) return null
    return devices.value.find((d) => d.device_id === selectedDeviceId.value) || null
  })

  /** Get the currently selected multiple devices */
  const selectedDevices = computed<Device[]>(() => {
    return devices.value.filter((d) => selectedDeviceIds.value.includes(d.device_id))
  })

  /** Get the number of online devices */
  const onlineDeviceCount = computed<number>(() => {
    return devices.value.filter((d) => !!d.is_online).length
  })

  // ===== Actions =====

  /** Load all devices */
  const loadAllDevices = async (): Promise<void> => {
    loading.value = true
    error.value = null

    try {
      const response = await deviceService.getAllDevices()
      devices.value = response.devices
      console.log(`Loaded ${devices.value.length} devices`)
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to load devices'
      error.value = msg
      console.error('Load devices error:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /** Load device details */
  const loadDeviceDetails = async (deviceId: string): Promise<DeviceDetails> => {
    try {
      // If already loaded, return cached result
      if (deviceDetails.value[deviceId]) {
        return deviceDetails.value[deviceId]
      }

      const details = await deviceService.getDeviceDetails(deviceId)
      deviceDetails.value[deviceId] = details
      console.log(`Loaded details for device: ${deviceId}`)
      return details
    } catch (err: unknown) {
      console.error(`Failed to load device ${deviceId}:`, err)
      throw err
    }
  }

  /** Select a device */
  const selectDevice = async (deviceId: string): Promise<void> => {
    selectedDeviceId.value = deviceId
    // Auto-load device details
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

  /** Get the device parameter list (typed as: ParameterInfo[]) */
  const getDeviceParameters = (deviceId: string): ParameterInfo[] => {
    const details = deviceDetails.value[deviceId]
    const params: ParameterInfo[] = Array.isArray(details?.parameters) ? details!.parameters! : []
    return params.map((p: ParameterInfo) => ({ ...p }))
  }

  /** Get info for a specific parameter (find by name from ParameterInfo[]) */
  const getParameterInfo = (deviceId: string, paramName: string): ParameterInfo | null => {
    const details = deviceDetails.value[deviceId]
    const params: ParameterInfo[] = Array.isArray(details?.parameters) ? details!.parameters! : []
    const found = params.find((p) => p.name === paramName)
    return found ? { ...found } : null
  }

  /** Check device connectivity */
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
      console.error(`Check connectivity error for ${deviceId}:`, err)
      return false
    }
  }

  /** Batch check device connectivity */
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
      console.error('Batch check connectivity error:', err)
    }
  }

  /** Refresh status of all devices */
  const refreshAllDeviceStatus = async (): Promise<void> => {
    const deviceIds = devices.value.map((d) => d.device_id)
    await batchCheckConnectivity(deviceIds)
  }

  /** Reset all state */
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
