/**
 * Config Device Store
 * Manages the list of Modbus devices for the config builder (control/alert config).
 * Separate from the existing deviceStore which manages monitoring devices.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useApi } from '@/composables/useApi'
import type { ConfigDevice, DevicePins } from '@/types/config-builder'

export const useConfigDeviceStore = defineStore('configDevice', () => {
  const api = useApi()

  // ===== State =====
  const devices = ref<ConfigDevice[]>([])
  const pinsCache = ref<Record<string, DevicePins>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)

  // ===== Getters =====

  /** true if at least one Modbus device is configured */
  const hasDevices = computed(() => devices.value.length > 0)

  /** Get device by model + slave_id key */
  const getDevice = computed(() => (model: string, slaveId: number) =>
    devices.value.find((d) => d.model === model && d.slave_id === slaveId) ?? null
  )

  // ===== Actions =====

  /** Load devices from API (uses cache to avoid repeated calls) */
  async function loadDevices(): Promise<void> {
    if (initialized.value) return
    loading.value = true
    error.value = null
    try {
      devices.value = await api.getConfigDevices()
      initialized.value = true
    } catch (err: unknown) {
      error.value = (err as { message?: string })?.message ?? '無法載入設備列表'
      throw err
    } finally {
      loading.value = false
    }
  }

  /** Force reload devices from API */
  async function reloadDevices(): Promise<void> {
    initialized.value = false
    await loadDevices()
  }

  /** Add a device to the local list */
  function addDevice(device: ConfigDevice): void {
    const exists = devices.value.some(
      (d) => d.model === device.model && d.slave_id === device.slave_id,
    )
    if (!exists) {
      devices.value.push(device)
    }
  }

  /** Remove a device from the local list */
  function removeDevice(model: string, slaveId: number): void {
    devices.value = devices.value.filter(
      (d) => !(d.model === model && d.slave_id === slaveId),
    )
    // Clear pin cache for this model
    delete pinsCache.value[model]
  }

  /** Get pins for a model (with caching) */
  async function getPins(model: string): Promise<DevicePins> {
    if (pinsCache.value[model]) {
      return pinsCache.value[model]
    }
    try {
      const pins = await api.getDevicePins(model)
      pinsCache.value[model] = pins
      return pins
    } catch (err: unknown) {
      throw new Error(
        `無法載入 ${model} 的 pin 清單：${(err as { message?: string })?.message ?? '未知錯誤'}`,
      )
    }
  }

  /** Reset store */
  function $reset(): void {
    devices.value = []
    pinsCache.value = {}
    loading.value = false
    error.value = null
    initialized.value = false
  }

  return {
    // State
    devices,
    pinsCache,
    loading,
    error,
    initialized,
    // Getters
    hasDevices,
    getDevice,
    // Actions
    loadDevices,
    reloadDevices,
    addDevice,
    removeDevice,
    getPins,
    $reset,
  }
})
