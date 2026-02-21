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

    <!-- Warning banner -->
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
        <h2>{{ t.config.title }}</h2>
        <el-tag v-if="metadata" type="info" size="small">
          {{ t.config.generation }}: {{ metadata.generation }}
        </el-tag>
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
          <el-table-column :label="t.config.device.displayName" width="220">
            <template #default="{ row }">
              {{ getDeviceDisplayName(row) }}
            </template>
          </el-table-column>
          <el-table-column prop="model" :label="t.config.device.model" width="160" />
          <el-table-column :label="t.config.device.type" width="160">
            <template #default="{ row }">
              <el-tag :type="getDeviceTypeColor(row.type)" size="small">
                {{ getDeviceTypeLabel(row.type) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="slave_id" :label="t.config.device.slaveId" width="100" />
          <el-table-column prop="bus" :label="t.config.device.bus" width="120" />
          <el-table-column :label="t.config.device.purpose" width="180">
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

    <!-- Backup Dialog -->
    <BackupDialog
      :visible="showBackupsDialog"
      config-type="modbus_device"
      @close="showBackupsDialog = false"
      @restored="handleBackupRestored"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import {
  Plus,
  Edit,
  Delete,
  Refresh,
  FolderOpened,
  RefreshRight,
  Download,
  Upload,
} from '@element-plus/icons-vue'
import { ElMessage, type FormInstance } from 'element-plus'
import { useUIStore } from '@/stores/ui'
import { useConfigStore, type ModbusDevice, type ModbusBus } from '@/stores/modbus_config'
import { useConfigIOStore } from '@/stores/config_io'
import DeviceDialog from '@/components/config/DeviceDialog.vue'
import BackupDialog from '@/components/config/BackupDialog.vue'
import { useTalosRestart } from '@/composables/useTalosRestart'

type TagType = 'success' | 'info' | 'warning' | 'danger' | ''

// ===== Stores =====
const { t } = storeToRefs(useUIStore())
const configStore = useConfigStore()
const configIOStore = useConfigIOStore()
const { metadata, devices, busList, isLoading } = storeToRefs(configStore)

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

// ===== State =====
const activeTab = ref<'buses' | 'devices'>('buses')
const showBackupsDialog = ref(false)

const busDialogVisible = ref(false)
const busDialogMode = ref<'create' | 'edit'>('create')
const busFormRef = ref<FormInstance>()
const busForm = ref({ name: '', port: '', baudrate: 9600, timeout: 1.0 })

const deviceDialogVisible = ref(false)
const currentDevice = ref<ModbusDevice | undefined>(undefined)
const isEditDevice = ref(false)

// ===== Validation Rules =====
const busRules = computed(() => ({
  name: [{ required: true, message: t.value.config.bus.nameRequired }],
  port: [{ required: true, message: t.value.config.bus.portRequired }],
  baudrate: [{ required: true, message: t.value.config.bus.baudrateRequired }],
  timeout: [{ required: true, message: t.value.config.bus.timeoutRequired }],
}))

// ===== Lifecycle =====
onMounted(() => void handleRefresh())

// ===== General =====
const handleRefresh = async () => {
  await configStore.fetchConfig()
}

// ===== Export / Import =====
const handleExport = () => {
  configIOStore.exportConfig('modbus_device')
}

const handleImport = async (file: File) => {
  try {
    await configIOStore.importConfig('modbus_device', file)
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

// ===== Bus =====
const showBusDialog = (bus?: ModbusBus) => {
  if (bus) {
    busDialogMode.value = 'edit'
    busForm.value = { name: bus.name, port: bus.port, baudrate: bus.baudrate, timeout: bus.timeout }
  } else {
    busDialogMode.value = 'create'
    busForm.value = { name: '', port: '', baudrate: 9600, timeout: 1.0 }
  }
  busDialogVisible.value = true
}

const handleSaveBus = async () => {
  if (!busFormRef.value) return
  await busFormRef.value.validate(async (valid: boolean) => {
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
      promptRestart()
    } catch {
      // handled in store
    }
  })
}

const handleDeleteBus = async (name: string) => {
  try {
    await configStore.deleteBus(name, 'web-user')
    promptRestart()
  } catch {
    // handled in store
  }
}

// ===== Device =====
const openDeviceDialog = (device?: ModbusDevice) => {
  currentDevice.value = device ? { ...device } : undefined
  isEditDevice.value = !!device
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
    promptRestart()
  } catch (err: unknown) {
    console.error('Failed to save device:', err)
    ElMessage.error(t.value.config.device.saveFailed)
  }
}

const handleDeleteDevice = async (model: string, slaveId: number) => {
  try {
    await configStore.deleteDevice(model, slaveId, 'web-user')
    promptRestart()
  } catch {
    // handled in store
  }
}

// ===== Helpers =====
const getSourceType = (source: string): TagType => {
  const map: Record<string, TagType> = { manual: 'info', edge: 'success', cloud: 'warning' }
  return map[source] ?? 'info'
}

const formatTimestamp = (ts: string) => (ts ? new Date(ts).toLocaleString() : 'N/A')

const getDeviceCountForBus = (busName: string) =>
  devices.value.filter((d) => d.bus === busName).length

const getDeviceDisplayName = (device: ModbusDevice) => configStore.getDeviceDisplayName(device)

const getModeString = (modes: Record<string, unknown> | undefined, key: string): string => {
  const v = modes?.[key]
  return typeof v === 'string' && v.trim() ? v : '-'
}

const getDeviceTypeLabel = (type: string): string => {
  const m: Record<string, string> = {
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
  return m[type] ?? type
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
.config-tabs {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
}
.tab-header {
  margin-bottom: 16px;
}
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
