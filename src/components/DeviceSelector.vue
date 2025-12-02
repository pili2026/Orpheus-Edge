<template>
  <el-card class="device-selector">
    <template #header>
      <div class="card-header">
        <span>Device Selection</span>
        <el-button :icon="Refresh" size="small" :loading="isLoading" @click="loadDevices">
          Reload
        </el-button>
      </div>
    </template>

    <div v-if="isLoading" class="loading-state">
      <el-skeleton :rows="3" animated />
    </div>

    <div v-else-if="error" class="error-state">
      <el-alert
        title="Failed to Load"
        type="error"
        :description="error"
        show-icon
        :closable="false"
      >
        <template #default>
          <el-button size="small" @click="loadDevices"> Retry </el-button>
        </template>
      </el-alert>
    </div>

    <div v-else-if="devices.length === 0" class="empty-state">
      <el-empty description="No Available Devices" />
    </div>

    <div v-else class="device-list">
      <div
        v-for="device in devices"
        :key="device.device_id"
        class="device-item"
        :class="{ 'is-selected': device.device_id === selectedDeviceId }"
        @click="selectDevice(device)"
      >
        <div class="device-info">
          <div class="device-name">
            <el-icon><Monitor /></el-icon>
            <span>{{ device.device_id }}</span>
          </div>
          <div class="device-model">
            <el-tag size="small" type="info">
              {{ device.model }}
            </el-tag>
          </div>
        </div>

        <div class="device-details">
          <div class="detail-row">
            <span class="detail-label">Port:</span>
            <span class="detail-value">{{ device.port }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Slave Address:</span>
            <span class="detail-value">{{ device.slave_address }}</span>
          </div>
          <div v-if="device.description" class="detail-row">
            <span class="detail-label">Description:</span>
            <span class="detail-value">{{ device.description }}</span>
          </div>
        </div>

        <div class="device-actions">
          <el-button
            v-if="device.device_id !== selectedDeviceId"
            size="small"
            type="primary"
            @click.stop="selectDevice(device)"
          >
            Select
          </el-button>
          <el-tag v-else size="small" type="success" effect="dark"> Selected </el-tag>
        </div>
      </div>
    </div>

    <el-divider v-if="devices.length > 0" />

    <div v-if="selectedDevice" class="selected-info">
      <el-descriptions title="Selected Device" :column="2" size="small" border>
        <el-descriptions-item label="Device ID">
          {{ selectedDevice.device_id }}
        </el-descriptions-item>
        <el-descriptions-item label="Model">
          {{ selectedDevice.model }}
        </el-descriptions-item>
        <el-descriptions-item label="Port">
          {{ selectedDevice.port }}
        </el-descriptions-item>
        <el-descriptions-item label="Slave Address">
          {{ selectedDevice.slave_address }}
        </el-descriptions-item>
      </el-descriptions>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Monitor } from '@element-plus/icons-vue'
import { logger } from '@/utils/logger'
import type { Device } from '@/types'
import { deviceService } from '@/services/device'

// Props & Emits
interface Props {
  modelValue?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [deviceId: string]
  select: [device: Device]
}>()

// State
const devices = ref<Device[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const selectedDeviceId = ref<string | undefined>(props.modelValue)

// Computed
const selectedDevice = computed(() => {
  return devices.value.find((d) => d.device_id === selectedDeviceId.value)
})

// Load device list
async function loadDevices() {
  isLoading.value = true
  error.value = null

  try {
    logger.info('Start loading device list')
    const response = await deviceService.getAllDevices(false)
    devices.value = response.devices || []
    logger.success('Successfully loaded device list', { count: devices.value.length })

    if (devices.value.length === 0) {
      ElMessage.warning('No devices found')
    } else {
      ElMessage.success(`Loaded ${devices.value.length} devices`)
    }

    // Clear selection if modelValue no longer exists
    if (selectedDeviceId.value && !selectedDevice.value) {
      selectedDeviceId.value = undefined
      emit('update:modelValue', '')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load devices'
    logger.error('Failed to load device list', err)
    ElMessage.error('Failed to load devices: ' + error.value)
  } finally {
    isLoading.value = false
  }
}

// Select a device
function selectDevice(device: Device) {
  selectedDeviceId.value = device.device_id
  emit('update:modelValue', device.device_id)
  emit('select', device)
  logger.info('Device selected', { deviceId: device.device_id })
  ElMessage.success(`Selected Device: ${device.device_id}`)
}

// Clear selection
function clearSelection() {
  selectedDeviceId.value = undefined
  emit('update:modelValue', '')
}

// Load on mount
onMounted(() => {
  loadDevices()
})

// Expose methods to parent
defineExpose({
  loadDevices,
  clearSelection,
})
</script>

<style scoped>
.device-selector {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.loading-state,
.error-state,
.empty-state {
  padding: 40px 20px;
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.device-item {
  padding: 15px;
  border: 2px solid #ebeef5;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  background: #ffffff;
}

.device-item:hover {
  border-color: #409eff;
  box-shadow: 0 2px 12px 0 rgba(64, 158, 255, 0.2);
  transform: translateY(-2px);
}

.device-item.is-selected {
  border-color: #67c23a;
  background: #f0f9ff;
}

.device-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.device-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.device-details {
  margin-bottom: 12px;
  padding-left: 28px;
}

.detail-row {
  display: flex;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 13px;
}

.detail-label {
  color: #909399;
  min-width: 80px;
}

.detail-value {
  color: #606266;
  font-family: 'Courier New', monospace;
}

.device-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid #ebeef5;
}

.selected-info {
  margin-top: 20px;
}

:deep(.el-descriptions__title) {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
</style>
