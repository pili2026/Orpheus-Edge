<template>
  <el-card class="log-viewer">
    <template #header>
      <div class="card-header">
        <span>📋 System Logs</span>
        <div class="header-actions">
          <el-button-group size="small">
            <el-button :icon="Download" @click="handleExport"> Export </el-button>
            <el-button :icon="Delete" @click="handleClear"> Clear </el-button>
          </el-button-group>
        </div>
      </div>
    </template>

    <!-- Filters -->
    <div class="filter-bar">
      <el-space wrap>
        <el-select
          v-model="filterType"
          placeholder="Log Type"
          clearable
          size="small"
          style="width: 120px"
        >
          <el-option label="All" value="" />
          <el-option label="Debug" value="debug" />
          <el-option label="Info" value="info" />
          <el-option label="Success" value="success" />
          <el-option label="Warning" value="warn" />
          <el-option label="Error" value="error" />
        </el-select>

        <el-input
          v-model="filterKeyword"
          placeholder="Search keyword..."
          clearable
          size="small"
          style="width: 200px"
          :prefix-icon="Search"
        />

        <el-switch v-model="autoScroll" active-text="Auto Scroll" size="small" />

        <el-text type="info" size="small"> {{ filteredLogs.length }} logs </el-text>
      </el-space>
    </div>

    <el-divider style="margin: 15px 0" />

    <!-- Log List -->
    <div ref="logContainer" class="log-container" :class="{ 'auto-scroll': autoScroll }">
      <div v-if="filteredLogs.length === 0" class="empty-logs">
        <el-empty :image-size="80" description="No Logs" />
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
              <el-collapse-item title="Details">
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

// State
const logs = ref<LogEntry[]>([])
const filterType = ref<string>('')
const filterKeyword = ref('')
const autoScroll = ref(true)
const logContainer = ref<HTMLElement>()

// Filtered Logs
const filteredLogs = computed(() => {
  let filtered = logs.value

  // Filter by type
  if (filterType.value) {
    filtered = filtered.filter((log) => log.type === filterType.value)
  }

  // Filter by keyword
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

// Subscribe to log updates
let unsubscribe: (() => void) | null = null

onMounted(() => {
  // Load existing logs
  logs.value = logger.getLogs()

  // Subscribe to new logs
  unsubscribe = logger.subscribe((entry) => {
    logs.value.push(entry)

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

// Scroll to bottom
function scrollToBottom() {
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}

// Icon map
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

// Icon colors
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

// Tag style
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

// Display text
function getLogTypeText(type: LogType): string {
  const textMap = {
    debug: 'DEBUG',
    info: 'INFO',
    success: 'SUCCESS',
    warn: 'WARNING',
    error: 'ERROR',
  }
  return textMap[type] || type
}

// Export logs
function handleExport() {
  ElMessageBox.prompt('Select export format', 'Export Logs', {
    confirmButtonText: 'Export',
    cancelButtonText: 'Cancel',
    inputPattern: /^(txt|json|csv)$/i,
    inputValue: 'txt',
    inputPlaceholder: 'Enter txt, json, or csv',
    inputErrorMessage: 'Format must be txt, json, or csv',
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

      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      ElMessage.success('Logs exported')
      logger.info('Logs exported', { format, filename })
    })
    .catch(() => {})
}

// Clear logs
function handleClear() {
  ElMessageBox.confirm(
    'Are you sure you want to clear all logs? This action cannot be undone.',
    'Clear Logs',
    {
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel',
      type: 'warning',
    },
  )
    .then(() => {
      logger.clear()
      logs.value = []
      ElMessage.success('Logs cleared')
    })
    .catch(() => {})
}

// Auto-scroll watcher
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

/* Scrollbar Styles */
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
