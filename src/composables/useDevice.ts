/**
 * useDevice Composable
 * Provides device management functionality
 */

import { computed } from 'vue'
import { useDeviceStore } from '@/stores/device'
import { useDataStore } from '@/stores/data'
import type { Device, ParameterInfo } from '@/types'

export function useDevice() {
  const deviceStore = useDeviceStore()
  const dataStore = useDataStore()

  // ===== Computed =====

  /**
   * All devices list
   */
  const devices = computed(() => deviceStore.devices)

  /**
   * Currently selected device
   */
  const selectedDevice = computed(() => deviceStore.selectedDevice)

  /**
   * Currently selected device ID
   */
  const selectedDeviceId = computed(() => deviceStore.selectedDeviceId)

  /**
   * Selected multiple devices
   */
  const selectedDevices = computed(() => deviceStore.selectedDevices)

  /**
   * Selected multiple device IDs
   */
  const selectedDeviceIds = computed(() => deviceStore.selectedDeviceIds)

  /**
   * Selected parameters list
   */
  const selectedParameters = computed(() => deviceStore.selectedParameters)

  /**
   * Device details
   */
  const deviceDetails = computed(() => deviceStore.deviceDetails)

  /**
   * Loading state
   */
  const loading = computed(() => deviceStore.loading)

  /**
   * Error message
   */
  const error = computed(() => deviceStore.error)

  /**
   * Online device count
   */
  const onlineDeviceCount = computed(() => deviceStore.onlineDeviceCount)

  /**
   * Total device count
   */
  const totalDeviceCount = computed(() => devices.value.length)

  // ===== Methods =====

  /**
   * Load all devices
   */
  const loadDevices = async (): Promise<Device[]> => {
    try {
      await deviceStore.loadAllDevices()
      dataStore.addLog(`Loaded ${devices.value.length} devices`, 'success')
      return devices.value
    } catch (error: any) {
      dataStore.addLog(`Failed to load devices: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * Load device details
   * @param deviceId Device ID
   */
  const loadDeviceDetails = async (deviceId: string): Promise<void> => {
    try {
      await deviceStore.loadDeviceDetails(deviceId)
      dataStore.addLog(`Loaded details for device ${deviceId}`, 'info')
    } catch (error: any) {
      dataStore.addLog(`Failed to load device details: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * Select a device
   * @param deviceId Device ID
   */
  const selectDevice = async (deviceId: string): Promise<void> => {
    try {
      await deviceStore.selectDevice(deviceId)
      dataStore.addLog(`Selected device: ${deviceId}`, 'info')
    } catch (error: any) {
      dataStore.addLog(`Failed to select device: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * Deselect device
   */
  const deselectDevice = (): void => {
    deviceStore.deselectDevice()
    dataStore.addLog('Device selection cleared', 'info')
  }

  /**
   * Select multiple devices
   * @param deviceIds Device ID list
   */
  const selectMultipleDevices = (deviceIds: string[]): void => {
    deviceStore.selectMultipleDevices(deviceIds)
    dataStore.addLog(`Selected ${deviceIds.length} devices`, 'info')
  }

  /**
   * Select parameters
   * @param parameters Parameter list
   */
  const selectParameters = (parameters: string[]): void => {
    deviceStore.selectParameters(parameters)
    dataStore.addLog(`Selected ${parameters.length} parameters`, 'info')
  }

  /**
   * Get device parameter list
   * @param deviceId Device ID
   */
  const getDeviceParameters = (deviceId: string): ParameterInfo[] => {
    return deviceStore.getDeviceParameters(deviceId)
  }

  /**
   * Get parameter info
   * @param deviceId Device ID
   * @param paramName Parameter name
   */
  const getParameterInfo = (deviceId: string, paramName: string): ParameterInfo | null => {
    return deviceStore.getParameterInfo(deviceId, paramName)
  }

  /**
   * Check device connectivity
   * @param deviceId Device ID
   */
  const checkDeviceConnectivity = async (deviceId: string): Promise<boolean> => {
    try {
      const isOnline = await deviceStore.checkDeviceConnectivity(deviceId)
      dataStore.addLog(
        `Device ${deviceId} is ${isOnline ? 'online' : 'offline'}`,
        isOnline ? 'success' : 'warning',
      )
      return isOnline
    } catch (error: any) {
      dataStore.addLog(`Failed to check connectivity: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * Batch check device connectivity
   * @param deviceIds Device ID list
   */
  const batchCheckConnectivity = async (deviceIds: string[]): Promise<void> => {
    try {
      await deviceStore.batchCheckConnectivity(deviceIds)
      dataStore.addLog(`Batch-checked connectivity for ${deviceIds.length} devices`, 'info')
    } catch (error: any) {
      dataStore.addLog(`Batch check failed: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * Refresh all device statuses
   */
  const refreshAllDeviceStatus = async (): Promise<void> => {
    try {
      await deviceStore.refreshAllDeviceStatus()
      dataStore.addLog('All device statuses refreshed', 'success')
    } catch (error: any) {
      dataStore.addLog(`Refresh failed: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * Reset all state
   */
  const reset = (): void => {
    deviceStore.$reset()
    dataStore.addLog('Device state reset', 'info')
  }

  return {
    // State
    devices,
    selectedDevice,
    selectedDeviceId,
    selectedDevices,
    selectedDeviceIds,
    selectedParameters,
    deviceDetails,
    loading,
    error,
    onlineDeviceCount,
    totalDeviceCount,
    // Methods
    loadDevices,
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
    reset,
  }
}
