import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getMqttConfig,
  getMqttStatus,
  patchMqttConfig,
  restartMqttService,
  registerMqttGateway,
  testOrionConnection as testOrionConnectionApi,
  type MqttConfig,
  type MqttConfigPatch,
  type MqttStatus,
  type OrionConnectionResult,
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
  const statusLoadError = ref<string | null>(null)

  const loadingRegistrationState = ref(false)
  const testingOrion = ref(false)
  const registeringGateway = ref(false)
  const registrationError = ref<string | null>(null)
  const registrationSuccess = ref<string | null>(null)
  const orionTestResult = ref<OrionConnectionResult | null>(null)

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
    statusLoadError.value = null
    try {
      status.value = await getMqttStatus()
    } catch (error) {
      status.value = null
      statusLoadError.value = 'Failed to load MQTT status'
      ElMessage.error(statusLoadError.value)
      throw error
    } finally {
      loadingStatus.value = false
    }
  }

  const loadRegistrationState = async () => {
    loadingRegistrationState.value = true
    registrationError.value = null
    try {
      await Promise.all([loadConfig(), loadStatus()])
    } finally {
      loadingRegistrationState.value = false
    }
  }

  const testOrionConnection = async () => {
    testingOrion.value = true
    registrationError.value = null
    try {
      const result = await testOrionConnectionApi()
      orionTestResult.value = result
      return result
    } catch (error) {
      orionTestResult.value = { reachable: false, message: 'Unable to test Orion connectivity' }
      registrationError.value = 'Unable to test Orion connectivity'
      throw error
    } finally {
      testingOrion.value = false
    }
  }

  const registerGateway = async () => {
    registeringGateway.value = true
    registrationError.value = null
    registrationSuccess.value = null
    try {
      const result = await registerMqttGateway()
      registrationSuccess.value = result.message || 'Gateway registration succeeded'
      if (result.restart_required) {
        restartRequired.value = true
      }
      try {
        await Promise.all([loadConfig(), loadStatus()])
      } catch {
        ElMessage.warning('Gateway registered, but failed to refresh MQTT state')
      }
      return result
    } catch (error) {
      registrationError.value = 'Gateway registration failed. Please try again.'
      throw error
    } finally {
      registeringGateway.value = false
    }
  }

  const registrationState = computed(() => ({
    registered: config.value?.credentials?.registered ?? status.value?.registered ?? null,
    gatewayId: config.value?.credentials?.gateway_id ?? null,
    username: config.value?.credentials?.username ?? null,
    passwordConfigured: config.value?.credentials?.password_configured ?? null,
    mqttEnabled: config.value?.enabled ?? null,
    connected: status.value?.connected ?? null,
    lastConnectionError: status.value?.last_connection_error ?? null,
  }))

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
    statusLoadError,
    loadingRegistrationState,
    testingOrion,
    registeringGateway,
    registrationError,
    registrationSuccess,
    orionTestResult,
    registrationState,
    loadConfig,
    loadStatus,
    loadRegistrationState,
    testOrionConnection,
    registerGateway,
    saveConfig,
    restartService,
  }
})
