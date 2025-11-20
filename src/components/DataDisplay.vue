<template>
  <el-card class="data-display">
    <template #header>
      <div class="card-header">
        <span>{{ t.dataDisplay.title }}</span>
        <div class="header-actions">
          <el-tag v-if="lastUpdateTime" type="info" size="small">
            {{ t.dataDisplay.lastUpdate }}: {{ formatTimeShort(lastUpdateTime) }}
          </el-tag>
          <el-button :icon="Refresh" size="small" circle @click="handleRefresh" />
        </div>
      </div>
    </template>

    <div v-if="!hasData" class="empty-state">
      <el-empty :description="t.dataDisplay.noData">
        <el-text type="info">{{ t.dataDisplay.connectDeviceHint }}</el-text>
      </el-empty>
    </div>

    <div v-else class="data-grid">
      <div v-for="(item, key) in displayData" :key="key" class="data-item">
        <el-card shadow="hover" :body-style="{ padding: '15px' }">
          <div class="parameter-name">
            {{ key }}
          </div>
          <div class="parameter-value">
            <span class="value-number">
              {{ renderValueNumber(key, item.value) }}
            </span>
            <span v-if="item.unit" class="value-unit">
              {{ item.unit }}
            </span>
          </div>
          <div class="parameter-meta">
            <el-tag :type="getValueType(key, item.value)" size="small" effect="plain">
              {{ getValueLabel(key, item.value) }}
            </el-tag>
            <span v-if="item.timestamp" class="timestamp">
              {{ formatTimeShort(item.timestamp) }}
            </span>
          </div>
          <div v-if="showTrend" class="parameter-trend">
            <el-icon :color="getTrendColor(key)">
              <component :is="getTrendIcon(key)" />
            </el-icon>
            <span class="trend-text">{{ getTrendText(key) }}</span>
          </div>
        </el-card>
      </div>
    </div>

    <template v-if="hasData" #footer>
      <div class="data-footer">
        <el-space wrap>
          <el-tag size="small">
            <el-icon><InfoFilled /></el-icon>
            {{ t.dataDisplay.parameterCount }}: {{ paramCount }}
          </el-tag>
          <el-tag size="small" type="success">
            <el-icon><Clock /></el-icon>
            {{ t.dataDisplay.updateRate }}: {{ updateRate }} {{ t.dataDisplay.updateRateUnit }}
          </el-tag>
          <el-tag size="small" :type="freshnessType">
            <el-icon><Select /></el-icon>
            {{ t.dataDisplay.dataFreshness }}: {{ freshnessText }}
          </el-tag>
        </el-space>
      </div>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import {
  Refresh,
  InfoFilled,
  Clock,
  Select,
  ArrowUp,
  ArrowDown,
  Minus,
} from '@element-plus/icons-vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { useDataStore } from '@/stores/data'
import { useI18n } from '@/composables/useI18n'
import { formatTimestamp } from '@/utils/formatter'
import type { PrimitiveValue } from '@/types'

const { t } = useI18n()
const { connectionConfig } = useWebSocket()
const dataStore = useDataStore()

interface Props {
  showTrend?: boolean
}

withDefaults(defineProps<Props>(), {
  showTrend: true,
})

const lastUpdateTime = ref<string>()
const updateCount = ref(0)
const updateRate = ref(0)
const history = ref<Map<string, PrimitiveValue[]>>(new Map())

const deviceId = computed(() => connectionConfig.value?.deviceId)

const currentData = computed(() => {
  const id = deviceId.value
  if (!id) return null
  return dataStore.latestData[id]
})

const hasData = computed(() => {
  return currentData.value !== null && currentData.value !== undefined
})

const displayData = computed(() => {
  if (!currentData.value?.data) return {}

  const result: Record<string, { value: PrimitiveValue; unit?: string; timestamp?: string }> = {}

  for (const [key, paramData] of Object.entries(currentData.value.data)) {
    const param = paramData as { value: PrimitiveValue; unit?: string }
    result[key] = {
      value: param.value,
      unit: param.unit,
      timestamp: currentData.value.timestamp,
    }
  }

  return result
})

const paramCount = computed(() => Object.keys(displayData.value).length)

const freshnessType = computed(() => {
  if (!lastUpdateTime.value) return 'info'

  const now = new Date()
  const last = new Date(lastUpdateTime.value)
  const diffSeconds = (now.getTime() - last.getTime()) / 1000

  if (diffSeconds < 5) return 'success'
  if (diffSeconds < 30) return 'warning'
  return 'danger'
})

const freshnessText = computed(() => {
  const type = freshnessType.value
  if (type === 'success') return 'Fresh'
  if (type === 'warning') return 'Stale'
  return 'Expired'
})

watch(
  () => {
    const id = deviceId.value
    if (!id) return null
    return dataStore.latestData[id]
  },
  (newData) => {
    if (!newData) return

    lastUpdateTime.value = newData.timestamp
    updateCount.value++

    if (newData.data) {
      for (const [key, paramData] of Object.entries(newData.data)) {
        const param = paramData as { value: PrimitiveValue; unit?: string }
        const value = param.value

        if (!history.value.has(key)) {
          history.value.set(key, [])
        }
        const hist = history.value.get(key)!
        hist.push(value)

        if (hist.length > 10) {
          hist.shift()
        }
      }
    }
  },
  { deep: true },
)

let rateInterval: ReturnType<typeof setInterval> | null = null

function startRateCalculation() {
  let lastCount = 0

  rateInterval = setInterval(() => {
    const diff = updateCount.value - lastCount
    updateRate.value = diff
    lastCount = updateCount.value
  }, 1000)
}

function stopRateCalculation() {
  if (rateInterval) {
    clearInterval(rateInterval)
    rateInterval = null
  }
}

startRateCalculation()

onUnmounted(() => {
  stopRateCalculation()
})

function getValueType(
  paramName: string,
  value: PrimitiveValue,
): 'success' | 'warning' | 'info' | 'danger' {
  if (paramName.startsWith('DOut') || paramName.startsWith('DIn')) {
    const n = toNumberOrNull(value)
    if (n === null) return 'info'
    return n > 0 ? 'success' : 'info'
  }
  return 'info'
}

function getValueLabel(paramName: string, value: PrimitiveValue): string {
  if (paramName.startsWith('DOut') || paramName.startsWith('DIn')) {
    const n = toNumberOrNull(value)
    if (n === null) return 'Unknown'
    return n > 0 ? 'ON' : 'OFF'
  }

  if (paramName.startsWith('AIn') || paramName.startsWith('AOut')) {
    const n = toNumberOrNull(value)
    if (n === null) return 'Unknown'
    return n.toFixed(2)
  }

  return String(value)
}

function renderValueNumber(paramName: string, value: PrimitiveValue): string {
  if (paramName.startsWith('DOut') || paramName.startsWith('DIn')) {
    const n = toNumberOrNull(value)
    return n === null ? '-' : String(n)
  }

  if (paramName.startsWith('AIn') || paramName.startsWith('AOut')) {
    const n = toNumberOrNull(value)
    if (n === null) return '-'
    return n.toFixed(2)
  }

  return String(value)
}

function getTrendIcon(key: string) {
  const trend = getTrend(key)
  if (trend > 0) return ArrowUp
  if (trend < 0) return ArrowDown
  return Minus
}

function getTrendColor(key: string): string {
  const trend = getTrend(key)
  if (trend > 0) return '#67C23A'
  if (trend < 0) return '#F56C6C'
  return '#909399'
}

function getTrendText(key: string): string {
  const trend = getTrend(key)
  if (trend > 0) return 'Rising'
  if (trend < 0) return 'Falling'
  return 'Stable'
}

function getTrend(key: string): number {
  const hist = history.value.get(key)
  if (!hist || hist.length < 2) return 0

  const recentValue = hist[hist.length - 1]
  const previousValue = hist[hist.length - 2]

  if (recentValue === undefined || previousValue === undefined) return 0

  const recent = toNumberOrNull(recentValue)
  const previous = toNumberOrNull(previousValue)

  if (recent === null || previous === null) return 0

  const diff = recent - previous
  if (Math.abs(diff) < 0.01) return 0

  return diff > 0 ? 1 : -1
}

function toNumberOrNull(value: PrimitiveValue): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const n = Number(value)
    return isNaN(n) ? null : n
  }
  return null
}

function formatTimeShort(timestamp: string | undefined): string {
  if (!timestamp) return '-'
  return formatTimestamp(timestamp)
}

function handleRefresh() {
  history.value.clear()
  updateCount.value = 0
  updateRate.value = 0
  console.log('[DataDisplay] Data refreshed')
}
</script>

<style scoped lang="scss">
.data-display {
  height: 100%;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .header-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }
  }

  .empty-state {
    padding: 40px 0;
    text-align: center;
  }

  .data-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 15px;
    max-height: 600px;
    overflow-y: auto;
    padding: 5px;

    .data-item {
      .parameter-name {
        font-size: 14px;
        font-weight: 600;
        color: #606266;
        margin-bottom: 8px;
      }

      .parameter-value {
        display: flex;
        align-items: baseline;
        gap: 5px;
        margin-bottom: 10px;

        .value-number {
          font-size: 24px;
          font-weight: bold;
          color: #303133;
        }

        .value-unit {
          font-size: 14px;
          color: #909399;
        }
      }

      .parameter-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;

        .timestamp {
          font-size: 12px;
          color: #909399;
        }
      }

      .parameter-trend {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        color: #909399;

        .trend-text {
          font-size: 12px;
        }
      }
    }
  }

  .data-footer {
    padding-top: 10px;
    border-top: 1px solid #ebeef5;
  }
}
</style>
