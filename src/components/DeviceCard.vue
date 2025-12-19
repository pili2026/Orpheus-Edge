<!-- src/components/DeviceCard.vue -->
<template>
  <el-card
    class="device-card"
    :class="{
      'is-offline': !device.is_online,
      'is-clickable': clickable,
    }"
    shadow="hover"
  >
    <template #header>
      <div class="card-header">
        <div class="device-title">
          <el-icon :size="20">
            <Monitor />
          </el-icon>
          <span class="device-name">{{ deviceName }}</span>
        </div>
        <el-tag :type="device.is_online ? 'success' : 'danger'" size="small">
          {{ device.is_online ? 'Online' : 'Offline' }}
        </el-tag>
      </div>
    </template>

    <!-- Key Parameters -->
    <div v-if="keyParams.length > 0" class="device-params">
      <div v-for="param in keyParams" :key="param.key" class="param-item">
        <span class="param-label">{{ param.label }}</span>
        <span class="param-value" :class="{ 'is-invalid': param.value === -1 }">
          {{ formatValue(param.value, param.unit) }}
        </span>
      </div>
    </div>

    <!-- No parameters available -->
    <div v-else class="no-params">
      <p>No parameter data</p>
    </div>

    <!-- Last updated time -->
    <div class="card-footer">
      <el-icon><Clock /></el-icon>
      <span class="timestamp">{{ formatTimestamp(device.timestamp) }}</span>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Clock, Monitor } from '@element-plus/icons-vue'

interface Props {
  device: any
  clickable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  clickable: true,
})

const deviceName = computed(() => {
  return props.device.displayName || props.device.deviceId || 'Unknown'
})

// ✅ Extract key parameters (up to 4)
const keyParams = computed(() => {
  const data = props.device.data || {}

  // Priority order for parameters
  const priorityKeys = ['HZ', 'KW', 'VOLTAGE', 'CURRENT', 'RPM', 'TEMP']

  const allParams = Object.entries(data).map(([key, param]: [string, any]) => ({
    key,
    label: param.label || key,
    value: param.value,
    unit: param.unit || '',
  }))

  // Sort by priority
  const sorted = allParams.sort((a, b) => {
    const aIndex = priorityKeys.findIndex((k) => a.key.toUpperCase().includes(k))
    const bIndex = priorityKeys.findIndex((k) => b.key.toUpperCase().includes(k))

    if (aIndex === -1 && bIndex === -1) return 0
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  return sorted.slice(0, 4)
})

const formatValue = (value: number | undefined, unit: string = '') => {
  if (value === undefined || value === null || value === -1) {
    return 'N/A'
  }
  return `${value} ${unit}`.trim()
}

const formatTimestamp = (ts: string) => {
  if (!ts) return 'N/A'
  const date = new Date(ts)
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
</script>

<style scoped>
.device-card {
  height: 100%;
  transition: all 0.3s;
}

.device-card.is-clickable {
  cursor: pointer;
}

.device-card.is-offline {
  opacity: 0.7;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.device-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 16px;
}

.device-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.device-params {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 8px 0;
}

.param-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-label {
  font-size: 12px;
  color: #909399;
}

.param-value {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
}

.param-value.is-invalid {
  color: #f56c6c;
}

.no-params {
  padding: 20px;
  text-align: center;
  color: #909399;
}

.card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
  font-size: 12px;
  color: #909399;
}

.timestamp {
  font-family: monospace;
}
</style>
