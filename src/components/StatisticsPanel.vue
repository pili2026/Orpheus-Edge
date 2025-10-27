<template>
  <el-card class="statistics-panel">
    <template #header>
      <div class="card-header">
        <span>📊 統計資訊</span>
        <el-button :icon="Refresh" size="small" circle @click="handleRefresh" />
      </div>
    </template>

    <!-- 統計卡片 -->
    <el-row :gutter="15">
      <el-col :xs="24" :sm="12" :md="6">
        <div class="stat-card stat-primary">
          <div class="stat-icon">
            <el-icon :size="32"><DataLine /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.messageCount }}</div>
            <div class="stat-label">收到訊息</div>
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
            <div class="stat-label">監控參數</div>
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
            <div class="stat-label">寫入次數</div>
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
            <div class="stat-label">錯誤次數</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-divider />

    <!-- 詳細統計 -->
    <el-descriptions title="詳細統計" :column="2" size="default" border>
      <el-descriptions-item label="連接時長">
        {{ statistics.connectionDuration }}
      </el-descriptions-item>
      <el-descriptions-item label="平均延遲">
        {{ statistics.averageLatency }} ms
      </el-descriptions-item>
      <el-descriptions-item label="訊息速率">
        {{ statistics.messageRate }} 訊息/秒
      </el-descriptions-item>
      <el-descriptions-item label="資料新鮮度">
        <el-tag :type="freshnessType" size="small">
          {{ statistics.dataFreshness }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="成功率">
        <el-progress
          :percentage="statistics.successRate"
          :color="getProgressColor(statistics.successRate)"
        />
      </el-descriptions-item>
      <el-descriptions-item label="運行狀態">
        <el-tag :type="statusType" size="small">
          {{ statistics.status }}
        </el-tag>
      </el-descriptions-item>
    </el-descriptions>

    <el-divider content-position="left">參數統計</el-divider>

    <!-- 參數統計圖表 -->
    <div class="parameter-stats">
      <div v-for="param in parameterStatistics" :key="param.name" class="param-stat-item">
        <div class="param-stat-header">
          <span class="param-name">{{ param.name }}</span>
          <el-tag size="small" type="info"> {{ param.updateCount }} 次更新 </el-tag>
        </div>
        <div class="param-stat-values">
          <div class="stat-value-item">
            <span class="label">當前值:</span>
            <span class="value">{{ formatNumber(param.current, 2) }}</span>
          </div>
          <div class="stat-value-item">
            <span class="label">最小值:</span>
            <span class="value">{{ formatNumber(param.min, 2) }}</span>
          </div>
          <div class="stat-value-item">
            <span class="label">最大值:</span>
            <span class="value">{{ formatNumber(param.max, 2) }}</span>
          </div>
          <div class="stat-value-item">
            <span class="label">平均值:</span>
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

    <!-- 趨勢圖表（簡化版） -->
    <el-divider content-position="left">資料趨勢</el-divider>
    <div class="trend-chart">
      <el-empty v-if="!hasData" description="暫無資料" :image-size="80" />
      <div v-else class="chart-placeholder">
        <el-text type="info"> 📈 圖表功能預留區域（可整合 ECharts 或其他圖表庫） </el-text>
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

// 統計數據（本地顯示用）
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
  dataFreshness: '未知',
  successRate: 0,
  status: '未連接',
})

// 參數統計
interface ParameterStatistic {
  name: string
  current: number
  min: number
  max: number
  average: number
  updateCount: number
}

const parameterStatistics = ref<ParameterStatistic[]>([])

// 計時器
const connectionStartTime = ref<Date | null>(null)
let updateTimer: number | null = null
let messageCountTimer: number | null = null
let messageCountPerSecond = 0
let lastMessageTime = Date.now()

// 計算屬性
const hasData = computed(() => parameterStatistics.value.length > 0)

const freshnessType = computed(() => {
  const freshness = statistics.value.dataFreshness
  if (freshness === '新鮮') return 'success'
  if (freshness === '稍舊') return 'warning'
  if (freshness === '過期') return 'danger'
  return 'info'
})

const statusType = computed(() => {
  const status = statistics.value.status
  if (status === '已連接') return 'success'
  if (status === '連接中') return 'warning'
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

// ===== 新增：延遲 EMA =====
const latencyEma = ref<number | null>(null)
const LATENCY_EMA_ALPHA = 0.2

type MaybeWithTiming = WebSocketMessage<unknown> & {
  data?: {
    sentAt?: number
    serverTime?: number | string
  }
}

/** 利用 sentAt 計算延遲並更新 EMA；若沒有 sentAt，嘗試使用 serverTime（僅作參考） */
function updateAverageLatency(msg: MaybeWithTiming) {
  const now = Date.now()
  const sentAt = msg?.data?.sentAt

  let latency: number | null = null

  if (typeof sentAt === 'number' && sentAt > 0 && sentAt < now + 60_000) {
    latency = now - sentAt
  } else if (msg?.data?.serverTime !== undefined) {
    // 備援：如果後端提供 serverTime（ms 或 ISO 字串），可粗略估算往返延遲/時鐘偏移
    const st =
      typeof msg.data.serverTime === 'number'
        ? msg.data.serverTime
        : Date.parse(String(msg.data.serverTime))
    if (Number.isFinite(st)) {
      // 未做 NTP 同步情境：用 |now - serverTime| 當粗估（僅供參考）
      const rough = Math.abs(now - st)
      // 避免將巨大的時鐘偏移當作延遲，設定一個上限（例如 3s）
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

// 監聽 WebSocket 狀態
watch(
  () => wsStore.isConnected,
  (connected) => {
    if (connected) {
      connectionStartTime.value = new Date()
      statistics.value.status = '已連接'
      startUpdateTimer()
    } else {
      connectionStartTime.value = null
      statistics.value.status = '未連接'
      statistics.value.connectionDuration = '-'
      latencyEma.value = null
      statistics.value.averageLatency = 0
      stopUpdateTimer()
    }
  },
)

// 監聽訊息
watch(
  () => wsStore.lastMessage,
  (message) => {
    if (!message) return

    // ===== 新增：更新平均延遲（EMA）=====
    updateAverageLatency(message as MaybeWithTiming)

    statistics.value.messageCount++
    messageCountPerSecond++
    lastMessageTime = Date.now()

    // 下面維持你的原本邏輯...
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

// 更新參數統計
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

// 更新資料新鮮度
function updateDataFreshness() {
  const age = Date.now() - lastMessageTime
  if (age < 2000) {
    statistics.value.dataFreshness = '新鮮'
  } else if (age < 5000) {
    statistics.value.dataFreshness = '稍舊'
  } else {
    statistics.value.dataFreshness = '過期'
  }
}

// 更新成功率
function updateSuccessRate() {
  const total = statistics.value.writeCount
  if (total === 0) {
    statistics.value.successRate = 100
  } else {
    const success = total - statistics.value.errorCount
    statistics.value.successRate = Math.round((success / total) * 100)
  }
}

// 啟動更新計時器
function startUpdateTimer() {
  stopUpdateTimer()

  // 更新連接時長
  updateTimer = window.setInterval(() => {
    if (connectionStartTime.value) {
      statistics.value.connectionDuration = formatRelativeTime(connectionStartTime.value)
    }
  }, 1000)

  // 計算訊息速率
  messageCountTimer = window.setInterval(() => {
    statistics.value.messageRate = messageCountPerSecond
    messageCountPerSecond = 0
  }, 1000)
}

// 停止更新計時器
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

// 取得參數百分比（用於進度條）
function getParameterPercentage(param: ParameterStatistic): number {
  if (param.max === param.min) return 50
  return Math.round(((param.current - param.min) / (param.max - param.min)) * 100)
}

// 取得進度條顏色
function getProgressColor(percentage: number): string {
  if (percentage >= 80) return '#67C23A'
  if (percentage >= 60) return '#E6A23C'
  return '#F56C6C'
}

// 手動刷新
function handleRefresh() {
  updateDataFreshness()
  updateSuccessRate()
}

// 重置統計（供外部調用）
function resetStatistics() {
  statistics.value = {
    messageCount: 0,
    parameterCount: 0,
    writeCount: 0,
    errorCount: 0,
    connectionDuration: '-',
    averageLatency: 0,
    messageRate: 0,
    dataFreshness: '未知',
    successRate: 0,
    status: '未連接',
  }
  parameterStatistics.value = []
  messageCountPerSecond = 0
}

// 清理
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

/* 統計卡片 */
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

/* 參數統計 */
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

/* 趨勢圖表 */
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
