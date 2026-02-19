<template>
  <div class="config-container">
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
          <!-- Prevent issues caused by an unregistered icon component -->
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

        <p class="restarting-countdown">
          {{
            restartProgress < 100 ? t.config.talos.restartingSubtext : t.config.talos.restartSuccess
          }}
        </p>
      </div>
    </el-dialog>

    <!-- Warning banner: displayed before the upcoming restart -->
    <el-alert
      v-if="showRestartAlert"
      type="warning"
      :closable="true"
      show-icon
      class="restart-alert"
      @close="showRestartAlert = false"
    >
      <template #title>
        {{ t.config.talos.alertTitle }}
      </template>
      <template #default>
        <el-button
          type="warning"
          size="small"
          :icon="RefreshRight"
          :loading="isRestarting"
          @click="handleRestartService"
        >
          {{ t.config.talos.restartService }}
        </el-button>
      </template>
    </el-alert>

    <!-- Header -->
    <div class="config-header">
      <div class="header-left">
        <h2>{{ t.config.title }}</h2>
        <el-tag v-if="metadata" type="info" size="small">
          {{ t.config.generation }}: {{ metadata.generation }}
        </el-tag>
      </div>

      <div class="header-right">
        <!-- Restart service button (always visible) -->
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
        <el-button :icon="FolderOpened" @click="openBackupsDialog">
          {{ t.config.backups }}
        </el-button>
      </div>
    </div>

    <!-- Metadata Card -->
    <el-card v-if="metadata" class="metadata-card" shadow="never">
      <template #header>
        <span>{{ t.config.metadata.title }}</span>
      </template>
      <div class="metadata-grid">
        <div class="metadata-item">
          <span class="label">{{ t.config.metadata.generation }}:</span>
          <span class="value">{{ metadata.generation }}</span>
        </div>
        <div class="metadata-item">
          <span class="label">{{ t.config.metadata.source }}:</span>
          <el-tag :type="getSourceType(metadata.source)" size="small">
            {{ metadata.source }}
          </el-tag>
        </div>
        <div class="metadata-item">
          <span class="label">{{ t.config.metadata.lastModified }}:</span>
          <span class="value">{{ formatTimestamp(metadata.last_modified) }}</span>
        </div>
        <div class="metadata-item">
          <span class="label">{{ t.config.metadata.modifiedBy }}:</span>
          <span class="value">{{ metadata.last_modified_by }}</span>
        </div>
        <div class="metadata-item">
          <span class="label">{{ t.config.metadata.checksum }}:</span>
          <span class="value mono">{{ metadata.checksum.substring(0, 16) }}...</span>
        </div>
      </div>
    </el-card>

    <!-- Tabs -->
    <el-tabs v-model="activeTab" class="config-tabs">
      <!-- Buses Tab -->
      <el-tab-pane :label="t.config.tabs.buses" name="buses">
        <div class="tab-header">
          <el-button type="primary" :icon="Plus" @click="showBusDialog()">
            {{ t.config.bus.addBus }}
          </el-button>
        </div>

        <el-table :data="busList" stripe style="width: 100%">
          <el-table-column prop="name" :label="t.config.bus.name" width="150" />
          <el-table-column prop="port" :label="t.config.bus.port" width="200" />
          <el-table-column prop="baudrate" :label="t.config.bus.baudrate" width="120" />
          <el-table-column prop="timeout" :label="t.config.bus.timeout" width="120" />
          <el-table-column :label="t.config.bus.devices" width="100">
            <template #default="{ row }">
              {{ getDeviceCountForBus(row.name) }}
            </template>
          </el-table-column>
          <el-table-column :label="t.config.bus.actions" fixed="right" width="180">
            <template #default="{ row }">
              <el-button size="small" :icon="Edit" @click="showBusDialog(row)">
                {{ t.config.bus.edit }}
              </el-button>
              <el-popconfirm
                :title="t.config.bus.deleteConfirm"
                @confirm="handleDeleteBus(row.name)"
              >
                <template #reference>
                  <el-button size="small" type="danger" :icon="Delete">
                    {{ t.config.bus.delete }}
                  </el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Devices Tab -->
      <el-tab-pane :label="t.config.tabs.devices" name="devices">
        <div class="tab-header">
          <el-button type="primary" :icon="Plus" @click="openDeviceDialog()">
            {{ t.config.device.addDevice }}
          </el-button>
        </div>

        <el-table :data="devices" stripe style="width: 100%">
          <el-table-column :label="t.config.device.displayName" width="200">
            <template #default="{ row }">
              {{ getDeviceDisplayName(row) }}
            </template>
          </el-table-column>
          <el-table-column prop="model" :label="t.config.device.model" width="150" />
          <el-table-column :label="t.config.device.type" width="150">
            <template #default="{ row }">
              <el-tag :type="getDeviceTypeColor(row.type)" size="small">
                {{ getDeviceTypeLabel(row.type) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="slave_id" :label="t.config.device.slaveId" width="100" />
          <el-table-column prop="bus" :label="t.config.device.bus" width="120" />
          <el-table-column :label="t.config.device.purpose" width="150">
            <template #default="{ row }">
              {{ getModeString(row.modes, 'purpose') }}
            </template>
          </el-table-column>
          <el-table-column :label="t.config.bus.actions" fixed="right" width="180">
            <template #default="{ row }">
              <el-button size="small" :icon="Edit" @click="openDeviceDialog(row)">
                {{ t.config.bus.edit }}
              </el-button>
              <el-popconfirm
                :title="t.config.device.deleteConfirm"
                @confirm="handleDeleteDevice(row.model, row.slave_id)"
              >
                <template #reference>
                  <el-button size="small" type="danger" :icon="Delete">
                    {{ t.config.bus.delete }}
                  </el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- Bus Dialog -->
    <el-dialog
      v-model="busDialogVisible"
      :title="busDialogMode === 'create' ? t.config.bus.addBus : t.config.bus.editBus"
      width="500px"
    >
      <el-form :model="busForm" :rules="busRules" ref="busFormRef" label-width="120px">
        <el-form-item :label="t.config.bus.name" prop="name">
          <el-input
            v-model="busForm.name"
            :placeholder="t.config.bus.namePlaceholder"
            :disabled="busDialogMode === 'edit'"
          />
        </el-form-item>
        <el-form-item :label="t.config.bus.port" prop="port">
          <el-input v-model="busForm.port" :placeholder="t.config.bus.portPlaceholder" />
        </el-form-item>
        <el-form-item :label="t.config.bus.baudrate" prop="baudrate">
          <el-input-number v-model="busForm.baudrate" :min="1200" :max="115200" :step="100" />
        </el-form-item>
        <el-form-item :label="t.config.bus.timeout" prop="timeout">
          <el-input-number v-model="busForm.timeout" :min="0.1" :max="10" :step="0.1" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="busDialogVisible = false">{{ t.config.common.cancel }}</el-button>
        <el-button type="primary" @click="handleSaveBus">{{ t.config.common.save }}</el-button>
      </template>
    </el-dialog>

    <!-- Device Dialog -->
    <DeviceDialog
      :visible="deviceDialogVisible"
      :device="currentDevice"
      :is-edit="isEditDevice"
      @close="closeDeviceDialog"
      @submit="handleDeviceSubmit"
    />

    <!-- Backups Dialog -->
    <el-dialog v-model="showBackupsDialog" :title="t.config.backup.title" width="800px">
      <el-button
        :icon="Refresh"
        size="small"
        @click="handleRefreshBackups"
        style="margin-bottom: 16px"
      >
        {{ t.config.refresh }}
      </el-button>

      <el-table :data="backups" stripe>
        <el-table-column prop="filename" :label="t.config.backup.filename" />
        <el-table-column prop="generation" :label="t.config.backup.generation" width="100" />
        <el-table-column :label="t.config.backup.created" width="200">
          <template #default="{ row }">
            {{ formatTimestamp(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column :label="t.config.backup.size" width="100">
          <template #default="{ row }">
            {{ formatSize(row.size_bytes) }}
          </template>
        </el-table-column>
        <el-table-column :label="t.config.backup.actions" width="120" fixed="right">
          <template #default="{ row }">
            <el-popconfirm
              :title="t.config.backup.restoreConfirm"
              @confirm="handleRestoreBackup(row.filename)"
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { Plus, Edit, Delete, Refresh, FolderOpened, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import axios from 'axios'
import { useUIStore } from '@/stores/ui'
import { useConfigStore, type ModbusDevice, type ModbusBus } from '@/stores/modbus_config'
import DeviceDialog from '@/components/config/DeviceDialog.vue'

type TagType = 'success' | 'info' | 'warning' | 'danger' | ''

// ===== Stores =====
const { t } = storeToRefs(useUIStore())
const configStore = useConfigStore()
const { metadata, devices, busList, backups, isLoading } = storeToRefs(configStore)

// ===== State =====
const activeTab = ref<'buses' | 'devices'>('buses')
const showBackupsDialog = ref(false)

// Talos restart related
const isRestarting = ref(false)
const showRestartAlert = ref(false)
const showRestartingDialog = ref(false)
const restartProgress = ref(0)

let restartTimer: ReturnType<typeof setInterval> | null = null
let pollingTimer: ReturnType<typeof setTimeout> | null = null

// Fake progress logic (runs to 80%, then waits for polling confirmation)
const FAKE_PROGRESS_DURATION = 15
const POLL_INITIAL_DELAY = 3000
const POLL_INTERVAL = 2000
const POLL_MAX_ATTEMPTS = 25

// Bus Dialog
const busDialogVisible = ref(false)
const busDialogMode = ref<'create' | 'edit'>('create')
const busFormRef = ref<FormInstance>()
const busForm = ref({
  name: '',
  port: '',
  baudrate: 9600,
  timeout: 1.0,
})

// Device Dialog
const deviceDialogVisible = ref(false)
const currentDevice = ref<ModbusDevice | undefined>(undefined)
const isEditDevice = ref(false)

// ===== Validation Rules =====
const busRules = computed<FormRules>(() => ({
  name: [{ required: true, message: t.value.config.bus.nameRequired }],
  port: [{ required: true, message: t.value.config.bus.portRequired }],
  baudrate: [{ required: true, message: t.value.config.bus.baudrateRequired }],
  timeout: [{ required: true, message: t.value.config.bus.timeoutRequired }],
}))

// ===== Lifecycle =====
onMounted(() => {
  void handleRefresh()
})

onUnmounted(() => {
  stopRestartTimers()
})

// ===== Talos restart related =====

const promptRestartTalos = () => {
  ElMessageBox.confirm(t.value.config.talos.restartMessage, t.value.config.talos.restartTitle, {
    confirmButtonText: t.value.config.talos.restartNow,
    cancelButtonText: t.value.config.talos.restartLater,
    type: 'warning',
    distinguishCancelAndClose: true,
  })
    .then(() => {
      void handleRestartService()
    })
    .catch((action: 'cancel' | 'close') => {
      if (action === 'cancel') {
        showRestartAlert.value = true
        ElMessage.info({
          message: t.value.config.talos.restartReminder,
          duration: 5000,
        })
      }
    })
}

const confirmRestart = () => {
  ElMessageBox.confirm(
    t.value.config.talos.confirmRestartMessage,
    t.value.config.talos.restartService,
    {
      confirmButtonText: t.value.common.confirm,
      cancelButtonText: t.value.common.cancel,
      type: 'warning',
    },
  )
    .then(() => {
      void handleRestartService()
    })
    .catch(() => {})
}

const handleRestartService = async () => {
  if (isRestarting.value) return

  isRestarting.value = true
  showRestartAlert.value = false

  try {
    const response = await axios.post<{ success: boolean; message?: string }>(
      '/api/provision/service/restart',
    )

    if (response.data.success) {
      startRestartCountdown()
      return
    }

    ElMessage.warning({
      message: response.data.message || t.value.config.talos.restartWarning,
      duration: 5000,
    })
    isRestarting.value = false
  } catch (err: unknown) {
    console.error('Failed to call restart API:', err)
    ElMessage.error({
      message: t.value.config.talos.restartFailed,
      duration: 5000,
    })
    isRestarting.value = false
  }
}

const startRestartCountdown = () => {
  restartProgress.value = 0
  showRestartingDialog.value = true

  // Fake progress bar: increment every second, capped at 80%
  let elapsed = 0
  restartTimer = setInterval(() => {
    elapsed += 1
    restartProgress.value = Math.min(Math.round((elapsed / FAKE_PROGRESS_DURATION) * 80), 80)
  }, 1000)

  // Start polling after a delay
  pollingTimer = setTimeout(() => {
    startPolling()
  }, POLL_INITIAL_DELAY)
}

const startPolling = (attempt = 0) => {
  if (attempt >= POLL_MAX_ATTEMPTS) {
    stopRestartTimers()
    showRestartingDialog.value = false
    isRestarting.value = false
    ElMessage.error({
      message: t.value.config.talos.restartFailed,
      duration: 5000,
    })
    return
  }

  axios
    .get('/api/provision/config', { timeout: 2000 })
    .then(() => {
      stopRestartTimers()
      restartProgress.value = 100

      setTimeout(() => {
        showRestartingDialog.value = false
        isRestarting.value = false
        ElMessage.success({
          message: t.value.config.talos.restartSuccess,
          duration: 3000,
        })
        void handleRefresh()
      }, 600)
    })
    .catch(() => {
      pollingTimer = setTimeout(() => startPolling(attempt + 1), POLL_INTERVAL)
    })
}

const stopRestartTimers = () => {
  if (restartTimer) {
    clearInterval(restartTimer)
    restartTimer = null
  }
  if (pollingTimer) {
    clearTimeout(pollingTimer)
    pollingTimer = null
  }
}

// ===== General Handlers =====
const handleRefresh = async () => {
  await configStore.fetchConfig()
}

const handleRefreshBackups = async () => {
  await configStore.fetchBackups()
}

const openBackupsDialog = async () => {
  showBackupsDialog.value = true
  await handleRefreshBackups()
}

// ===== Bus Handlers =====
const showBusDialog = (bus?: ModbusBus) => {
  if (bus) {
    busDialogMode.value = 'edit'
    // Explicit assignment to avoid type inference issues
    // caused by spread operators or unintended extra fields
    busForm.value = {
      name: bus.name,
      port: bus.port,
      baudrate: bus.baudrate,
      timeout: bus.timeout,
    }
  } else {
    busDialogMode.value = 'create'
    busForm.value = { name: '', port: '', baudrate: 9600, timeout: 1.0 }
  }
  busDialogVisible.value = true
}

const handleSaveBus = async () => {
  if (!busFormRef.value) return

  await busFormRef.value.validate(async (valid) => {
    if (!valid) return

    try {
      await configStore.createOrUpdateBus(
        busForm.value.name,
        {
          port: busForm.value.port,
          baudrate: busForm.value.baudrate,
          timeout: busForm.value.timeout,
        },
        'web-user',
      )
      busDialogVisible.value = false
      promptRestartTalos()
    } catch {
      // handled in store
    }
  })
}

const handleDeleteBus = async (name: string) => {
  try {
    await configStore.deleteBus(name, 'web-user')
    promptRestartTalos()
  } catch {
    // handled in store
  }
}

// ===== Device Handlers =====
const openDeviceDialog = (device?: ModbusDevice) => {
  if (device) {
    currentDevice.value = { ...device }
    isEditDevice.value = true
  } else {
    currentDevice.value = undefined
    isEditDevice.value = false
  }
  deviceDialogVisible.value = true
}

const closeDeviceDialog = () => {
  deviceDialogVisible.value = false
  currentDevice.value = undefined
  isEditDevice.value = false
}

const handleDeviceSubmit = async (device: ModbusDevice) => {
  try {
    await configStore.createOrUpdateDevice(device, 'web-user')
    closeDeviceDialog()
    promptRestartTalos()
  } catch (err: unknown) {
    console.error('Failed to save device:', err)
  }
}

const handleDeleteDevice = async (model: string, slaveId: number) => {
  try {
    await configStore.deleteDevice(model, slaveId, 'web-user')
    promptRestartTalos()
  } catch {
    // handled in store
  }
}

// ===== Backup Handlers =====
const handleRestoreBackup = async (filename: string) => {
  try {
    await configStore.restoreBackup(filename, 'web-user')
    showBackupsDialog.value = false
    promptRestartTalos()
  } catch {
    // handled in store
  }
}

// ===== Helper Functions =====
const getSourceType = (source: string): TagType => {
  const map: Record<string, TagType> = { manual: 'info', edge: 'success', cloud: 'warning' }
  return map[source] ?? 'info'
}

const formatTimestamp = (ts: string) => {
  if (!ts) return 'N/A'
  return new Date(ts).toLocaleString()
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const getDeviceCountForBus = (busName: string) =>
  devices.value.filter((d) => d.bus === busName).length

const getDeviceDisplayName = (device: ModbusDevice) => configStore.getDeviceDisplayName(device)

const getModeString = (modes: Record<string, unknown> | undefined, key: string): string => {
  const v = modes?.[key]
  return typeof v === 'string' && v.trim() ? v : '-'
}

const getDeviceTypeLabel = (type: string): string => {
  // Use map here to avoid `types[type]` becoming undefined
  // due to inconsistent i18n keys
  const typeMap: Record<string, string> = {
    vfd: t.value.config.device.types.vfd,
    inverter: t.value.config.device.types.vfd,
    power_meter: t.value.config.device.types.powerMeter,
    powerMeter: t.value.config.device.types.powerMeter,
    analog_input: t.value.config.device.types.analogInput,
    analogInput: t.value.config.device.types.analogInput,
    sensor: t.value.config.device.types.sensor,
    other: t.value.config.device.types.other,
    di_module: 'DI',
    ai_module: 'AI',
    io_module: 'IO',
    panel_meter: 'Panel Meter',
  }
  return typeMap[type] ?? type
}

const getDeviceTypeColor = (type: string): TagType => {
  const colorMap: Record<string, TagType> = {
    vfd: 'warning',
    inverter: 'warning',
    powerMeter: 'success',
    power_meter: 'success',
    analogInput: 'info',
    analog_input: 'info',
    ai_module: 'info',
    di_module: 'info',
    io_module: '',
    sensor: 'danger',
    panel_meter: 'danger',
    other: 'info',
  }
  return colorMap[type] ?? 'info'
}
</script>

<style scoped>
.config-container {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

/* Warning banner */
.restart-alert {
  margin-bottom: 20px;
}

.restart-alert :deep(.el-alert__content) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

/* Header */
.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
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

/* Metadata */
.metadata-card {
  margin-bottom: 20px;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.metadata-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metadata-item .label {
  font-size: 12px;
  color: #909399;
  font-weight: 500;
}

.metadata-item .value {
  font-size: 14px;
  color: #303133;
}

.metadata-item .value.mono {
  font-family: monospace;
  font-size: 13px;
}

/* Tabs */
.config-tabs {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
}

.tab-header {
  margin-bottom: 16px;
}

/* Responsive */
@media (max-width: 768px) {
  .config-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-right {
    width: 100%;
    flex-wrap: wrap;
  }
}

/* Restart loading dialog */
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

.restarting-countdown {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.restarting-content :deep(.el-progress) {
  width: 100%;
}
</style>
