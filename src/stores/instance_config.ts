import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'
import { ElMessage } from 'element-plus'

// =========================================================================
// Types
// =========================================================================

export interface ConstraintConfigRequest {
  min: number
  max: number
}

export interface PinConfig {
  remark?: string | null
  formula?: number[] | null // [N1, N2, N3]
}

export interface InstanceConfigRequest {
  initialization?: Record<string, unknown> | null
  constraints?: Record<string, ConstraintConfigRequest> | null
  use_default_constraints?: boolean
  pins?: Record<string, PinConfig> | null
}

export interface DeviceConfigRequest {
  initialization?: Record<string, unknown> | null
  default_constraints?: Record<string, ConstraintConfigRequest> | null
  instances: Record<string, InstanceConfigRequest>
}

export interface InstanceConfigResponse {
  status: string
  global_defaults: Record<string, unknown> | null
  devices: Record<string, DeviceConfigRequest>
  generation: number
  checksum: string | null
  modified_at: string | null
}

export interface DriverModelInfo {
  model: string
  device_type: string // 'inverter', 'vfd', 'ai_module', 'di_module', 'io_module', etc.
  pin_names: string[] // pin list from driver, used in PinConfigDialog
  slave_ids: number[]
}

// =========================================================================
// Store
// =========================================================================

export const useInstanceConfigStore = defineStore('instanceConfig', () => {
  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  const config = ref<InstanceConfigResponse | null>(null)
  const driverModels = ref<DriverModelInfo[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)

  // -----------------------------------------------------------------------
  // Computed — device type classification from driver list
  // -----------------------------------------------------------------------
  const inverterModels = computed(() =>
    driverModels.value
      .filter((m) => ['inverter', 'vfd'].includes(m.device_type))
      .map((m) => m.model),
  )

  const aiModels = computed(() =>
    driverModels.value.filter((m) => m.device_type === 'ai_module').map((m) => m.model),
  )

  const diModels = computed(() =>
    driverModels.value
      .filter((m) => ['di_module', 'io_module'].includes(m.device_type))
      .map((m) => m.model),
  )

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Get pin names for a model from driver definitions.
   * Used by PinConfigDialog to render all available pins.
   */
  const getPinNames = (model: string): string[] => {
    return driverModels.value.find((m) => m.model === model)?.pin_names ?? []
  }

  /**
   * Get device_type for a model from driver definitions.
   */
  const getDeviceType = (model: string): string => {
    return driverModels.value.find((m) => m.model === model)?.device_type ?? 'unknown'
  }

  // -----------------------------------------------------------------------
  // Actions — Fetch
  // -----------------------------------------------------------------------

  const fetchConfig = async (): Promise<void> => {
    isLoading.value = true
    try {
      const res = await axios.get<InstanceConfigResponse>('/api/config/instance')
      config.value = res.data
    } catch (err) {
      ElMessage.error('載入 Instance Config 失敗')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const fetchDriverModels = async (): Promise<void> => {
    try {
      const [driversRes, modbusRes] = await Promise.all([
        axios.get('/api/config/modbus_drivers'),
        axios.get('/api/config/modbus'),
      ])

      const slaveIdMap: Record<string, number[]> = {}
      for (const device of modbusRes.data.devices ?? []) {
        if (!slaveIdMap[device.model]) {
          slaveIdMap[device.model] = []
        }
        slaveIdMap[device.model]!.push(device.slave_id)
      }

      driverModels.value = (driversRes.data.drivers as any[]).map((m) => ({
        model: m.model,
        device_type: m.type,
        pin_names: (m.available_parameters ?? []) as string[],
        slave_ids: slaveIdMap[m.model] ?? [],
      }))
    } catch (err) {
      ElMessage.error('載入 Driver 清單失敗')
      throw err
    }
  }

  // -----------------------------------------------------------------------
  // Actions — Write
  // -----------------------------------------------------------------------

  /**
   * Update the full config for a device model.
   * Replaces all instances under that model.
   */
  const updateDevice = async (model: string, deviceConfig: DeviceConfigRequest): Promise<void> => {
    isSaving.value = true
    try {
      const res = await axios.put<InstanceConfigResponse>(`/api/config/instance/${model}`, {
        config: deviceConfig,
      })
      config.value = res.data
    } catch (err) {
      ElMessage.error('儲存失敗')
      throw err
    } finally {
      isSaving.value = false
    }
  }

  /**
   * Update config for a specific device instance (model + slave_id).
   * Only updates the target instance, other instances remain unchanged.
   */
  const updateInstance = async (
    model: string,
    slaveId: string,
    instanceConfig: InstanceConfigRequest,
  ): Promise<void> => {
    isSaving.value = true
    try {
      const res = await axios.put<InstanceConfigResponse>(
        `/api/config/instance/${model}/${slaveId}`,
        instanceConfig,
      )
      config.value = res.data
    } catch (err) {
      ElMessage.error('儲存失敗')
      throw err
    } finally {
      isSaving.value = false
    }
  }

  // -----------------------------------------------------------------------
  // Return
  // -----------------------------------------------------------------------
  return {
    // State
    config,
    driverModels,
    isLoading,
    isSaving,
    // Computed
    inverterModels,
    aiModels,
    diModels,
    // Helpers
    getPinNames,
    getDeviceType,
    // Actions
    fetchConfig,
    fetchDriverModels,
    updateDevice,
    updateInstance,
  }
})
