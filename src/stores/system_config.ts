import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'

export interface SystemConfigInfo {
  monitor_interval_seconds: number
  control_interval_seconds?: number | null
  alert_interval_seconds?: number | null
  device_id_series: number
  reverse_ssh_port: number
  reverse_ssh_port_source: string
}

export interface SystemConfigUpdateRequest {
  monitor_interval_seconds: number
  control_interval_seconds?: number | null
  alert_interval_seconds?: number | null
  device_id_series: number
}

export const useSystemConfigStore = defineStore('systemConfig', () => {
  const currentConfig = ref<SystemConfigInfo | null>(null)
  const isLoading = ref(false)

  /** Read the stored config without touching `currentConfig`. */
  const readConfig = async () => {
    const response = await axios.get<{ status: string; config: SystemConfigInfo }>(
      '/api/config/system',
    )
    return response.data.config
  }

  const fetchConfig = async () => {
    isLoading.value = true
    try {
      currentConfig.value = await readConfig()
    } catch (error) {
      console.error('Failed to fetch system config:', error)
      ElMessage.error('載入系統設定失敗')
    } finally {
      isLoading.value = false
    }
  }

  const updateConfig = async (req: SystemConfigUpdateRequest) => {
    try {
      await axios.post('/api/config/system', req)
      await fetchConfig()
    } catch (error) {
      console.error('Failed to update system config:', error)
      ElMessage.error('更新系統設定失敗')
      throw error
    }
  }

  return {
    currentConfig,
    isLoading,
    readConfig,
    fetchConfig,
    updateConfig,
  }
})
