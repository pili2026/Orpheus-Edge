import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { useI18n } from '@/composables/useI18n'

// ===== Type Definitions =====

export interface ConfigMetadata {
  generation: number
  source: string
  last_modified: string
  last_modified_by: string
  checksum: string
  applied_at: string | null
  cloud_sync_id: string | null
}

export interface ModbusBus {
  name: string
  port: string
  baudrate: number
  timeout: number
}

export interface ModbusDevice {
  model: string
  type: string
  model_file: string
  slave_id: number
  bus: string
  modes: Record<string, unknown>
}

export interface ModbusConfig {
  metadata: ConfigMetadata
  buses: Record<string, ModbusBus>
  devices: ModbusDevice[]
}

export interface BackupFile {
  filename: string
  generation: number
  created_at: string
  size_bytes: number
}

// ===== Internal Helpers =====

type ApiErrorResponse = { detail?: string }

const getErrorMessage = (err: unknown, fallback: string): string => {
  if (axios.isAxiosError<ApiErrorResponse>(err)) {
    const detail = err.response?.data?.detail
    return typeof detail === 'string' && detail.trim() ? detail : fallback
  }
  return fallback
}

const makeHeaders = (userEmail?: string) => (userEmail ? { 'X-User-Email': userEmail } : {})

// ===== Store =====

export const useConfigStore = defineStore('config', () => {
  // i18n (get once)
  const { t } = useI18n()

  // State
  const config = ref<ModbusConfig | null>(null)
  const backups = ref<BackupFile[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const metadata = computed(() => config.value?.metadata || null)
  const buses = computed(() => config.value?.buses || {})
  const devices = computed(() => config.value?.devices || [])
  const busList = computed(() =>
    Object.entries(buses.value).map(([name, bus]) => ({
      ...bus,
      name,
    })),
  )

  // ===== API Base URL =====
  const API_BASE = '/api/config/modbus'

  // ===== Small wrapper to unify loading/error behavior =====
  const withLoading = async <T>(fn: () => Promise<T>): Promise<T> => {
    isLoading.value = true
    error.value = null
    try {
      return await fn()
    } finally {
      isLoading.value = false
    }
  }

  // ===== Actions =====

  /**
   * Fetch complete configuration
   */
  const fetchConfig = async () =>
    withLoading(async () => {
      try {
        const response = await axios.get<ModbusConfig>(API_BASE)
        config.value = response.data
        console.log('[ConfigStore] Config loaded:', response.data)
      } catch (err: unknown) {
        const msg = getErrorMessage(err, t.value.config.common.loadFailed)
        error.value = msg
        ElMessage.error(msg)
        throw err
      }
    })

  /**
   * Fetch metadata only
   */
  const fetchMetadata = async () => {
    try {
      const response = await axios.get<{ metadata: ConfigMetadata }>(`${API_BASE}/metadata`)
      if (config.value) {
        config.value.metadata = response.data.metadata
      }
      return response.data.metadata
    } catch (err: unknown) {
      const msg = getErrorMessage(err, t.value.config.common.loadFailed)
      error.value = msg
      throw err
    }
  }

  /**
   * Create or update a bus
   */
  const createOrUpdateBus = async (
    name: string,
    bus: { port: string; baudrate: number; timeout: number },
    userEmail?: string,
  ) =>
    withLoading(async () => {
      try {
        const headers = makeHeaders(userEmail)
        await axios.post(`${API_BASE}/buses/${name}`, bus, { headers })

        ElMessage.success(t.value.config.bus.saveSuccess)
        await fetchConfig()
      } catch (err: unknown) {
        const msg = getErrorMessage(err, t.value.config.bus.saveFailed)
        ElMessage.error(msg)
        throw err
      }
    })

  /**
   * Delete a bus
   */
  const deleteBus = async (name: string, userEmail?: string) =>
    withLoading(async () => {
      try {
        const headers = makeHeaders(userEmail)
        await axios.delete(`${API_BASE}/buses/${name}`, { headers })

        ElMessage.success(t.value.config.bus.deleteSuccess)
        await fetchConfig()
      } catch (err: unknown) {
        const msg = getErrorMessage(err, t.value.config.bus.deleteFailed)
        ElMessage.error(msg)
        throw err
      }
    })

  /**
   * Create or update a device
   */
  const createOrUpdateDevice = async (device: ModbusDevice, userEmail?: string) =>
    withLoading(async () => {
      try {
        const headers = makeHeaders(userEmail)
        await axios.post(`${API_BASE}/devices`, device, { headers })

        ElMessage.success(t.value.config.device.saveSuccess)
        await fetchConfig()
      } catch (err: unknown) {
        const msg = getErrorMessage(err, t.value.config.device.saveFailed)
        ElMessage.error(msg)
        throw err
      }
    })

  /**
   * Delete a device
   */
  const deleteDevice = async (model: string, slaveId: number, userEmail?: string) =>
    withLoading(async () => {
      try {
        const headers = makeHeaders(userEmail)
        await axios.delete(`${API_BASE}/devices/${model}/${slaveId}`, { headers })

        ElMessage.success(t.value.config.device.deleteSuccess)
        await fetchConfig()
      } catch (err: unknown) {
        const msg = getErrorMessage(err, t.value.config.device.deleteFailed)
        ElMessage.error(msg)
        throw err
      }
    })

  /**
   * Fetch backup list
   */
  const fetchBackups = async () => {
    try {
      const response = await axios.get<{ backups: BackupFile[]; total: number }>(
        `${API_BASE}/backups`,
      )
      backups.value = response.data.backups
      return response.data.backups
    } catch (err: unknown) {
      const msg = getErrorMessage(err, t.value.config.backup.loadFailed)
      error.value = msg
      throw err
    }
  }

  /**
   * Restore from backup
   */
  const restoreBackup = async (filename: string, userEmail?: string) =>
    withLoading(async () => {
      try {
        const headers = makeHeaders(userEmail)
        await axios.post(`${API_BASE}/backups/${filename}/restore`, {}, { headers })

        ElMessage.success(t.value.config.backup.restoreSuccess)
        await fetchConfig()
      } catch (err: unknown) {
        const msg = getErrorMessage(err, t.value.config.backup.restoreFailed)
        ElMessage.error(msg)
        throw err
      }
    })

  /**
   * Get device display name (with modes.name if available)
   */
  const getDeviceDisplayName = (device: ModbusDevice): string => {
    const name = device.modes?.['name']
    if (typeof name === 'string' && name.trim()) {
      return name
    }
    return `${device.model}_${device.slave_id}`
  }

  return {
    // State
    config,
    backups,
    isLoading,
    error,

    // Computed
    metadata,
    buses,
    devices,
    busList,

    // Actions
    fetchConfig,
    fetchMetadata,
    createOrUpdateBus,
    deleteBus,
    createOrUpdateDevice,
    deleteDevice,
    fetchBackups,
    restoreBackup,
    getDeviceDisplayName,
  }
})
