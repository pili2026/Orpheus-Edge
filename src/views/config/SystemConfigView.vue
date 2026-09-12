<template>
  <div class="system-config-container">
    <RestartingDialog />

    <RestartPendingBanner />

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

    <el-card class="settings-card" shadow="never">
      <template #header>
        <span>{{ t.systemConfig.editableSettings }}</span>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="240px"
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
            @change="handleMonitorIntervalChange"
          />
          <span class="unit-label">{{ t.systemConfig.seconds }}</span>
          <div class="form-item-tip">{{ t.systemConfig.monitorIntervalTip }}</div>
        </el-form-item>

        <el-form-item
          :label="t.systemConfig.controlInterval || 'Control Evaluation Interval'"
          prop="control_interval_seconds"
        >
          <el-input-number
            v-model="form.control_interval_seconds"
            :min="form.monitor_interval_seconds"
            :max="3600"
            :step="0.5"
            :precision="1"
            controls-position="right"
            style="width: 200px"
            placeholder="Auto (Inherit)"
            value-on-clear="null"
          />
          <span class="unit-label">{{ t.systemConfig.seconds }}</span>
          <div class="form-item-tip">
            {{ t.systemConfig.controlIntervalTip || 'Leave empty to inherit monitor interval.' }}
          </div>
        </el-form-item>

        <el-form-item
          :label="t.systemConfig.alertInterval || 'Alert Evaluation Interval'"
          prop="alert_interval_seconds"
        >
          <el-input-number
            v-model="form.alert_interval_seconds"
            :min="form.monitor_interval_seconds"
            :max="3600"
            :step="0.5"
            :precision="1"
            controls-position="right"
            style="width: 200px"
            placeholder="Auto (Inherit)"
            value-on-clear="null"
          />
          <span class="unit-label">{{ t.systemConfig.seconds }}</span>
          <div class="form-item-tip">
            {{ t.systemConfig.alertIntervalTip || 'Leave empty to inherit monitor interval.' }}
          </div>
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
import { useRestartStore } from '@/stores/restart'
import BackupDialog from '@/components/config/BackupDialog.vue'
import RestartPendingBanner from '@/components/config/RestartPendingBanner.vue'
import RestartingDialog from '@/components/config/RestartingDialog.vue'
import { useTalosRestart } from '@/composables/useTalosRestart'

// ===== Stores =====
const { t } = storeToRefs(useUIStore())
const systemConfigStore = useSystemConfigStore()
const configIOStore = useConfigIOStore()
const { currentConfig, isLoading } = storeToRefs(systemConfigStore)
const router = useRouter()

// ===== Restart (shared) =====
const { isRestarting, promptRestart, confirmRestart } = useTalosRestart('system')
const { restartCompletion } = storeToRefs(useRestartStore())

// A completed restart is announced by the store, not by a per-view callback.
// The restart kills the whole Talos process, so this view's data is stale
// after every completion and it refetches on each one.
watch(restartCompletion, () => void handleRefresh())

// ===== Form =====
const formRef = ref<FormInstance>()
const isSaving = ref(false)
const showBackupsDialog = ref(false)

// 更新表單結構以包含新的間隔設定
const form = ref({
  monitor_interval_seconds: 10.0,
  control_interval_seconds: null as number | null,
  alert_interval_seconds: null as number | null,
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
    form.value.control_interval_seconds !==
      (currentConfig.value.control_interval_seconds ?? null) ||
    form.value.alert_interval_seconds !== (currentConfig.value.alert_interval_seconds ?? null) ||
    form.value.device_id_series !== currentConfig.value.device_id_series
  )
})

const validateInterval = (rule: any, value: any, callback: any) => {
  if (value !== null && value !== undefined && value !== '') {
    if (value < form.value.monitor_interval_seconds) {
      callback(
        new Error(
          t.value.systemConfig.intervalValidationMsg ||
            `Must be >= Monitor Interval (${form.value.monitor_interval_seconds}s)`,
        ),
      )
    } else {
      callback()
    }
  } else {
    callback() // 允許為空 (null)
  }
}

const rules = computed<FormRules>(() => ({
  monitor_interval_seconds: [
    { required: true, message: t.value.systemConfig.monitorIntervalRequired },
    { type: 'number', min: 0.1, max: 3600, message: t.value.systemConfig.monitorIntervalRange },
  ],
  control_interval_seconds: [{ validator: validateInterval, trigger: ['blur', 'change'] }],
  alert_interval_seconds: [{ validator: validateInterval, trigger: ['blur', 'change'] }],
  device_id_series: [
    { required: true, message: t.value.systemConfig.deviceIdSeriesRequired },
    { type: 'number', min: 0, max: 9, message: t.value.systemConfig.deviceIdSeriesRange },
  ],
}))

// ===== Lifecycle =====
onMounted(() => void handleRefresh())

// Whether the form held unsaved edits when the last refetch was requested.
// `isDirty` compares the form with `currentConfig`, and by the time the
// watcher below runs, `currentConfig` is already the freshly fetched value --
// so the question "had the operator edited?" has to be asked before the fetch.
let editedBeforeFetch = false

watch(
  currentConfig,
  (config, previous) => {
    if (!config) return
    // A form with unsaved edits is never overwritten by a fetch, whatever
    // triggered it: the edits are the operator's work, typed in and not yet
    // saved, and a refetch that replaced them would lose that work with no
    // way back. `currentConfig` -- the baseline `isDirty` compares against --
    // has already moved to the fetched values, so the edits keep showing as
    // unsaved and Reset still restores the stored ones; only the copy into the
    // form is withheld. Stage 2 keeps every view dirty for long stretches, so
    // this is the normal case there, not the corner one.
    const keepEdits = editedBeforeFetch && isDirty.value
    editedBeforeFetch = false
    if (keepEdits) {
      if (previous && JSON.stringify(previous) !== JSON.stringify(config)) {
        ElMessage.warning(t.value.common.changedWhileEditing)
      }
      return
    }
    form.value.monitor_interval_seconds = config.monitor_interval_seconds
    form.value.control_interval_seconds = config.control_interval_seconds ?? null
    form.value.alert_interval_seconds = config.alert_interval_seconds ?? null
    form.value.device_id_series = config.device_id_series
  },
  { immediate: true },
)

// ===== Actions =====
const handleRefresh = async () => {
  editedBeforeFetch = isDirty.value
  try {
    await systemConfigStore.fetchConfig()
  } finally {
    // a fetch that never assigned currentConfig must not leave a stale answer
    // behind for the next assignment (e.g. the refetch after a save)
    editedBeforeFetch = false
  }
}

const handleMonitorIntervalChange = () => {
  if (formRef.value) {
    formRef.value.validateField('control_interval_seconds').catch(() => {})
    formRef.value.validateField('alert_interval_seconds').catch(() => {})
  }
}

const handleReset = () => {
  if (!currentConfig.value) return
  form.value.monitor_interval_seconds = currentConfig.value.monitor_interval_seconds
  form.value.control_interval_seconds = currentConfig.value.control_interval_seconds ?? null
  form.value.alert_interval_seconds = currentConfig.value.alert_interval_seconds ?? null
  form.value.device_id_series = currentConfig.value.device_id_series

  if (formRef.value) {
    formRef.value.clearValidate()
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    isSaving.value = true
    try {
      await systemConfigStore.updateConfig({
        monitor_interval_seconds: form.value.monitor_interval_seconds,
        control_interval_seconds: form.value.control_interval_seconds,
        alert_interval_seconds: form.value.alert_interval_seconds,
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
</style>
