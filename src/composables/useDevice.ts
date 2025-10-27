/**
 * useDevice Composable
 * 提供設備管理功能
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
   * 所有設備列表
   */
  const devices = computed(() => deviceStore.devices)

  /**
   * 當前選中的設備
   */
  const selectedDevice = computed(() => deviceStore.selectedDevice)

  /**
   * 當前選中的設備 ID
   */
  const selectedDeviceId = computed(() => deviceStore.selectedDeviceId)

  /**
   * 選中的多個設備
   */
  const selectedDevices = computed(() => deviceStore.selectedDevices)

  /**
   * 選中的多個設備 ID
   */
  const selectedDeviceIds = computed(() => deviceStore.selectedDeviceIds)

  /**
   * 選中的參數列表
   */
  const selectedParameters = computed(() => deviceStore.selectedParameters)

  /**
   * 設備詳情
   */
  const deviceDetails = computed(() => deviceStore.deviceDetails)

  /**
   * 載入狀態
   */
  const loading = computed(() => deviceStore.loading)

  /**
   * 錯誤信息
   */
  const error = computed(() => deviceStore.error)

  /**
   * 線上設備數量
   */
  const onlineDeviceCount = computed(() => deviceStore.onlineDeviceCount)

  /**
   * 設備總數
   */
  const totalDeviceCount = computed(() => devices.value.length)

  // ===== Methods =====

  /**
   * 載入所有設備
   */
  const loadDevices = async (): Promise<Device[]> => {
    try {
      await deviceStore.loadAllDevices()
      dataStore.addLog(`載入了 ${devices.value.length} 個設備`, 'success')
      return devices.value
    } catch (error: any) {
      dataStore.addLog(`載入設備失敗: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * 載入設備詳情
   * @param deviceId 設備 ID
   */
  const loadDeviceDetails = async (deviceId: string): Promise<void> => {
    try {
      await deviceStore.loadDeviceDetails(deviceId)
      dataStore.addLog(`載入設備 ${deviceId} 的詳細資訊`, 'info')
    } catch (error: any) {
      dataStore.addLog(`載入設備詳情失敗: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * 選擇設備
   * @param deviceId 設備 ID
   */
  const selectDevice = async (deviceId: string): Promise<void> => {
    try {
      await deviceStore.selectDevice(deviceId)
      dataStore.addLog(`選擇設備: ${deviceId}`, 'info')
    } catch (error: any) {
      dataStore.addLog(`選擇設備失敗: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * 取消選擇設備
   */
  const deselectDevice = (): void => {
    deviceStore.deselectDevice()
    dataStore.addLog('已取消選擇設備', 'info')
  }

  /**
   * 選擇多個設備
   * @param deviceIds 設備 ID 列表
   */
  const selectMultipleDevices = (deviceIds: string[]): void => {
    deviceStore.selectMultipleDevices(deviceIds)
    dataStore.addLog(`選擇了 ${deviceIds.length} 個設備`, 'info')
  }

  /**
   * 選擇參數
   * @param parameters 參數列表
   */
  const selectParameters = (parameters: string[]): void => {
    deviceStore.selectParameters(parameters)
    dataStore.addLog(`選擇了 ${parameters.length} 個參數`, 'info')
  }

  /**
   * 獲取設備的參數列表
   * @param deviceId 設備 ID
   */
  const getDeviceParameters = (deviceId: string): ParameterInfo[] => {
    return deviceStore.getDeviceParameters(deviceId)
  }

  /**
   * 獲取參數資訊
   * @param deviceId 設備 ID
   * @param paramName 參數名稱
   */
  const getParameterInfo = (deviceId: string, paramName: string): ParameterInfo | null => {
    return deviceStore.getParameterInfo(deviceId, paramName)
  }

  /**
   * 檢查設備連線狀態
   * @param deviceId 設備 ID
   */
  const checkDeviceConnectivity = async (deviceId: string): Promise<boolean> => {
    try {
      const isOnline = await deviceStore.checkDeviceConnectivity(deviceId)
      dataStore.addLog(
        `設備 ${deviceId} ${isOnline ? '線上' : '離線'}`,
        isOnline ? 'success' : 'warning',
      )
      return isOnline
    } catch (error: any) {
      dataStore.addLog(`檢查連線狀態失敗: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * 批次檢查設備連線狀態
   * @param deviceIds 設備 ID 列表
   */
  const batchCheckConnectivity = async (deviceIds: string[]): Promise<void> => {
    try {
      await deviceStore.batchCheckConnectivity(deviceIds)
      dataStore.addLog(`批次檢查了 ${deviceIds.length} 個設備的連線狀態`, 'info')
    } catch (error: any) {
      dataStore.addLog(`批次檢查失敗: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * 刷新所有設備狀態
   */
  const refreshAllDeviceStatus = async (): Promise<void> => {
    try {
      await deviceStore.refreshAllDeviceStatus()
      dataStore.addLog('已刷新所有設備狀態', 'success')
    } catch (error: any) {
      dataStore.addLog(`刷新失敗: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * 重置所有狀態
   */
  const reset = (): void => {
    deviceStore.$reset()
    dataStore.addLog('已重置設備狀態', 'info')
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
