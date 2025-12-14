<template>
  <el-card class="statistics-panel">
    <template #header>
      <div class="card-header">
        <span>📊 Statistics</span>
        <el-button :icon="Refresh" size="small" circle @click="handleRefresh" />
      </div>
    </template>

    <!-- Statistics cards -->
    <el-row :gutter="15">
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card stat-primary">
          <div class="stat-icon">
            <el-icon :size="32"><DataLine /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.messageCount }}</div>
            <div class="stat-label">Messages received</div>
          </div>
        </div>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card stat-success">
          <div class="stat-icon">
            <el-icon :size="32"><Select /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.parameterCount }}</div>
            <div class="stat-label">Monitored parameters</div>
          </div>
        </div>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card stat-warning">
          <div class="stat-icon">
            <el-icon :size="32"><Edit /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.writeCount }}</div>
            <div class="stat-label">Write operations</div>
          </div>
        </div>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card stat-danger">
          <div class="stat-icon">
            <el-icon :size="32"><WarnTriangleFilled /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.errorCount }}</div>
            <div class="stat-label">Errors</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-divider />

    <!-- Detailed statistics -->
    <el-descriptions title="Details" :column="2" size="default" border>
      <el-descriptions-item label="Connection duration">
        {{ statistics.connectionDuration }}
      </el-descriptions-item>
      <el-descriptions-item label="Average latency">
        {{ statistics.averageLatency }} ms
      </el-descriptions-item>
      <el-descriptions-item label="Message rate">
        {{ statistics.messageRate }} msg/s
      </el-descriptions-item>
      <el-descriptions-item label="Data freshness">
        <el-tag :type="freshnessType" size="small">
          {{ statistics.dataFreshness }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="Success rate">
        <el-progress
          :percentage="statistics.successRate"
          :color="getProgressColor(statistics.successRate)"
        />
      </el-descriptions-item>
      <el-descriptions-item label="Runtime status">
        <el-tag :type="statusType" size="small">
          {{ statistics.status }}
        </el-tag>
      </el-descriptions-item>
    </el-descriptions>

    <el-divider content-position="left">Parameter statistics</el-divider>

    <!-- Parameter statistics chart -->
    <div class="parameter-stats">
      <div v-for="param in parameterStatistics" :key="param.name" class="param-stat-item">
        <div class="param-stat-header">
          <span class="param-name">{{ param.name }}</span>
          <el-tag size="small" type="info"> {{ param.updateCount }} updates </el-tag>
        </div>
        <div class="param-stat-values">
          <div class="stat-value-item">
            <span class="label">Current:</span>
            <span class="value">{{ formatNumber(param.current, 2) }}</span>
          </div>
          <div class="stat-value-item">
            <span class="label">Min:</span>
            <span class="value">{{ formatNumber(param.min, 2) }}</span>
          </div>
          <div class="stat-value-item">
            <span class="label">Max:</span>
            <span class="value">{{ formatNumber(param.max, 2) }}</span>
          </div>
          <div class="stat-value-item">
            <span class="label">Average:</span>
            <span class="value">{{ formatNumber(param.average, 2) }}</span>
          </div>
        </div>
        <div class="param-stat-chart">
          <el-progress
            :percentage="getParameterPercentage(param)"
            :stroke-width="6"
            :show-text="false"
          />
        </div>
      </div>
    </div>

    <!-- Trend chart (simplified) -->
    <el-divider content-position="left">Data trends</el-divider>
    <div class="trend-chart">
      <el-empty v-if="!hasData" description="No data yet" :image-size="80" />
      <div v-else class="chart-placeholder">
        <el-text type="info">
          📈 Reserved area for charts (you can integrate ECharts or other chart libraries)
        </el-text>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Refresh, DataLine, Select, Edit, WarnTriangleFilled } from '@element-plus/icons-vue'
import { useWebSocketStore } from '@/stores/websocket'
import { formatNumber, formatRelativeTime } from '@/utils/formatter'
import type { PrimitiveValue, ParameterData, WebSocketMessage, WriteResultMessage } from '@/types'

const wsStore = useWebSocketStore()

// Statistics data (for local display)
interface LocalStatistics {
  messageCount: number
  parameterCount: number
  writeCount: number
  errorCount: number
  connectionDuration: string
  averageLatency: number
  messageRate: number
  dataFreshness: string
  successRate: number
  status: string
}

const statistics = ref<LocalStatistics>({
  messageCount: 0,
  parameterCount: 0,
  writeCount: 0,
  errorCount: 0,
  connectionDuration: '-',
  averageLatency: 0,
  messageRate: 0,
  dataFreshness: 'Unknown',
  successRate: 0,
  status: 'Disconnected',
})

// Parameter statistics
interface ParameterStatistic {
  name: string
  current: number
  min: number
  max: number
  average: number
  updateCount: number
}

const parameterStatistics = ref<ParameterStatistic[]>([])

// Timers
const connectionStartTime = ref<Date | null>(null)
let updateTimer: number | null = null
let messageCountTimer: number | null = null
let messageCountPerSecond = 0
let lastMessageTime = Date.now()

// Computed
const hasData = computed(() => parameterStatistics.value.length > 0)

const freshnessType = computed(() => {
  const freshness = statistics.value.dataFreshness
  if (freshness === 'Fresh') return 'success'
  if (freshness === 'Stale') return 'warning'
  if (freshness === 'Expired') return 'danger'
  return 'info'
})

const statusType = computed(() => {
  const status = statistics.value.status
  if (status === 'Connected') return 'success'
  if (status === 'Connecting') return 'warning'
  return 'info'
})

// ===== Helpers =====
const toNumberOrNull = (v: PrimitiveValue): number | null => {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const isParamMap = (x: unknown): x is Record<string, ParameterData> =>
  typeof x === 'object' && x !== null

const isWriteResult = (
  x: WebSocketMessage<unknown>,
): x is WriteResultMessage & { type: 'write_result' } =>
  x.type === 'write_result' && typeof (x as { success?: unknown }).success === 'boolean'

// ===== Added: Latency EMA =====
const latencyEma = ref<number | null>(null)
const LATENCY_EMA_ALPHA = 0.2

type MaybeWithTiming = WebSocketMessage<unknown> & {
  data?: {
    sentAt?: number
    serverTime?: number | string
  }
}

/** Calculate latency using sentAt and update EMA; if sentAt is missing, try serverTime (reference only). */
function updateAverageLatency(msg: MaybeWithTiming) {
  const now = Date.now()
  const sentAt = msg?.data?.sentAt

  let latency: number | null = null

  if (typeof sentAt === 'number' && sentAt > 0 && sentAt < now + 60_000) {
    latency = now - sentAt
  } else if (msg?.data?.serverTime !== undefined) {
    // Fallback: if backend provides serverTime (ms or ISO string), roughly estimate RTT/clock offset
    const st =
      typeof msg.data.serverTime === 'number'
        ? msg.data.serverTime
        : Date.parse(String(msg.data.serverTime))
    if (Number.isFinite(st)) {
      // In non-NTP-synced environments: use |now - serverTime| as a rough estimate (reference only)
      const rough = Math.abs(now - st)
      // Avoid treating huge clock drift as latency; clamp to an upper bound (e.g., 3s)
      latency = Math.min(rough, 3000)
    }
  }

  if (latency !== null && Number.isFinite(latency)) {
    latencyEma.value =
      latencyEma.value === null
        ? latency
        : Math.round(LATENCY_EMA_ALPHA * latency + (1 - LATENCY_EMA_ALPHA) * latencyEma.value)
    statistics.value.averageLatency = latencyEma.value
  }
}

// Watch WebSocket status
watch(
  () => wsStore.isConnected,
  (connected) => {
    if (connected) {
      connectionStartTime.value = new Date()
      statistics.value.status = 'Connected'
      startUpdateTimer()
    } else {
      connectionStartTime.value = null
      statistics.value.status = 'Disconnected'
      statistics.value.connectionDuration = '-'
      latencyEma.value = null
      statistics.value.averageLatency = 0
      stopUpdateTimer()
    }
  },
)

// Watch messages
watch(
  () => wsStore.lastMessage,
  (message) => {
    if (!message) return

    // ===== Added: update average latency (EMA) =====
    updateAverageLatency(message as MaybeWithTiming)

    statistics.value.messageCount++
    messageCountPerSecond++
    lastMessageTime = Date.now()

    // Keep the rest of your original logic...
    if (message.type === 'data' && isParamMap((message as WebSocketMessage<unknown>).data)) {
      const map = (message as WebSocketMessage<Record<string, ParameterData>>).data!
      Object.entries(map).forEach(([name, data]) => {
        const n = toNumberOrNull(data.value)
        if (n !== null) updateParameterStatistics(name, n)
      })
      statistics.value.parameterCount = Object.keys(map).length
      updateDataFreshness()
    }

    if (isWriteResult(message)) {
      statistics.value.writeCount++
      if (!message.success) statistics.value.errorCount++
    }

    if (message.type === 'error') {
      statistics.value.errorCount++
    }

    updateSuccessRate()
  },
)

// Update parameter statistics
function updateParameterStatistics(name: string, value: number) {
  let stat = parameterStatistics.value.find((s) => s.name === name)

  if (!stat) {
    stat = {
      name,
      current: value,
      min: value,
      max: value,
      average: value,
      updateCount: 1,
    }
    parameterStatistics.value.push(stat)
  } else {
    stat.current = value
    stat.min = Math.min(stat.min, value)
    stat.max = Math.max(stat.max, value)
    stat.average = (stat.average * stat.updateCount + value) / (stat.updateCount + 1)
    stat.updateCount++
  }
}

// Update data freshness
function updateDataFreshness() {
  const age = Date.now() - lastMessageTime
  if (age < 2000) {
    statistics.value.dataFreshness = 'Fresh'
  } else if (age < 5000) {
    statistics.value.dataFreshness = 'Stale'
  } else {
    statistics.value.dataFreshness = 'Expired'
  }
}

// Update success rate
function updateSuccessRate() {
  const total = statistics.value.writeCount
  if (total === 0) {
    statistics.value.successRate = 100
  } else {
    const success = total - statistics.value.errorCount
    statistics.value.successRate = Math.round((success / total) * 100)
  }
}

// Start update timers
function startUpdateTimer() {
  stopUpdateTimer()

  // Update connection duration
  updateTimer = window.setInterval(() => {
    if (connectionStartTime.value) {
      statistics.value.connectionDuration = formatRelativeTime(connectionStartTime.value)
    }
  }, 1000)

  // Calculate message rate
  messageCountTimer = window.setInterval(() => {
    statistics.value.messageRate = messageCountPerSecond
    messageCountPerSecond = 0
  }, 1000)
}

// Stop update timers
function stopUpdateTimer() {
  if (updateTimer !== null) {
    clearInterval(updateTimer)
    updateTimer = null
  }
  if (messageCountTimer !== null) {
    clearInterval(messageCountTimer)
    messageCountTimer = null
  }
}

// Get parameter percentage (for progress bar)
function getParameterPercentage(param: ParameterStatistic): number {
  if (param.max === param.min) return 50
  return Math.round(((param.current - param.min) / (param.max - param.min)) * 100)
}

// Get progress color
function getProgressColor(percentage: number): string {
  if (percentage >= 80) return '#67C23A'
  if (percentage >= 60) return '#E6A23C'
  return '#F56C6C'
}

// Manual refresh
function handleRefresh() {
  updateDataFreshness()
  updateSuccessRate()
}

// Reset statistics (for external use)
function resetStatistics() {
  statistics.value = {
    messageCount: 0,
    parameterCount: 0,
    writeCount: 0,
    errorCount: 0,
    connectionDuration: '-',
    averageLatency: 0,
    messageRate: 0,
    dataFreshness: 'Unknown',
    successRate: 0,
    status: 'Disconnected',
  }
  parameterStatistics.value = []
  messageCountPerSecond = 0
}

// Cleanup
onUnmounted(() => {
  stopUpdateTimer()
})

defineExpose({
  resetStatistics,
})
</script>

<style scoped>
.statistics-panel {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Statistics cards */
.stat-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 15px;
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.stat-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.stat-success {
  background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
  color: white;
}

.stat-warning {
  background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
  color: white;
}

.stat-danger {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
}

.stat-icon {
  opacity: 0.8;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 14px;
  opacity: 0.9;
}

/* Parameter statistics */
.parameter-stats {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.param-stat-item {
  padding: 15px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}

.param-stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.param-name {
  font-weight: 600;
  color: #303133;
}

.param-stat-values {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}

.stat-value-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-value-item .label {
  font-size: 12px;
  color: #909399;
}

.stat-value-item .value {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  font-family: 'Courier New', monospace;
}

.param-stat-chart {
  margin-top: 10px;
}

/* Trend chart */
.trend-chart {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
  border-radius: 8px;
  padding: 20px;
}

.chart-placeholder {
  text-align: center;
  padding: 40px 20px;
}

:deep(.el-descriptions__title) {
  font-size: 15px;
  font-weight: 600;
}
</style>
