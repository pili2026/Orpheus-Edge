/**
 * Device Store
 * 管理設備列表、選擇和詳細資訊
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

  /** 獲取當前選中的設備 */
  const selectedDevice = computed<Device | null>(() => {
    if (!selectedDeviceId.value) return null
    return devices.value.find((d) => d.device_id === selectedDeviceId.value) || null
  })

  /** 獲取當前選中的多個設備 */
  const selectedDevices = computed<Device[]>(() => {
    return devices.value.filter((d) => selectedDeviceIds.value.includes(d.device_id))
  })

  /** 獲取在線設備數量 */
  const onlineDeviceCount = computed<number>(() => {
    return devices.value.filter((d) => !!d.is_online).length
  })

  // ===== Actions =====

  /** 載入所有設備 */
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

  /** 載入設備詳細資訊 */
  const loadDeviceDetails = async (deviceId: string): Promise<DeviceDetails> => {
    try {
      // 如果已經載入過，直接返回
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

  /** 選擇設備 */
  const selectDevice = async (deviceId: string): Promise<void> => {
    selectedDeviceId.value = deviceId
    // 自動載入設備詳細資訊
    if (!deviceDetails.value[deviceId]) {
      await loadDeviceDetails(deviceId)
    }
  }

  /** 取消選擇設備 */
  const deselectDevice = (): void => {
    selectedDeviceId.value = null
    selectedParameters.value = []
  }

  /** 選擇多個設備 */
  const selectMultipleDevices = (deviceIds: string[]): void => {
    selectedDeviceIds.value = deviceIds
  }

  /** 選擇參數 */
  const selectParameters = (parameters: string[]): void => {
    selectedParameters.value = parameters
  }

  /** 獲取設備的參數列表（依照 types：ParameterInfo[]） */
  const getDeviceParameters = (deviceId: string): ParameterInfo[] => {
    const details = deviceDetails.value[deviceId]
    const params: ParameterInfo[] = Array.isArray(details?.parameters) ? details!.parameters! : []
    return params.map((p: ParameterInfo) => ({ ...p }))
  }

  /** 獲取特定參數的資訊（從 ParameterInfo[] 以 name 尋找） */
  const getParameterInfo = (deviceId: string, paramName: string): ParameterInfo | null => {
    const details = deviceDetails.value[deviceId]
    const params: ParameterInfo[] = Array.isArray(details?.parameters) ? details!.parameters! : []
    const found = params.find((p) => p.name === paramName)
    return found ? { ...found } : null
  }

  /** 檢查設備連線狀態 */
  const checkDeviceConnectivity = async (deviceId: string): Promise<boolean> => {
    try {
      const response = await deviceService.checkConnectivity(deviceId)

      // 更新設備狀態
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

  /** 批次檢查設備連線狀態 */
  const batchCheckConnectivity = async (deviceIds: string[]): Promise<void> => {
    try {
      const results = await deviceService.batchCheckConnectivity(deviceIds)

      // 更新設備狀態
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

  /** 刷新所有設備狀態 */
  const refreshAllDeviceStatus = async (): Promise<void> => {
    const deviceIds = devices.value.map((d) => d.device_id)
    await batchCheckConnectivity(deviceIds)
  }

  /** 重置所有狀態 */
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
