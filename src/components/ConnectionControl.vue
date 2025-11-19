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

    <!-- 設備 ID - 下拉選單 -->
    <el-form :model="form" label-width="100px" label-position="left">
      <el-form-item :label="t.connection.deviceId">
        <el-select
          v-model="form.deviceId"
          :placeholder="t.connection.deviceIdPlaceholder"
          :loading="devicesLoading"
          filterable
          style="width: 100%"
          @focus="loadDevices"
          @change="handleDeviceChange"
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

      <!-- 輪詢間隔 -->
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

      <!-- 自動重連 -->
      <el-form-item :label="t.connection.autoReconnect">
        <el-switch v-model="form.autoReconnect" />
      </el-form-item>

      <!-- 參數選擇 -->
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

      <!-- 連接/中斷按鈕 -->
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

    <!-- 連接狀態資訊 -->
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

    <!-- 裝置約束資訊 -->
    <template v-if="deviceConstraints && Object.keys(deviceConstraints).length > 0">
      <el-divider />
      <div class="constraints-section">
        <div class="section-title">{{ t.connection.constraintsTitle }}</div>
        <el-table :data="constraintsTableData" size="small" border stripe>
          <el-table-column prop="parameter" :label="t.connection.parameters" width="150" />
          <el-table-column prop="min" :label="t.connection.minValue" align="center">
            <template #default="scope">
              <el-tag v-if="scope.row.min !== undefined" type="info" size="small">
                {{ scope.row.min }}
              </el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="max" :label="t.connection.maxValue" align="center">
            <template #default="scope">
              <el-tag v-if="scope.row.max !== undefined" type="info" size="small">
                {{ scope.row.max }}
              </el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>
    <template v-else-if="form.deviceId">
      <el-divider />
      <el-empty :description="t.connection.noConstraints" :image-size="80" />
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Connection, CloseBold, Refresh } from '@element-plus/icons-vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { useI18n } from '@/composables/useI18n'
import type { Device, DeviceDetails } from '@/types'
import api from '@/services/api'

// ==================== Composables ====================
const { t } = useI18n()
const { isConnected, isConnecting, connectionConfig, stats, connect, disconnect } = useWebSocket()

// ==================== 資料 ====================
const form = ref({
  deviceId: '',
  interval: 10.0,
  autoReconnect: true,
  parameters: [] as string[],
})

const availableDevices = ref<Device[]>([])
const devicesLoading = ref(false)

const availableParameters = ref<string[]>([
  'DIn01',
  'DIn02',
  'DIn03',
  'DIn04',
  'DOut01',
  'DOut02',
  'AIn01',
  'AIn02',
  'AIn03',
  'AIn04',
])

const connectionTime = ref<string>('')
const deviceConstraints = ref<Record<string, { min?: number; max?: number }> | null>(null)

// ==================== Computed Properties ====================
const constraintsTableData = computed(() => {
  if (!deviceConstraints.value) return []

  return Object.entries(deviceConstraints.value).map(([parameter, constraint]) => ({
    parameter,
    min: constraint.min,
    max: constraint.max,
  }))
})

// ==================== 載入設備列表 ====================
const loadDevices = async () => {
  if (availableDevices.value.length > 0) return // 已經載入過了

  devicesLoading.value = true
  try {
    const response = await api.get('/devices/')
    availableDevices.value = response.data.devices || response.data || []
    console.log('[ConnectionControl] Loaded devices:', availableDevices.value)
  } catch (error) {
    // ✅ 修正：明確指定 error 類型
    const err = error as Error
    console.error('[ConnectionControl] Failed to load devices:', err)
    ElMessage.error(`載入設備列表失敗: ${err.message}`)
  } finally {
    devicesLoading.value = false
  }
}

// ==================== 載入設備詳細資訊（包含約束） ====================
const loadDeviceDetails = async (deviceId: string) => {
  try {
    const response = await api.get<DeviceDetails>(`/devices/${deviceId}`)
    const deviceDetails = response.data

    // 更新約束資訊
    deviceConstraints.value = deviceDetails.constraints || null

    console.log('[ConnectionControl] Loaded device details:', deviceDetails)
    console.log('[ConnectionControl] Device constraints:', deviceConstraints.value)
  } catch (error) {
    const err = error as Error
    console.error('[ConnectionControl] Failed to load device details:', err)
    // 重置約束資訊
    deviceConstraints.value = null
  }
}

// ==================== 設備變更處理 ====================
const handleDeviceChange = async (deviceId: string) => {
  if (deviceId) {
    await loadDeviceDetails(deviceId)
  } else {
    deviceConstraints.value = null
  }
}

// ==================== 連接處理 ====================
const handleConnect = async () => {
  if (!form.value.deviceId) {
    ElMessage.warning('請選擇設備 ID')
    return
  }

  try {
    await connect({
      mode: 'single',
      deviceId: form.value.deviceId,
      interval: form.value.interval,
      parameters: form.value.parameters.length > 0 ? form.value.parameters : undefined,
      autoReconnect: form.value.autoReconnect,
    })

    connectionTime.value = new Date().toLocaleString('zh-TW')
    ElMessage.success(t.value.connection.connectionSuccess)
  } catch (error) {
    // ✅ 修正：明確指定 error 類型
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
    // ✅ 修正：明確指定 error 類型
    const err = error as Error
    ElMessage.error(`中斷連接失敗: ${err.message}`)
  }
}

const handleReconnect = async () => {
  await handleDisconnect()
  setTimeout(() => {
    handleConnect()
  }, 500)
}

// ==================== 生命週期 ====================
onMounted(() => {
  // 自動載入設備列表
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

  .constraints-section {
    margin-top: 12px;

    .section-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--el-text-color-primary);
    }
  }
}
</style>
