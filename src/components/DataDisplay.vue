<template>
  <el-card class="data-display">
    <template #header>
      <div class="card-header">
        <span>📊 即時數據</span>
        <div class="header-actions">
          <el-tag v-if="lastUpdateTime" type="info" size="small">
            最後更新: {{ formatTimeShort(lastUpdateTime) }}
          </el-tag>
          <el-button :icon="Refresh" size="small" circle @click="handleRefresh" />
        </div>
      </div>
    </template>

    <div v-if="!hasData" class="empty-state">
      <el-empty description="尚無數據">
        <el-text type="info">請先連接設備以開始接收數據</el-text>
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
            參數數量: {{ paramCount }}
          </el-tag>
          <el-tag size="small" type="success">
            <el-icon><Clock /></el-icon>
            更新頻率: {{ updateRate }} 次/秒
          </el-tag>
          <el-tag size="small" :type="freshnessType">
            <el-icon><Select /></el-icon>
            資料新鮮度: {{ freshnessText }}
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
import { formatTimestamp } from '@/utils/formatter'
import type { PrimitiveValue } from '@/types'

// ============================================================================
// Composables & Store
// ============================================================================
const { connectionConfig } = useWebSocket()
const dataStore = useDataStore()

// ============================================================================
// Props
// ============================================================================
interface Props {
  showTrend?: boolean
}

withDefaults(defineProps<Props>(), {
  showTrend: true,
})
// ============================================================================
// State
// ============================================================================
const lastUpdateTime = ref<string>()
const updateCount = ref(0)
const updateRate = ref(0)
const history = ref<Map<string, PrimitiveValue[]>>(new Map())

// ============================================================================
// Computed - 基礎數據
// ============================================================================
const deviceId = computed(() => connectionConfig.value?.deviceId)

const currentData = computed(() => {
  const id = deviceId.value
  if (!id) return null
  return dataStore.latestData[id]
})

const hasData = computed(() => {
  return currentData.value !== null && currentData.value !== undefined
})

// ============================================================================
// Computed - 顯示數據
// ============================================================================
const displayData = computed(() => {
  if (!currentData.value?.data) return {}

  const result: Record<string, { value: PrimitiveValue; unit?: string; timestamp?: string }> = {}

  for (const [key, paramData] of Object.entries(currentData.value.data)) {
    // 因為 Object.entries 返回 unknown，需要明確類型
    const param = paramData as { value: PrimitiveValue; unit?: string }
    result[key] = {
      value: param.value,
      unit: getUnit(key),
      timestamp: currentData.value.timestamp,
    }
  }

  return result
})

const paramCount = computed(() => Object.keys(displayData.value).length)

// ============================================================================
// Computed - 資料新鮮度
// ============================================================================
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
  if (type === 'success') return '新鮮'
  if (type === 'warning') return '稍舊'
  return '過時'
})

// ============================================================================
// Watch - 監聽數據更新
// ============================================================================
watch(
  () => {
    const id = deviceId.value
    if (!id) return null
    return dataStore.latestData[id]
  },
  (newData) => {
    if (!newData) return

    // 更新時間戳
    lastUpdateTime.value = newData.timestamp

    // 更新計數器
    updateCount.value++

    // 記錄歷史（用於趨勢分析）
    if (newData.data) {
      for (const [key, paramData] of Object.entries(newData.data)) {
        // 因為 Object.entries 返回 unknown，需要明確類型
        const param = paramData as { value: PrimitiveValue; unit?: string }
        const value = param.value

        if (!history.value.has(key)) {
          history.value.set(key, [])
        }
        const hist = history.value.get(key)!
        hist.push(value)

        // 限制歷史記錄長度
        if (hist.length > 10) {
          hist.shift()
        }
      }
    }
  },
  { deep: true },
)

// ============================================================================
// 計算更新速率
// ============================================================================
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

// ============================================================================
// Lifecycle
// ============================================================================
startRateCalculation()

onUnmounted(() => {
  stopRateCalculation()
})

// ============================================================================
// 工具函數 - 修正語法錯誤
// ============================================================================

// ✅ 修正: 移除箭頭符號
function getUnit(paramName: string): string | undefined {
  // 數位輸入/輸出無單位
  if (paramName.startsWith('DOut') || paramName.startsWith('DIn')) {
    return undefined
  }

  // 類比輸入通常是電壓
  if (paramName.startsWith('AIn')) {
    return 'V'
  }

  // 類比輸出通常是電壓
  if (paramName.startsWith('AOut')) {
    return 'V'
  }

  return undefined
}

// ✅ 修正: 移除箭頭符號
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

// ✅ 修正: 移除箭頭符號
function getValueLabel(paramName: string, value: PrimitiveValue): string {
  if (paramName.startsWith('DOut') || paramName.startsWith('DIn')) {
    const n = toNumberOrNull(value)
    if (n === null) return '未知'
    return n > 0 ? 'ON' : 'OFF'
  }

  if (paramName.startsWith('AIn') || paramName.startsWith('AOut')) {
    const n = toNumberOrNull(value)
    if (n === null) return '未知'
    return n.toFixed(2)
  }

  return String(value)
}

// ✅ 修正: 移除箭頭符號
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

// ✅ 修正: 移除箭頭符號
function getTrendIcon(key: string) {
  const trend = getTrend(key)
  if (trend > 0) return ArrowUp
  if (trend < 0) return ArrowDown
  return Minus
}

// ✅ 修正: 移除箭頭符號
function getTrendColor(key: string): string {
  const trend = getTrend(key)
  if (trend > 0) return '#67C23A'
  if (trend < 0) return '#F56C6C'
  return '#909399'
}

// ✅ 修正: 移除箭頭符號
function getTrendText(key: string): string {
  const trend = getTrend(key)
  if (trend > 0) return '上升'
  if (trend < 0) return '下降'
  return '穩定'
}

// ✅ 修正: 移除箭頭符號
function getTrend(key: string): number {
  const hist = history.value.get(key)
  if (!hist || hist.length < 2) return 0

  const recentValue = hist[hist.length - 1]
  const previousValue = hist[hist.length - 2]

  // 陣列訪問可能返回 undefined，需要檢查
  if (recentValue === undefined || previousValue === undefined) return 0

  const recent = toNumberOrNull(recentValue)
  const previous = toNumberOrNull(previousValue)

  if (recent === null || previous === null) return 0

  const diff = recent - previous
  if (Math.abs(diff) < 0.01) return 0

  return diff > 0 ? 1 : -1
}

// ============================================================================
// 輔助函數
// ============================================================================

// ✅ 修正: 移除箭頭符號
function toNumberOrNull(value: PrimitiveValue): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const n = Number(value)
    return isNaN(n) ? null : n
  }
  return null
}

// ✅ 修正: 移除箭頭符號
function formatTimeShort(timestamp: string | undefined): string {
  if (!timestamp) return '-'
  return formatTimestamp(timestamp)
}

// ============================================================================
// 事件處理
// ============================================================================

// ✅ 修正: 移除箭頭符號
function handleRefresh() {
  // 清空歷史記錄
  history.value.clear()

  // 重置計數器
  updateCount.value = 0
  updateRate.value = 0

  console.log('[DataDisplay] 數據已刷新')
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
