<template>
  <div class="system-config-container">
    <!-- Restart Loading Overlay -->
    <el-dialog
      v-model="showRestartingDialog"
      :title="t.config.talos.restartingTitle"
      width="380px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
      align-center
    >
      <div class="restarting-content">
        <el-icon class="is-loading restarting-icon" :size="56" color="#e6a23c">
          <component :is="RefreshRight" />
        </el-icon>
        <p class="restarting-text">{{ t.config.talos.restartingMessage }}</p>
        <p class="restarting-subtext">{{ t.config.talos.restartingSubtext }}</p>
        <el-progress
          :percentage="restartProgress"
          :stroke-width="6"
          :status="restartProgress >= 100 ? 'success' : 'warning'"
          :striped="restartProgress < 100"
          :striped-flow="restartProgress < 100"
          :duration="3"
        />
      </div>
    </el-dialog>

    <!-- Restart Alert Banner -->
    <el-alert
      v-if="showRestartAlert"
      type="warning"
      :closable="true"
      show-icon
      class="restart-alert"
      @close="dismissAlert"
    >
      <template #title>{{ t.config.talos.alertTitle }}</template>
      <template #default>
        <el-button
          type="warning"
          size="small"
          :icon="RefreshRight"
          :loading="isRestarting"
          @click="restartNow"
        >
          {{ t.config.talos.restartService }}
        </el-button>
      </template>
    </el-alert>

    <!-- Header -->
    <div class="config-header">
      <div class="header-left">
        <h2>{{ t.systemConfig.title }}</h2>
      </div>

      <div class="header-right">
        <el-button
          type="warning"
          :icon="RefreshRight"
          :loading="isRestarting"
          @click="confirmRestart"
        >
          {{ t.config.talos.restartService }}
        </el-button>

        <el-button :icon="Refresh" :loading="isLoading" @click="handleRefresh">
          {{ t.config.refresh }}
        </el-button>

        <el-button :icon="Download" @click="handleExport">
          {{ t.config.exportConfig }}
        </el-button>

        <el-upload
          :show-file-list="false"
          accept=".yml,.yaml"
          :before-upload="handleImport"
          style="display: inline-block"
        >
          <el-button :icon="Upload" :loading="configIOStore.isImporting">
            {{ t.config.importConfig }}
          </el-button>
        </el-upload>

        <el-button :icon="FolderOpened" @click="showBackupsDialog = true">
          {{ t.config.backups }}
        </el-button>
      </div>
    </div>

    <!-- Main Settings Card -->
    <el-card class="settings-card" shadow="never">
      <template #header>
        <span>{{ t.systemConfig.editableSettings }}</span>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="220px"
        label-position="left"
        v-loading="isLoading"
      >
        <el-form-item :label="t.systemConfig.monitorInterval" prop="monitor_interval_seconds">
          <el-input-number
            v-model="form.monitor_interval_seconds"
            :min="0.1"
            :max="3600"
            :step="0.5"
            :precision="1"
            controls-position="right"
            style="width: 200px"
          />
          <span class="unit-label">{{ t.systemConfig.seconds }}</span>
          <div class="form-item-tip">{{ t.systemConfig.monitorIntervalTip }}</div>
        </el-form-item>

        <el-form-item :label="t.systemConfig.deviceIdSeries" prop="device_id_series">
          <el-input-number
            v-model="form.device_id_series"
            :min="0"
            :max="9"
            :step="1"
            :precision="0"
            controls-position="right"
            style="width: 200px"
          />
          <div class="form-item-tip">{{ t.systemConfig.deviceIdSeriesTip }}</div>
        </el-form-item>

        <el-divider content-position="left">{{ t.systemConfig.readOnlySection }}</el-divider>

        <el-form-item :label="t.systemConfig.reverseSshPort">
          <el-input :model-value="reverseSshPortStr" readonly disabled style="width: 200px">
            <template #suffix>
              <el-tooltip :content="t.systemConfig.reverseSshPortTip" placement="top">
                <el-icon style="cursor: help"><InfoFilled /></el-icon>
              </el-tooltip>
            </template>
          </el-input>
          <div class="form-item-tip">
            {{ t.systemConfig.reverseSshPortManaged }}
            <el-link
              type="primary"
              @click="goToProvision"
              style="font-size: 12px; margin-left: 4px"
            >
              {{ t.systemConfig.goToProvision }}
            </el-link>
          </div>
        </el-form-item>
      </el-form>

      <div class="form-footer">
        <el-button @click="handleReset" :disabled="!isDirty">
          {{ t.config.common.cancel }}
        </el-button>
        <el-button type="primary" @click="handleSubmit" :loading="isSaving" :disabled="!isDirty">
          {{ t.config.common.save }}
        </el-button>
      </div>
    </el-card>

    <!-- Backup Dialog -->
    <BackupDialog
      :visible="showBackupsDialog"
      config-type="system_config"
      @close="showBackupsDialog = false"
      @restored="handleBackupRestored"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import {
  Refresh,
  FolderOpened,
  RefreshRight,
  InfoFilled,
  Download,
  Upload,
} from '@element-plus/icons-vue'
import { useUIStore } from '@/stores/ui'
import { useSystemConfigStore } from '@/stores/system_config'
import { useConfigIOStore } from '@/stores/config_io'
import BackupDialog from '@/components/config/BackupDialog.vue'
import { useTalosRestart } from '@/composables/useTalosRestart'

// ===== Stores =====
const { t } = storeToRefs(useUIStore())
const systemConfigStore = useSystemConfigStore()
const configIOStore = useConfigIOStore()
const { currentConfig, isLoading } = storeToRefs(systemConfigStore)
const router = useRouter()

// ===== Restart (shared) =====
const restartI18n = computed(() => ({
  restartTitle: t.value.config.talos.restartTitle,
  restartMessage: t.value.config.talos.restartMessage,
  restartNow: t.value.config.talos.restartNow,
  restartLater: t.value.config.talos.restartLater,
  restartReminder: t.value.config.talos.restartReminder,
  confirmRestartMessage: t.value.config.talos.confirmRestartMessage,
  confirmText: t.value.common.confirm,
  cancelText: t.value.common.cancel,
  restartWarning: t.value.config.talos.restartWarning,
  restartFailed: t.value.config.talos.restartFailed,
  restartSuccess: t.value.config.talos.restartSuccess,
  restartingTitle: t.value.config.talos.restartingTitle,
  restartingMessage: t.value.config.talos.restartingMessage,
  restartingSubtext: t.value.config.talos.restartingSubtext,
}))

const {
  isRestarting,
  showRestartAlert,
  showRestartingDialog,
  restartProgress,
  promptRestart,
  confirmRestart,
  restartNow,
  dismissAlert,
} = useTalosRestart(restartI18n, {
  onRestarted: async () => {
    await handleRefresh()
  },
})

// ===== Form =====
const formRef = ref<FormInstance>()
const isSaving = ref(false)
const showBackupsDialog = ref(false)

const form = ref({
  monitor_interval_seconds: 10.0,
  device_id_series: 0,
})

const reverseSshPortStr = computed(() => {
  const v = currentConfig.value?.reverse_ssh_port
  return typeof v === 'number' ? String(v) : '-'
})

const isDirty = computed(() => {
  if (!currentConfig.value) return false
  return (
    form.value.monitor_interval_seconds !== currentConfig.value.monitor_interval_seconds ||
    form.value.device_id_series !== currentConfig.value.device_id_series
  )
})

const rules = computed<FormRules>(() => ({
  monitor_interval_seconds: [
    { required: true, message: t.value.systemConfig.monitorIntervalRequired },
    { type: 'number', min: 0.1, max: 3600, message: t.value.systemConfig.monitorIntervalRange },
  ],
  device_id_series: [
    { required: true, message: t.value.systemConfig.deviceIdSeriesRequired },
    { type: 'number', min: 0, max: 9, message: t.value.systemConfig.deviceIdSeriesRange },
  ],
}))

// ===== Lifecycle =====
onMounted(() => void handleRefresh())

watch(
  currentConfig,
  (config) => {
    if (!config) return
    form.value.monitor_interval_seconds = config.monitor_interval_seconds
    form.value.device_id_series = config.device_id_series
  },
  { immediate: true },
)

// ===== Actions =====
const handleRefresh = async () => {
  await systemConfigStore.fetchConfig()
}

const handleReset = () => {
  if (!currentConfig.value) return
  form.value.monitor_interval_seconds = currentConfig.value.monitor_interval_seconds
  form.value.device_id_series = currentConfig.value.device_id_series
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    isSaving.value = true
    try {
      await systemConfigStore.updateConfig({
        monitor_interval_seconds: form.value.monitor_interval_seconds,
        device_id_series: form.value.device_id_series,
      })
      ElMessage.success(t.value.systemConfig.saveSuccess)
      promptRestart()
    } catch (err: unknown) {
      console.error('Failed to update system config:', err)
      ElMessage.error(t.value.systemConfig.saveFailed)
    } finally {
      isSaving.value = false
    }
  })
}

const goToProvision = () => router.push('/provision')

// ===== Export / Import =====
const handleExport = () => {
  configIOStore.exportConfig('system_config')
}

const handleImport = async (file: File) => {
  try {
    await configIOStore.importConfig('system_config', file)
    ElMessage.success(t.value.config.importSuccess)
    await handleRefresh()
    promptRestart()
  } catch {
    ElMessage.error(t.value.config.importFailed)
  }
  return false
}

// ===== Backup =====
const handleBackupRestored = async () => {
  await handleRefresh()
  promptRestart()
}
</script>

<style scoped>
.system-config-container {
  padding: 20px;
  max-width: 900px;
  margin: 0 auto;
}
.restart-alert {
  margin-bottom: 20px;
}
.restart-alert :deep(.el-alert__content) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.header-left h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}
.header-right {
  display: flex;
  gap: 12px;
}
.settings-card {
  margin-bottom: 20px;
}
.unit-label {
  margin-left: 8px;
  color: #909399;
  font-size: 13px;
}
.form-item-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}
.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}
.restarting-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 12px 0 4px;
  text-align: center;
}
.restarting-icon {
  animation: spin 1.2s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.restarting-text {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.restarting-subtext {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.restarting-content :deep(.el-progress) {
  width: 100%;
}
</style>
