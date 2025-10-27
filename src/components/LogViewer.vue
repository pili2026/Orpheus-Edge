<template>
  <el-card class="log-viewer">
    <template #header>
      <div class="card-header">
        <span>📋 系統日誌</span>
        <div class="header-actions">
          <el-button-group size="small">
            <el-button :icon="Download" @click="handleExport"> 匯出 </el-button>
            <el-button :icon="Delete" @click="handleClear"> 清除 </el-button>
          </el-button-group>
        </div>
      </div>
    </template>

    <!-- 過濾器 -->
    <div class="filter-bar">
      <el-space wrap>
        <el-select
          v-model="filterType"
          placeholder="日誌類型"
          clearable
          size="small"
          style="width: 120px"
        >
          <el-option label="全部" value="" />
          <el-option label="除錯" value="debug" />
          <el-option label="訊息" value="info" />
          <el-option label="成功" value="success" />
          <el-option label="警告" value="warn" />
          <el-option label="錯誤" value="error" />
        </el-select>

        <el-input
          v-model="filterKeyword"
          placeholder="搜尋關鍵字..."
          clearable
          size="small"
          style="width: 200px"
          :prefix-icon="Search"
        />

        <el-switch v-model="autoScroll" active-text="自動捲動" size="small" />

        <el-text type="info" size="small"> 共 {{ filteredLogs.length }} 條日誌 </el-text>
      </el-space>
    </div>

    <el-divider style="margin: 15px 0" />

    <!-- 日誌列表 -->
    <div ref="logContainer" class="log-container" :class="{ 'auto-scroll': autoScroll }">
      <div v-if="filteredLogs.length === 0" class="empty-logs">
        <el-empty :image-size="80" description="沒有日誌記錄" />
      </div>

      <div
        v-for="(log, index) in filteredLogs"
        :key="index"
        class="log-entry"
        :class="`log-${log.type}`"
      >
        <div class="log-icon">
          <el-icon :color="getLogColor(log.type)">
            <component :is="getLogIcon(log.type)" />
          </el-icon>
        </div>

        <div class="log-content">
          <div class="log-header">
            <el-tag :type="getLogTagType(log.type)" size="small" effect="plain">
              {{ getLogTypeText(log.type) }}
            </el-tag>
            <span class="log-timestamp">
              {{ formatTimestamp(log.timestamp) }}
            </span>
          </div>

          <div class="log-message">
            {{ log.message }}
          </div>

          <div v-if="log.data" class="log-data">
            <el-collapse>
              <el-collapse-item title="詳細資料">
                <pre>{{ JSON.stringify(log.data, null, 2) }}</pre>
              </el-collapse-item>
            </el-collapse>
          </div>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Download,
  Delete,
  Search,
  InfoFilled,
  SuccessFilled,
  WarningFilled,
  CircleCloseFilled,
  Document,
} from '@element-plus/icons-vue'
import { logger, type LogEntry, type LogType } from '@/utils/logger'
import { formatTimestamp } from '@/utils/formatter'

// 狀態
const logs = ref<LogEntry[]>([])
const filterType = ref<string>('')
const filterKeyword = ref('')
const autoScroll = ref(true)
const logContainer = ref<HTMLElement>()

// 計算過濾後的日誌
const filteredLogs = computed(() => {
  let filtered = logs.value

  // 按類型過濾
  if (filterType.value) {
    filtered = filtered.filter((log) => log.type === filterType.value)
  }

  // 按關鍵字過濾
  if (filterKeyword.value) {
    const keyword = filterKeyword.value.toLowerCase()
    filtered = filtered.filter(
      (log) =>
        log.message.toLowerCase().includes(keyword) ||
        (log.data && JSON.stringify(log.data).toLowerCase().includes(keyword)),
    )
  }

  return filtered
})

// 訂閱日誌更新
let unsubscribe: (() => void) | null = null

onMounted(() => {
  // 載入現有日誌
  logs.value = logger.getLogs()

  // 訂閱新日誌
  unsubscribe = logger.subscribe((entry) => {
    logs.value.push(entry)

    // 自動捲動到底部
    if (autoScroll.value) {
      nextTick(() => {
        scrollToBottom()
      })
    }
  })
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})

// 捲動到底部
function scrollToBottom() {
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}

// 取得日誌圖示
function getLogIcon(type: LogType) {
  const iconMap = {
    debug: Document,
    info: InfoFilled,
    success: SuccessFilled,
    warn: WarningFilled,
    error: CircleCloseFilled,
  }
  return iconMap[type] || InfoFilled
}

// 取得日誌顏色
function getLogColor(type: LogType): string {
  const colorMap = {
    debug: '#909399',
    info: '#409EFF',
    success: '#67C23A',
    warn: '#E6A23C',
    error: '#F56C6C',
  }
  return colorMap[type] || '#909399'
}

// 取得日誌標籤類型
function getLogTagType(type: LogType): string {
  const typeMap = {
    debug: 'info',
    info: 'primary',
    success: 'success',
    warn: 'warning',
    error: 'danger',
  }
  return typeMap[type] || 'info'
}

// 取得日誌類型文字
function getLogTypeText(type: LogType): string {
  const textMap = {
    debug: '除錯',
    info: '訊息',
    success: '成功',
    warn: '警告',
    error: '錯誤',
  }
  return textMap[type] || type
}

// 匯出日誌
function handleExport() {
  ElMessageBox.prompt('請選擇匯出格式', '匯出日誌', {
    confirmButtonText: '匯出',
    cancelButtonText: '取消',
    inputPattern: /^(txt|json|csv)$/,
    inputValue: 'txt',
    inputPlaceholder: '輸入 txt、json 或 csv',
    inputErrorMessage: '格式必須是 txt、json 或 csv',
  })
    .then(({ value }) => {
      const format = value.toLowerCase()
      let content: string
      let filename: string
      let mimeType: string

      switch (format) {
        case 'json':
          content = logger.exportJSON()
          filename = `talos-logs-${Date.now()}.json`
          mimeType = 'application/json'
          break
        case 'csv':
          content = logger.exportCSV()
          filename = `talos-logs-${Date.now()}.csv`
          mimeType = 'text/csv'
          break
        default:
          content = logger.exportText()
          filename = `talos-logs-${Date.now()}.txt`
          mimeType = 'text/plain'
      }

      // 建立下載連結
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      ElMessage.success('日誌已匯出')
      logger.info('日誌已匯出', { format, filename })
    })
    .catch(() => {
      // 使用者取消
    })
}

// 清除日誌
function handleClear() {
  ElMessageBox.confirm('確定要清除所有日誌嗎？此操作無法復原。', '清除日誌', {
    confirmButtonText: '確定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(() => {
      logger.clear()
      logs.value = []
      ElMessage.success('日誌已清除')
    })
    .catch(() => {
      // 使用者取消
    })
}

// 監聽自動捲動變化
watch(autoScroll, (value) => {
  if (value) {
    nextTick(() => {
      scrollToBottom()
    })
  }
})
</script>

<style scoped>
.log-viewer {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.filter-bar {
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.log-container {
  max-height: 500px;
  overflow-y: auto;
  padding: 10px;
  background: #fafafa;
  border-radius: 4px;
}

.log-container.auto-scroll {
  scroll-behavior: smooth;
}

.empty-logs {
  padding: 40px 20px;
  text-align: center;
}

.log-entry {
  display: flex;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: #ffffff;
  border-left: 3px solid transparent;
  border-radius: 4px;
  transition: all 0.2s;
}

.log-entry:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.log-entry.log-debug {
  border-left-color: #909399;
}

.log-entry.log-info {
  border-left-color: #409eff;
}

.log-entry.log-success {
  border-left-color: #67c23a;
}

.log-entry.log-warn {
  border-left-color: #e6a23c;
}

.log-entry.log-error {
  border-left-color: #f56c6c;
  background: #fef0f0;
}

.log-icon {
  flex-shrink: 0;
  padding-top: 2px;
}

.log-content {
  flex: 1;
  min-width: 0;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.log-timestamp {
  font-size: 12px;
  font-family: 'Courier New', monospace;
  color: #909399;
}

.log-message {
  color: #303133;
  font-size: 14px;
  line-height: 1.6;
  word-wrap: break-word;
}

.log-data {
  margin-top: 8px;
}

.log-data pre {
  margin: 0;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Courier New', monospace;
  color: #606266;
  overflow-x: auto;
}

:deep(.el-collapse-item__header) {
  font-size: 12px;
  padding: 5px 10px;
  background: #f5f7fa;
}

:deep(.el-collapse-item__content) {
  padding: 0;
}

/* 捲軸樣式 */
.log-container::-webkit-scrollbar {
  width: 8px;
}

.log-container::-webkit-scrollbar-track {
  background: #f5f7fa;
  border-radius: 4px;
}

.log-container::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 4px;
}

.log-container::-webkit-scrollbar-thumb:hover {
  background: #c0c4cc;
}
</style>
