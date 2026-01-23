<template>
  <div class="provision-settings">
    <!-- Page Header -->
    <div class="page-header">
      <h2>{{ t.provision.title }}</h2>
      <p class="description">{{ t.provision.description }}</p>
    </div>

    <!-- Current Configuration Card -->
    <el-card class="config-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>{{ t.provision.currentConfig }}</span>
          <el-button
            type="primary"
            :icon="Refresh"
            size="small"
            :loading="loadingConfig"
            @click="loadCurrentConfig"
          >
            {{ t.common.refresh }}
          </el-button>
        </div>
      </template>

      <!-- Loading State -->
      <div v-if="loadingConfig" class="loading-container">
        <el-skeleton :rows="3" animated />
      </div>

      <!-- Configuration Display -->
      <div v-else-if="currentConfig" class="config-display">
        <el-descriptions :column="1" border>
          <el-descriptions-item>
            <template #label>
              <div class="label-with-icon">
                <el-icon><Monitor /></el-icon>
                <span>{{ t.provision.hostname }}</span>
              </div>
            </template>
            <el-tag type="success" size="large">{{ currentConfig.hostname }}</el-tag>
          </el-descriptions-item>

          <el-descriptions-item>
            <template #label>
              <div class="label-with-icon">
                <el-icon><Connection /></el-icon>
                <span>{{ t.provision.reversePort }}</span>
              </div>
            </template>
            <el-tag type="info" size="large">{{ currentConfig.reverse_port }}</el-tag>
          </el-descriptions-item>

          <el-descriptions-item>
            <template #label>
              <div class="label-with-icon">
                <el-icon><Document /></el-icon>
                <span>{{ t.provision.portSource }}</span>
              </div>
            </template>
            <el-tag :type="currentConfig.port_source === 'service' ? 'success' : 'warning'">
              {{ currentConfig.port_source }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- Error State -->
      <el-alert
        v-else-if="loadError"
        type="error"
        :title="t.provision.loadError"
        :description="loadError"
        show-icon
        :closable="false"
      />
    </el-card>

    <!-- Edit Configuration Card -->
    <el-card class="config-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>{{ t.provision.editConfig }}</span>
          <el-tag v-if="hasChanges" type="warning" size="small">
            {{ t.provision.unsavedChanges }}
          </el-tag>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="140px"
        label-position="left"
        @submit.prevent="handleSaveConfig"
      >
        <!-- Hostname -->
        <el-form-item :label="t.provision.hostname" prop="hostname">
          <el-input
            v-model="formData.hostname"
            :placeholder="t.provision.hostnamePlaceholder"
            maxlength="11"
            show-word-limit
            clearable
          >
            <template #prepend>
              <el-icon><Monitor /></el-icon>
            </template>
          </el-input>
          <template #error="{ error }">
            <div class="form-error">{{ error }}</div>
          </template>
        </el-form-item>

        <!-- Reverse SSH Port -->
        <el-form-item :label="t.provision.reversePort" prop="reverse_port">
          <el-input-number
            v-model="formData.reverse_port"
            :min="1024"
            :max="65535"
            :step="1"
            controls-position="right"
            style="width: 100%"
          />
          <template #error="{ error }">
            <div class="form-error">{{ error }}</div>
          </template>
        </el-form-item>

        <!-- Info Alert -->
        <el-alert type="info" :closable="false" show-icon style="margin-bottom: 20px">
          <template #title>
            <div style="font-size: 13px">{{ t.provision.hostnameChangeWarning }}</div>
          </template>
        </el-alert>

        <!-- Action Buttons -->
        <el-form-item>
          <el-space :size="12">
            <el-button
              type="primary"
              :loading="saving"
              :disabled="!hasChanges || loadingConfig"
              @click="handleSaveConfig"
            >
              {{ t.common.save }}
            </el-button>
            <el-button :disabled="!hasChanges || saving" @click="handleResetForm">
              {{ t.common.reset }}
            </el-button>
          </el-space>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Reboot Card -->
    <el-card class="config-card reboot-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>{{ t.provision.systemReboot }}</span>
          <el-tag type="danger" size="small">
            <el-icon><Warning /></el-icon>
            {{ t.provision.dangerZone }}
          </el-tag>
        </div>
      </template>

      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 16px">
        <template #title>
          <div style="font-size: 13px">{{ t.provision.rebootWarning }}</div>
        </template>
      </el-alert>

      <el-button type="danger" :icon="RefreshLeft" :loading="rebooting" @click="handleRebootClick">
        {{ t.provision.rebootSystem }}
      </el-button>
    </el-card>

    <!-- Reboot Confirmation Dialog -->
    <el-dialog
      v-model="showRebootDialog"
      :title="t.provision.confirmReboot"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-alert type="error" :closable="false" show-icon>
        <template #title>
          <div style="font-weight: 600; margin-bottom: 8px">
            {{ t.provision.rebootDialogWarning }}
          </div>
        </template>
        <div style="font-size: 13px; line-height: 1.6">
          {{ t.provision.rebootDialogMessage }}
        </div>
      </el-alert>

      <template #footer>
        <el-space>
          <el-button @click="showRebootDialog = false" :disabled="rebooting">
            {{ t.common.cancel }}
          </el-button>
          <el-button type="danger" :loading="rebooting" @click="handleConfirmReboot">
            {{ t.provision.confirmRebootButton }}
          </el-button>
        </el-space>
      </template>
    </el-dialog>

    <!-- Reboot Loading Overlay -->
    <el-dialog
      v-model="systemRebooting"
      :title="t.provision.systemRebooting"
      width="400px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
      center
    >
      <div class="reboot-loading">
        <el-icon class="is-loading" :size="60" color="#409eff">
          <Loading />
        </el-icon>

        <div class="loading-text">
          <p class="main-text">{{ t.provision.reconnecting }}</p>
          <p class="sub-text">
            {{ t.provision.checkingConnection }}
            ({{ reconnectAttempts }}/{{ maxReconnectAttempts }})
          </p>
        </div>

        <el-progress
          :percentage="Math.floor((reconnectAttempts / maxReconnectAttempts) * 100)"
          :status="reconnectAttempts >= maxReconnectAttempts ? 'exception' : undefined"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import {
  Refresh,
  Monitor,
  Connection,
  Document,
  Warning,
  RefreshLeft,
  Loading,
} from '@element-plus/icons-vue'
import { provisionService } from '@/services/provision'
import { useI18n } from '@/composables/useI18n'
import type { ProvisionCurrentConfig, ProvisionSetConfigResult } from '@/types/provision'

const { t } = useI18n()

// ==================== State ====================
const loadingConfig = ref(false)
const loadError = ref<string | null>(null)
const currentConfig = ref<ProvisionCurrentConfig | null>(null)

const formRef = ref<FormInstance>()
const formData = ref({
  hostname: '',
  reverse_port: 8600,
})

const saving = ref(false)
const rebooting = ref(false)
const showRebootDialog = ref(false)
const systemRebooting = ref(false)
const reconnectAttempts = ref(0)
const maxReconnectAttempts = 30 // 30 attempts = ~2 minutes
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// ==================== Form Validation Rules ====================
const formRules: FormRules = {
  hostname: [
    { required: true, message: 'Hostname is required', trigger: 'blur' },
    {
      pattern: /^[a-zA-Z0-9]{1,11}$/,
      message: 'Hostname must be 1-11 alphanumeric characters',
      trigger: 'blur',
    },
  ],
  reverse_port: [
    { required: true, message: 'Reverse SSH port is required', trigger: 'blur' },
    {
      type: 'number',
      min: 1024,
      max: 65535,
      message: 'Port must be between 1024 and 65535',
      trigger: 'blur',
    },
  ],
}

// ==================== Computed ====================
const hasChanges = computed(() => {
  if (!currentConfig.value) return false
  return (
    formData.value.hostname !== currentConfig.value.hostname ||
    formData.value.reverse_port !== currentConfig.value.reverse_port
  )
})

// ==================== Methods ====================

/**
 * Load current configuration from the server
 */
const loadCurrentConfig = async () => {
  loadingConfig.value = true
  loadError.value = null

  try {
    const config = await provisionService.getCurrentConfig()
    currentConfig.value = config

    // Update form data
    formData.value.hostname = config.hostname
    formData.value.reverse_port = config.reverse_port

    console.log('[Provision] Loaded config:', config)
  } catch (error) {
    const err = error as Error
    console.error('[Provision] Failed to load config:', err)
    loadError.value = err.message
    ElMessage.error(`Failed to load configuration: ${err.message}`)
  } finally {
    loadingConfig.value = false
  }
}

/**
 * Save configuration changes
 */
const handleSaveConfig = async () => {
  if (!formRef.value) return

  // Confirm form validation
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true

  try {
    const result: ProvisionSetConfigResult = await provisionService.setConfig(
      formData.value.hostname,
      formData.value.reverse_port,
    )

    console.log('[Provision] Save result:', result)

    if (result.success) {
      ElMessage.success(result.message)

      // Reload current config
      await loadCurrentConfig()

      // If reboot is required, prompt user
      if (result.requires_reboot) {
        ElMessageBox.confirm(
          t.value.provision.rebootRequiredMessage,
          t.value.provision.rebootRequiredTitle,
          {
            type: 'warning',
            confirmButtonText: t.value.common.rebootNow,
            cancelButtonText: t.value.common.later,
          },
        )
          .then(() => {
            showRebootDialog.value = true
          })
          .catch(() => {
            // User chose not to reboot
            console.log('[Provision] User postponed reboot')
          })
      }
    } else {
      ElMessage.warning(result.message)
    }
  } catch (error) {
    const err = error as Error
    console.error('[Provision] Failed to save config:', err)
    ElMessage.error(`Failed to save configuration: ${err.message}`)
  } finally {
    saving.value = false
  }
}

/**
 * Reset form to current configuration values
 */
const handleResetForm = () => {
  if (!currentConfig.value) return

  formData.value.hostname = currentConfig.value.hostname
  formData.value.reverse_port = currentConfig.value.reverse_port

  formRef.value?.clearValidate()
}

/**
 * Handle reboot button click
 */
const handleRebootClick = () => {
  showRebootDialog.value = true
}

/**
 * Confirm and initiate system reboot
 */
const handleConfirmReboot = async () => {
  rebooting.value = true

  try {
    const result = await provisionService.triggerReboot()

    if (result.success) {
      ElMessage.success({
        message: t.value.provision.rebootInitiated,
        duration: 3000,
      })

      showRebootDialog.value = false

      // Start reboot process
      startRebootProcess()
    }
  } catch (error) {
    const err = error as Error
    console.error('[Provision] Failed to trigger reboot:', err)
    ElMessage.error(`Failed to trigger reboot: ${err.message}`)
    rebooting.value = false
  }
}

/**
 * Start the reboot process
 */
const startRebootProcess = () => {
  systemRebooting.value = true
  reconnectAttempts.value = 0

  // Wait a bit before starting reconnect checks
  setTimeout(() => {
    rebooting.value = false
    startReconnectChecks()
  }, 10000)
}

/**
 * Start checking for system reconnection
 */
const startReconnectChecks = () => {
  console.log('[Provision] Starting reconnect checks...')

  ElMessage.info({
    message: t.value.provision.waitingForSystem,
    duration: 0, // until closed manually
    showClose: true,
  })

  checkSystemHealth()
}

/**
 * Check system health and attempt to reconnect
 */
const checkSystemHealth = async () => {
  reconnectAttempts.value++

  console.log(`[Provision] Reconnect attempt ${reconnectAttempts.value}/${maxReconnectAttempts}`)

  try {
    // Try to get current config as a health check
    const config = await provisionService.getCurrentConfig()

    if (config) {
      // System is back online
      handleReconnectSuccess()
    }
  } catch (error) {
    // System not yet back online
    if (reconnectAttempts.value < maxReconnectAttempts) {
      reconnectTimer = setTimeout(checkSystemHealth, 4000) // retry after 4 seconds
    } else {
      handleReconnectFailed()
    }
  }
}

/**
 * Connected successfully
 */
const handleReconnectSuccess = async () => {
  console.log('[Provision] System reconnected successfully')

  // Clear timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  ElMessage.closeAll()
  ElMessage.success({
    message: t.value.provision.reconnectSuccess,
    duration: 3000,
  })

  systemRebooting.value = false
  reconnectAttempts.value = 0

  // Reload current config
  await loadCurrentConfig()
}

/**
 * Reconnect failed after maximum attempts
 */
const handleReconnectFailed = () => {
  console.error('[Provision] Failed to reconnect after maximum attempts')

  // Clear timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  ElMessage.closeAll()
  ElMessage.error({
    message: t.value.provision.reconnectFailed,
    duration: 0,
    showClose: true,
  })

  systemRebooting.value = false
  reconnectAttempts.value = 0
}

// ==================== Lifecycle ====================
onMounted(() => {
  console.log('[Provision] Component mounted')
  loadCurrentConfig()
})

onUnmounted(() => {
  console.log('[Provision] Component unmounted, cleaning up...')
  // Clear reconnect timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
})

// ==================== Watchers ====================
watch(
  () => currentConfig.value,
  (newConfig) => {
    if (newConfig) {
      console.log('[Provision] Config updated:', newConfig)
    }
  },
)
</script>

<style scoped>
.provision-settings {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.page-header .description {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.config-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.loading-container {
  padding: 20px 0;
}

.config-display {
  margin-top: -10px;
}

.label-with-icon {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-error {
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.4;
  padding-top: 4px;
}

.reboot-card {
  border: 1px solid var(--el-color-danger-light-5);
}

.reboot-card :deep(.el-card__header) {
  background-color: var(--el-color-danger-light-9);
}

/* Reboot Loading Styles */
.reboot-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 20px;
}

.reboot-loading .loading-text {
  text-align: center;
}

.reboot-loading .main-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 8px 0;
}

.reboot-loading .sub-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin: 0;
}

.reboot-loading :deep(.el-progress) {
  width: 100%;
}

/* Responsive */
@media (max-width: 768px) {
  .provision-settings {
    padding: 12px;
  }

  .page-header h2 {
    font-size: 20px;
  }

  :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left !important;
  }

  :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }
}
</style>
