<template>
  <el-card class="connection-control">
    <template #header>
      <div class="card-header">
        <el-icon><Connection /></el-icon>
        <span>{{ t.connection.title }}</span>
        <el-tag v-if="isConnected" type="success" size="small">
          {{ t.connection.connected }}
        </el-tag>
        <el-tag v-else type="info" size="small">
          {{ t.connection.disconnected }}
        </el-tag>
      </div>
    </template>

    <!-- Device ID - dropdown -->
    <el-form :model="form" label-width="100px" label-position="left">
      <el-form-item :label="t.connection.deviceId">
        <el-select
          v-model="form.deviceId"
          :placeholder="t.connection.deviceIdPlaceholder"
          :loading="devicesLoading"
          filterable
          style="width: 100%"
          @focus="loadDevices"
          @change="handleDeviceSelect"
        >
          <el-option
            v-for="device in availableDevices"
            :key="device.device_id"
            :label="device.device_id"
            :value="device.device_id"
          >
            <span>{{ device.device_id }}</span>
            <span
              v-if="device.description"
              style="color: var(--el-text-color-secondary); margin-left: 8px"
            >
              - {{ device.description }}
            </span>
          </el-option>
        </el-select>
      </el-form-item>

      <!-- Polling interval -->
      <el-form-item :label="t.connection.interval">
        <el-input-number
          v-model="form.interval"
          :min="0.1"
          :max="60"
          :step="0.1"
          :precision="1"
          style="width: 180px"
        />
        <span style="margin-left: 8px">{{ t.connection.intervalUnit }}</span>
      </el-form-item>

      <!-- Auto reconnect -->
      <el-form-item :label="t.connection.autoReconnect">
        <el-switch v-model="form.autoReconnect" />
      </el-form-item>

      <!-- Parameter selection -->
      <el-form-item :label="t.connection.parameters">
        <el-select
          v-model="form.parameters"
          multiple
          :placeholder="t.connection.parametersPlaceholder"
          style="width: 100%"
          clearable
        >
          <el-option
            v-for="param in availableParameters"
            :key="param"
            :label="param"
            :value="param"
          />
        </el-select>
      </el-form-item>

      <!-- Connect / Disconnect buttons -->
      <el-form-item>
        <el-button
          v-if="!isConnected"
          type="primary"
          :icon="Connection"
          :loading="isConnecting"
          :disabled="!form.deviceId"
          @click="handleConnect"
        >
          {{ t.connection.connect }}
        </el-button>
        <el-button v-else type="danger" :icon="CloseBold" @click="handleDisconnect">
          {{ t.connection.disconnect }}
        </el-button>
        <el-button v-if="isConnected" :icon="Refresh" @click="handleReconnect">
          {{ t.connection.reconnect }}
        </el-button>
      </el-form-item>
    </el-form>

    <!-- Connection status info -->
    <el-divider />
    <el-descriptions :column="2" border size="small">
      <el-descriptions-item :label="t.connection.status">
        <el-tag v-if="isConnecting" type="warning">
          {{ t.connection.connecting }}
        </el-tag>
        <el-tag v-else-if="isConnected" type="success">
          {{ t.connection.connected }}
        </el-tag>
        <el-tag v-else type="info">
          {{ t.connection.disconnected }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item :label="t.connection.deviceId">
        {{ connectionConfig?.deviceId || '-' }}
      </el-descriptions-item>
      <el-descriptions-item :label="t.connection.connectionTime">
        {{ connectionTime || '-' }}
      </el-descriptions-item>
      <el-descriptions-item :label="t.connection.messagesReceived">
        {{ stats?.messages_received || 0 }}
      </el-descriptions-item>
    </el-descriptions>

    <!-- Device constraints -->
    <template v-if="form.deviceId && deviceDetails">
      <el-divider content-position="left">
        <span style="font-size: 14px; font-weight: 600">{{ t.connection.deviceConstraints }}</span>
      </el-divider>
      <div v-if="deviceDetails.constraints && Object.keys(deviceDetails.constraints).length > 0">
        <el-descriptions :column="2" border size="small" v-loading="detailsLoading">
          <el-descriptions-item
            v-for="(constraint, paramName) in deviceDetails.constraints"
            :key="paramName"
            :label="paramName"
          >
            <span v-if="constraint.min !== undefined || constraint.max !== undefined">
              <el-tag type="info" size="small" style="margin-right: 4px">
                {{ t.connection.min }}: {{ constraint.min ?? 'N/A' }}
              </el-tag>
              <el-tag type="info" size="small">
                {{ t.connection.max }}: {{ constraint.max ?? 'N/A' }}
              </el-tag>
            </span>
            <span v-else>-</span>
          </el-descriptions-item>
        </el-descriptions>
      </div>
      <el-alert v-else type="info" :closable="false" show-icon style="margin-top: 8px">
        {{ t.connection.noConstraints }}
      </el-alert>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Connection, CloseBold, Refresh } from '@element-plus/icons-vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { useDataStore } from '@/stores/data'

import { useI18n } from '@/composables/useI18n'
import type { Device, DeviceDetails } from '@/types'
import api from '@/services/api'
import { deviceService } from '@/services/device'
import { websocketService } from '@/services/websocket'

// ==================== Composables ====================
const { t } = useI18n()
const { isConnected, isConnecting, connectionConfig, stats, connect, disconnect } = useWebSocket()
const dataStore = useDataStore()

// ==================== State ====================
const form = ref({
  deviceId: '',
  interval: 10.0,
  autoReconnect: true,
  parameters: [] as string[],
})

const availableDevices = ref<Device[]>([])
const devicesLoading = ref(false)
const availableParameters = computed(() => {
  const deviceId = form.value.deviceId
  if (!deviceId) return []
  return dataStore.deviceParameters[deviceId] || []
})

const connectionTime = ref<string>('')
const deviceDetails = ref<DeviceDetails | null>(null)
const detailsLoading = ref(false)

// ==================== Load device list ====================
const loadDevices = async () => {
  if (availableDevices.value.length > 0) return // Already loaded

  devicesLoading.value = true
  try {
    const response = await deviceService.getAllDevices(false)
    availableDevices.value = response.devices || []
    console.log('[ConnectionControl] Loaded devices:', availableDevices.value)
  } catch (error) {
    const err = error as Error
    console.error('[ConnectionControl] Failed to load devices:', err)
    ElMessage.error(`Failed to load device list: ${err.message}`)
  } finally {
    devicesLoading.value = false
  }
}

// ==================== Connection handlers ====================
const handleConnect = async () => {
  if (!form.value.deviceId) {
    ElMessage.warning('Please select a device ID')
    return
  }

  try {
    websocketService.allowReconnection()

    await connect({
      mode: 'single',
      deviceId: form.value.deviceId,
      interval: form.value.interval,
      parameters: form.value.parameters.length > 0 ? form.value.parameters : undefined,
      autoReconnect: form.value.autoReconnect,
    })

    connectionTime.value = new Date().toLocaleString('zh-TW')
  } catch (error) {
    const err = error as Error
    ElMessage.error(`${t.value.connection.connectionFailed}: ${err.message}`)
  }
}

const handleDisconnect = async () => {
  try {
    await disconnect()
    connectionTime.value = ''
    ElMessage.info(t.value.connection.disconnectSuccess)
  } catch (error) {
    const err = error as Error
    ElMessage.error(`Failed to disconnect: ${err.message}`)
  }
}

const handleReconnect = async () => {
  await handleDisconnect()
  setTimeout(() => {
    handleConnect()
  }, 500)
}

const handleDeviceSelect = async (deviceId: string) => {
  if (!deviceId) return

  try {
    const response = await api.get(`/devices/${deviceId}`)
    if (response.data.available_parameters) {
      dataStore.setDeviceParameters(deviceId, response.data.available_parameters)
    }
  } catch (error) {
    console.error('Failed to get device parameters:', error)
  }
}

// ==================== Load device constraints ====================
const loadDeviceConstraints = async (deviceId: string) => {
  if (!deviceId) {
    deviceDetails.value = null
    return
  }
  detailsLoading.value = true
  try {
    deviceDetails.value = await deviceService.getDeviceConstraints(deviceId)
    console.log('[ConnectionControl] Loaded device details:', deviceDetails.value)
    console.log('[ConnectionControl] Device constraints:', deviceDetails.value?.constraints)
    console.log(
      '[ConnectionControl] Constraints keys:',
      deviceDetails.value?.constraints ? Object.keys(deviceDetails.value.constraints) : 'null',
    )
  } catch (error) {
    const err = error as Error
    console.error('[ConnectionControl] Failed to load device details:', err)
    console.error('[ConnectionControl] Error details:', err.message)
    // Do not show error message to the user because this is not a critical feature
  } finally {
    detailsLoading.value = false
  }
}

// ==================== Watchers ====================
watch(
  () => form.value.deviceId,
  (newDeviceId) => {
    if (newDeviceId) {
      loadDeviceConstraints(newDeviceId)
    } else {
      deviceDetails.value = null
    }
  },
)

// ==================== Lifecycle ====================
onMounted(() => {
  // Automatically load device list
  loadDevices()
})
</script>

<style scoped lang="scss">
.connection-control {
  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;

    .el-icon {
      font-size: 18px;
    }

    span {
      flex: 1;
    }
  }

  :deep(.el-form-item) {
    margin-bottom: 18px;
  }

  :deep(.el-select) {
    width: 100%;
  }
}
</style>
