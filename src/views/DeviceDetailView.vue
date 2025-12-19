<!-- src/views/DeviceDetailView.vue -->
<template>
  <div class="device-detail-container">
    <!-- Back button -->
    <el-page-header @back="handleBack">
      <template #content>
        <div class="page-title">
          <el-icon :size="24">
            <component :is="deviceIcon" />
          </el-icon>
          <span>{{ deviceDisplayName }}</span>
          <el-tag :type="isOnline ? 'success' : 'danger'" size="large">
            {{ isOnline ? 'Online' : 'Offline' }}
          </el-tag>
        </div>
      </template>
    </el-page-header>

    <!-- Loading -->
    <div v-if="!currentDevice" class="loading-container">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      <p>Loading device data...</p>
    </div>

    <!-- Device content -->
    <template v-else>
      <!-- Basic information -->
      <el-row :gutter="16">
        <el-col :span="24">
          <el-card class="info-card">
            <template #header>
              <span class="card-title">Device Information</span>
            </template>
            <el-descriptions :column="3" border>
              <el-descriptions-item label="Device ID">
                {{ currentDevice.deviceId }}
              </el-descriptions-item>
              <el-descriptions-item label="Model">
                {{ currentDevice.model }}
              </el-descriptions-item>
              <el-descriptions-item label="Type">
                {{ currentDevice.type }}
              </el-descriptions-item>
              <el-descriptions-item label="Port">
                {{ currentDevice.port || 'N/A' }}
              </el-descriptions-item>
              <el-descriptions-item label="Slave ID">
                {{ currentDevice.slaveId || 'N/A' }}
              </el-descriptions-item>
              <el-descriptions-item label="Last Updated">
                {{ formatTimestamp(currentDevice.timestamp) }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>
      </el-row>

      <!-- Parameter table -->
      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="24">
          <el-card class="params-card">
            <template #header>
              <div class="card-header">
                <span class="card-title">Live Parameters</span>
                <el-button type="primary" :icon="Refresh" circle @click="handleRefresh" />
              </div>
            </template>

            <el-table :data="parameterList" stripe :height="400" style="width: 100%">
              <el-table-column prop="name" label="Parameter" width="200">
                <template #default="{ row }">
                  <strong>{{ row.label || row.name }}</strong>
                </template>
              </el-table-column>

              <el-table-column prop="value" label="Current Value" width="150" align="right">
                <template #default="{ row }">
                  <span
                    :class="{
                      'valid-value': row.value !== -1,
                      'invalid-value': row.value === -1,
                    }"
                  >
                    {{ formatValue(row.value) }}
                  </span>
                </template>
              </el-table-column>

              <el-table-column prop="unit" label="Unit" width="100" />

              <el-table-column prop="description" label="Description" show-overflow-tooltip />

              <el-table-column label="Status" width="100" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.value === -1" type="danger" size="small"> Invalid </el-tag>
                  <el-tag v-else type="success" size="small"> OK </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <!-- Trend chart -->
      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="24">
          <el-card class="chart-card">
            <template #header>
              <div class="card-header">
                <span class="card-title">Parameter Trends</span>
                <el-select
                  v-model="selectedParams"
                  multiple
                  placeholder="Select parameters to display"
                  style="width: 300px"
                  :max-collapse-tags="3"
                >
                  <el-option
                    v-for="param in chartableParams"
                    :key="param.name"
                    :label="param.label"
                    :value="param.name"
                  />
                </el-select>
              </div>
            </template>

            <div ref="chartRef" style="height: 400px"></div>
          </el-card>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDashboard } from '@/composables/useDashboard'
import { Loading, Refresh, MagicStick, Monitor } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'

const route = useRoute()
const router = useRouter()

// Share WebSocket data from Dashboard
const { devices } = useDashboard()

const deviceId = computed(() => route.params.deviceId as string)

// Current device
const currentDevice = computed(() => devices.value.find((d) => d.deviceId === deviceId.value))

// Device icon
const deviceIcon = computed(() => {
  if (currentDevice.value?.type === 'inverter') return MagicStick
  return Monitor
})

// Display name
const deviceDisplayName = computed(() => currentDevice.value?.displayName || deviceId.value)

// Online status
const isOnline = computed(() => currentDevice.value?.is_online ?? false)

// Parameter list
const parameterList = computed(() => {
  if (!currentDevice.value?.data) return []

  return Object.entries(currentDevice.value.data).map(([name, param]: [string, any]) => ({
    name,
    label: param.label || name,
    value: param.value,
    unit: param.unit || '',
    description: param.description || '',
  }))
})

// Chartable parameters (exclude -1 and non-numeric)
const chartableParams = computed(() => {
  return parameterList.value.filter((p) => typeof p.value === 'number' && p.value !== -1)
})

// Selected parameters
const selectedParams = ref<string[]>([])

// History data (latest 100 points)
const historyData = ref<Map<string, Array<{ timestamp: number; value: number }>>>(new Map())

// Chart instance
const chartRef = ref<HTMLElement>()
let chartInstance: ECharts | null = null

// Initialize chart
const initChart = () => {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)
  updateChart()
}

// Update chart
const updateChart = () => {
  if (!chartInstance || selectedParams.value.length === 0) {
    chartInstance?.clear()
    return
  }

  const series = selectedParams.value.map((paramName) => {
    const param = parameterList.value.find((p) => p.name === paramName)
    const history = historyData.value.get(paramName) || []

    return {
      name: param?.label || paramName,
      type: 'line',
      smooth: true,
      data: history.map((h) => [h.timestamp, h.value]),
      symbol: 'circle',
      symbolSize: 6,
    }
  })

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
      },
    },
    legend: {
      data: series.map((s) => s.name),
      bottom: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      axisLabel: {
        formatter: '{HH}:{mm}:{ss}',
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: '{value}',
      },
    },
    series,
  }

  chartInstance.setOption(option)
}

// Watch device data updates
watch(
  currentDevice,
  (newDevice) => {
    if (!newDevice) return

    // Update history data
    Object.entries(newDevice.data || {}).forEach(([name, param]: [string, any]) => {
      if (typeof param.value === 'number' && param.value !== -1) {
        if (!historyData.value.has(name)) {
          historyData.value.set(name, [])
        }

        const history = historyData.value.get(name)!
        history.push({
          timestamp: Date.now(),
          value: param.value,
        })

        // Keep the latest 100 points
        if (history.length > 100) {
          history.shift()
        }
      }
    })

    // Update chart
    updateChart()
  },
  { deep: true },
)

// Watch selected parameters
watch(selectedParams, () => {
  updateChart()
})

// Initialize selected parameters (pick first 3)
watch(
  chartableParams,
  (params) => {
    if (params.length > 0 && selectedParams.value.length === 0) {
      selectedParams.value = params.slice(0, 3).map((p) => p.name)
    }
  },
  { immediate: true },
)

// Back
const handleBack = () => {
  router.push('/dashboard')
}

// Refresh (actually updated automatically via WebSocket)
const handleRefresh = () => {
  // WebSocket pushes latest data automatically; this is just visual feedback
  console.log('Refresh requested')
}

// Format value
const formatValue = (value: number | undefined) => {
  if (value === undefined || value === null || value === -1) {
    return 'N/A'
  }
  return value.toString()
}

// Format timestamp
const formatTimestamp = (ts: string) => {
  if (!ts) return 'N/A'
  return new Date(ts).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

onMounted(() => {
  initChart()
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
</script>

<style scoped>
.device-detail-container {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 20px;
  font-weight: 500;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 20px;
  color: #909399;
}

.loading-container p {
  margin-top: 16px;
  font-size: 14px;
}

.card-title {
  font-size: 16px;
  font-weight: 500;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-card,
.params-card,
.chart-card {
  margin-top: 16px;
}

.valid-value {
  color: #67c23a;
  font-weight: 500;
}

.invalid-value {
  color: #f56c6c;
  font-weight: 500;
}
</style>
