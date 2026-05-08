import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getMqttConfig,
  getMqttStatus,
  patchMqttConfig,
  restartMqttService,
  type MqttConfig,
  type MqttConfigPatch,
  type MqttStatus,
} from '@/services/mqtt'

export const useMqttStore = defineStore('mqtt', () => {
  const config = ref<MqttConfig | null>(null)
  const status = ref<MqttStatus | null>(null)
  const loadingConfig = ref(false)
  const loadingStatus = ref(false)
  const saving = ref(false)
  const restarting = ref(false)
  const restartRequired = ref(false)
  const configLoaded = ref(false)
  const configLoadError = ref<string | null>(null)

  const loadConfig = async () => {
    loadingConfig.value = true
    configLoadError.value = null
    try {
      config.value = await getMqttConfig()
      configLoaded.value = true
    } catch (error) {
      configLoaded.value = false
      config.value = null
      configLoadError.value = 'Failed to load MQTT config'
      ElMessage.error(configLoadError.value)
      throw error
    } finally {
      loadingConfig.value = false
    }
  }

  const loadStatus = async () => {
    loadingStatus.value = true
    try {
      status.value = await getMqttStatus()
    } catch (error) {
      ElMessage.error('Failed to load MQTT status')
      throw error
    } finally {
      loadingStatus.value = false
    }
  }

  const saveConfig = async (payload: MqttConfigPatch) => {
    saving.value = true
    try {
      config.value = await patchMqttConfig(payload)
      restartRequired.value = true
      ElMessage.success('MQTT config saved')
    } catch (error) {
      ElMessage.error('Failed to save MQTT config')
      throw error
    } finally {
      saving.value = false
    }
  }

  const restartService = async () => {
    restarting.value = true
    try {
      await restartMqttService()
      restartRequired.value = false
      ElMessage.success('Talos restart requested')
    } catch (error) {
      ElMessage.error('Failed to restart Talos')
      throw error
    } finally {
      restarting.value = false
    }
  }

  return {
    config,
    status,
    loadingConfig,
    loadingStatus,
    saving,
    restarting,
    restartRequired,
    configLoaded,
    configLoadError,
    loadConfig,
    loadStatus,
    saveConfig,
    restartService,
  }
})
