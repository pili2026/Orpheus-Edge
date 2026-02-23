<template>
  <!-- Backup List Dialog -->
  <el-dialog
    :model-value="visible"
    :title="t.config.backup.title"
    width="800px"
    @close="handleClose"
  >
    <el-button
      :icon="Refresh"
      size="small"
      :loading="backupStore.isLoading"
      @click="handleRefresh"
      style="margin-bottom: 16px"
    >
      {{ t.config.refresh }}
    </el-button>

    <el-table :data="backupStore.backups" stripe v-loading="backupStore.isLoading">
      <el-table-column prop="filename" :label="t.config.backup.filename" min-width="220" />
      <el-table-column prop="generation" :label="t.config.backup.generation" width="90" />
      <el-table-column :label="t.config.backup.created" width="180">
        <template #default="{ row }">
          {{ formatTimestamp(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column :label="t.config.backup.size" width="90">
        <template #default="{ row }">
          {{ formatSize(row.size_bytes) }}
        </template>
      </el-table-column>
      <el-table-column :label="t.config.backup.actions" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="handlePreview(row.filename)">
            {{ t.config.backup.preview }}
          </el-button>

          <el-popconfirm
            :title="t.config.backup.restoreConfirm"
            @confirm="handleRestore(row.filename)"
          >
            <template #reference>
              <el-button size="small" type="primary">
                {{ t.config.backup.restore }}
              </el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>

  <!-- Preview Dialog -->
  <el-dialog
    v-model="showPreviewDialog"
    :title="`${t.config.backup.previewTitle} — ${previewFilename}`"
    width="640px"
    append-to-body
    @close="handlePreviewClose"
  >
    <div v-if="backupStore.isLoadingDetail" class="preview-loading">
      <el-icon class="is-loading" :size="32">
        <component :is="Loading" />
      </el-icon>
    </div>

    <div v-else-if="backupStore.currentDetail" class="preview-content">
      <el-descriptions :title="t.config.backup.previewMeta" :column="2" border size="small">
        <el-descriptions-item :label="t.config.metadata.generation">
          {{ pickNumber(backupStore.currentDetail.metadata, 'generation') ?? '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t.config.metadata.source">
          {{ pickString(backupStore.currentDetail.metadata, 'config_source') ?? '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t.config.metadata.lastModified">
          {{ formatTimestamp(pickString(backupStore.currentDetail.metadata, 'last_modified')) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t.config.metadata.modifiedBy">
          {{ pickString(backupStore.currentDetail.metadata, 'last_modified_by') ?? '-' }}
        </el-descriptions-item>
      </el-descriptions>

      <div class="preview-yaml-section">
        <div class="preview-yaml-title">{{ t.config.backup.previewConfig }}</div>
        <pre class="yaml-block">{{ formatYaml(backupStore.currentDetail.content) }}</pre>
      </div>
    </div>

    <template #footer>
      <el-button @click="showPreviewDialog = false">{{ t.config.common.cancel }}</el-button>
      <el-popconfirm :title="t.config.backup.restoreConfirm" @confirm="handleRestoreFromPreview">
        <template #reference>
          <el-button type="primary" :loading="backupStore.isLoading">
            {{ t.config.backup.restore }}
          </el-button>
        </template>
      </el-popconfirm>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Refresh, View, Loading } from '@element-plus/icons-vue'
import { useUIStore } from '@/stores/ui'
import { useBackupStore, type Json, type JsonObject } from '@/stores/backup'
import yaml from 'js-yaml'
import type { ConfigType } from '@/types/config'

// ===== Props & Emits =====
interface Props {
  visible: boolean
  configType: ConfigType
  model?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'restored'): void
}>()

// ===== Stores =====
const { t } = storeToRefs(useUIStore())
const backupStore = useBackupStore()

// ===== State =====
const showPreviewDialog = ref(false)
const previewFilename = ref('')

let openSeq = 0

// ===== Watch =====
watch(
  () => [props.visible, props.configType, props.model] as const,
  async ([visible], _prev, onCleanup) => {
    if (!visible) return

    const seq = ++openSeq
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    try {
      await backupStore.fetchBackups(props.configType, props.model)
      if (cancelled || seq !== openSeq) return
    } catch {
      // handled in store
    }
  },
  { immediate: false },
)

// ===== Methods =====
const handleRefresh = async () => {
  try {
    await backupStore.fetchBackups(props.configType, props.model)
  } catch {
    // handled in store
  }
}

const handleClose = () => {
  backupStore.clearDetail()
  showPreviewDialog.value = false
  previewFilename.value = ''
  emit('close')
}

const handlePreviewClose = () => {
  backupStore.clearDetail()
  previewFilename.value = ''
}

const handlePreview = async (filename: string) => {
  previewFilename.value = filename
  showPreviewDialog.value = true
  try {
    await backupStore.fetchBackupDetail(props.configType, filename, props.model)
  } catch {
    // handled in store
  }
}

const handleRestore = async (filename: string) => {
  try {
    await backupStore.restoreBackup(props.configType, filename, props.model)
    emit('restored')
    emit('close')
  } catch {
    // handled in store
  }
}

const handleRestoreFromPreview = async () => {
  if (!previewFilename.value) return
  try {
    await backupStore.restoreBackup(props.configType, previewFilename.value, props.model)
    showPreviewDialog.value = false
    emit('restored')
    emit('close')
  } catch {
    // handled in store
  }
}

// ===== Helpers =====
const formatTimestamp = (ts?: string | null) => {
  if (!ts) return 'N/A'
  return new Date(ts).toLocaleString()
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const pickString = (obj: JsonObject | undefined, key: string): string | null => {
  const v: Json | undefined = obj?.[key]
  return typeof v === 'string' ? v : null
}

const pickNumber = (obj: JsonObject | undefined, key: string): number | null => {
  const v: Json | undefined = obj?.[key]
  return typeof v === 'number' ? v : null
}

const formatYaml = (content: unknown): string => {
  try {
    return yaml.dump(content, { indent: 2, lineWidth: 80 })
  } catch {
    try {
      return JSON.stringify(content, null, 2)
    } catch {
      return String(content)
    }
  }
}
</script>

<style scoped>
.preview-loading {
  display: flex;
  justify-content: center;
  padding: 40px 0;
  color: #909399;
}

.preview-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.preview-yaml-section {
  margin-top: 4px;
}

.preview-yaml-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 8px;
}

.yaml-block {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 16px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  max-height: 360px;
  overflow-y: auto;
  margin: 0;
  white-space: pre;
}
</style>
