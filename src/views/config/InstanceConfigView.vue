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
        <h2>{{ t.instanceConfig.title }}</h2>
        <el-tag v-if="activeTab === 'instance' && store.config" type="info" size="small">
          {{ t.config.generation }}: {{ store.config.generation }}
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

        <el-button :icon="Refresh" :loading="isRefreshing" @click="handleRefresh">
          {{ t.config.refresh }}
        </el-button>

        <!-- 只在 instance tab 顯示 -->
        <el-button v-if="activeTab === 'instance'" :icon="Download" @click="handleExport">
          {{ t.config.exportConfig }}
        </el-button>

        <el-upload
          v-if="activeTab === 'instance'"
          :show-file-list="false"
          accept=".yml,.yaml"
          :before-upload="handleImport"
          style="display: inline-block"
        >
          <el-button :icon="Upload" :loading="configIOStore.isImporting">
            {{ t.config.importConfig }}
          </el-button>
        </el-upload>

        <el-button
          v-if="activeTab === 'instance'"
          :icon="FolderOpened"
          @click="showBackupsDialog = true"
        >
          {{ t.config.backups }}
        </el-button>
      </div>
    </div>

    <!-- Metadata Card (instance tab only) -->
    <el-card v-if="activeTab === 'instance' && store.config" class="metadata-card" shadow="never">
      <template #header>
        <span>{{ t.config.metadata.title }}</span>
      </template>
      <div class="metadata-grid">
        <div class="metadata-item">
          <span class="label">{{ t.config.metadata.generation }}:</span>
          <span class="value">{{ store.config.generation }}</span>
        </div>
        <div class="metadata-item">
          <span class="label">{{ t.config.metadata.lastModified }}:</span>
          <span class="value">{{ formatTimestamp(store.config.modified_at) }}</span>
        </div>
        <div class="metadata-item">
          <span class="label">{{ t.config.metadata.checksum }}:</span>
          <span class="value mono">
            {{ store.config.checksum ? store.config.checksum.substring(0, 16) + '...' : 'N/A' }}
          </span>
        </div>
      </div>
    </el-card>

    <!-- Tabs -->
    <el-tabs v-model="activeTab" class="instance-tabs" @tab-change="handleTabChange">
      <!-- Tab 1: Instance -->
      <el-tab-pane :label="t.instanceConfig.tabInstance" name="instance">
        <div v-if="store.isLoading" v-loading="true" style="height: 200px" />

        <template v-else-if="store.config">
          <!-- Inverters -->
          <el-card v-if="inverterEntries.length > 0" class="section-card">
            <template #header>
              <span class="section-title">{{ t.instanceConfig.inverters }}</span>
            </template>
            <el-table :data="inverterEntries" stripe style="width: 100%">
              <el-table-column prop="model" :label="t.instanceConfig.model" width="160" />
              <el-table-column :label="t.instanceConfig.slaveId" width="120">
                <template #default="{ row }">
                  <span v-if="row.isEmpty" class="text-muted">{{
                    t.instanceConfig.noInstance
                  }}</span>
                  <span v-else>{{ row.slaveId }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="t.instanceConfig.startupFreq" width="140">
                <template #default="{ row }">
                  {{ row.isEmpty ? '—' : (row.instance.initialization?.startup_frequency ?? '—') }}
                </template>
              </el-table-column>
              <el-table-column :label="t.instanceConfig.autoTurnOn" width="110">
                <template #default="{ row }">
                  <el-tag
                    v-if="!row.isEmpty"
                    :type="row.instance.initialization?.auto_turn_on ? 'success' : 'info'"
                    size="small"
                  >
                    {{ row.instance.initialization?.auto_turn_on ? 'ON' : 'OFF' }}
                  </el-tag>
                  <span v-else class="text-muted">—</span>
                </template>
              </el-table-column>
              <el-table-column :label="t.instanceConfig.constraint">
                <template #default="{ row }">
                  <template v-if="!row.isEmpty">
                    <span v-if="row.instance.constraints?.RW_HZ">
                      {{ row.instance.constraints.RW_HZ.min }} ~
                      {{ row.instance.constraints.RW_HZ.max }} Hz
                    </span>
                    <span v-else-if="row.defaultConstraint">
                      {{ row.defaultConstraint.min }} ~ {{ row.defaultConstraint.max }} Hz
                      <el-tag size="small" type="info" style="margin-left: 4px">default</el-tag>
                    </span>
                    <span v-else class="text-muted">60 Hz (system)</span>
                  </template>
                  <span v-else class="text-muted">—</span>
                </template>
              </el-table-column>
              <el-table-column :label="t.config.bus.actions" fixed="right" width="160">
                <template #default="{ row }">
                  <el-button
                    v-if="row.isEmpty"
                    size="small"
                    type="primary"
                    :icon="Plus"
                    @click="openAddInstanceDialog(row, 'inverter')"
                  >
                    {{ t.instanceConfig.addInstance }}
                  </el-button>
                  <el-button v-else size="small" :icon="Edit" @click="openInverterDialog(row)">
                    {{ t.instanceConfig.edit }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <!-- AI Modules -->
          <el-card v-if="aiModuleEntries.length > 0" class="section-card">
            <template #header>
              <span class="section-title">{{ t.instanceConfig.aiModules }}</span>
            </template>
            <el-table :data="aiModuleEntries" stripe style="width: 100%">
              <el-table-column prop="model" :label="t.instanceConfig.model" width="160" />
              <el-table-column :label="t.instanceConfig.slaveId" width="100">
                <template #default="{ row }">
                  <span v-if="row.isEmpty" class="text-muted">{{
                    t.instanceConfig.noInstance
                  }}</span>
                  <span v-else>{{ row.slaveId }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="t.instanceConfig.pins">
                <template #default="{ row }">
                  <span v-if="row.isEmpty" class="text-muted">—</span>
                  <span v-else-if="row.instance.pins && Object.keys(row.instance.pins).length > 0">
                    {{ Object.keys(row.instance.pins).join(', ') }}
                  </span>
                  <span v-else class="text-muted">—</span>
                </template>
              </el-table-column>
              <el-table-column :label="t.config.bus.actions" fixed="right" width="120">
                <template #default="{ row }">
                  <el-button
                    v-if="row.isEmpty"
                    size="small"
                    type="primary"
                    :icon="Plus"
                    @click="openAddInstanceDialog(row, 'ai')"
                  >
                    {{ t.instanceConfig.addInstance }}
                  </el-button>
                  <el-button v-else size="small" :icon="Edit" @click="openPinDialog(row, 'ai')">
                    {{ t.instanceConfig.editPins }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <!-- DI / IO Modules -->
          <el-card v-if="diModuleEntries.length > 0" class="section-card">
            <template #header>
              <span class="section-title">{{ t.instanceConfig.diModules }}</span>
            </template>
            <el-table :data="diModuleEntries" stripe style="width: 100%">
              <el-table-column prop="model" :label="t.instanceConfig.model" width="160" />
              <el-table-column :label="t.instanceConfig.slaveId" width="100">
                <template #default="{ row }">
                  <span v-if="row.isEmpty" class="text-muted">{{
                    t.instanceConfig.noInstance
                  }}</span>
                  <span v-else>{{ row.slaveId }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="t.instanceConfig.pins">
                <template #default="{ row }">
                  <span v-if="row.isEmpty" class="text-muted">—</span>
                  <span v-else-if="row.instance.pins && Object.keys(row.instance.pins).length > 0">
                    {{
                      Object.entries(row.instance.pins)
                        .map(([k, v]: [string, any]) => `${k}: ${v.remark ?? '—'}`)
                        .join(', ')
                    }}
                  </span>
                  <span v-else class="text-muted">—</span>
                </template>
              </el-table-column>
              <el-table-column :label="t.config.bus.actions" fixed="right" width="120">
                <template #default="{ row }">
                  <el-button
                    v-if="row.isEmpty"
                    size="small"
                    type="primary"
                    :icon="Plus"
                    @click="openAddInstanceDialog(row, 'di')"
                  >
                    {{ t.instanceConfig.addInstance }}
                  </el-button>
                  <el-button v-else size="small" :icon="Edit" @click="openPinDialog(row, 'di')">
                    {{ t.instanceConfig.editPins }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </template>
      </el-tab-pane>

      <!-- Tab 2: Pin Mapping -->
      <el-tab-pane label="Pin Mapping" name="pin_mapping">
        <div v-loading="pinMappingStore.isLoading" style="min-height: 200px">
          <el-table :data="pinMappingStore.models" stripe style="width: 100%">
            <el-table-column prop="model" label="Model" width="200" />
            <el-table-column label="來源" width="120">
              <template #default="{ row }">
                <el-tag :type="row.source === 'override' ? 'success' : 'info'" size="small">
                  {{ row.source }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="描述">
              <template #default="{ row }">
                <span class="text-muted">{{ row.description ?? row.model }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t.config.bus.actions" fixed="right" width="260">
              <template #default="{ row }">
                <el-button size="small" :icon="View" @click="openPinMappingDialog(row.model)">
                  {{ t.common.view }}
                </el-button>
                <el-button size="small" :icon="Download" @click="handleExportPinMapping(row.model)">
                  {{ t.config.exportConfig }}
                </el-button>
                <el-upload
                  :show-file-list="false"
                  accept=".yml,.yaml"
                  :before-upload="(file: File) => handleImportPinMapping(file, row.model)"
                  style="display: inline-block"
                >
                  <el-button size="small" :icon="Upload" :loading="configIOStore.isImporting">
                    {{ t.config.importConfig }}
                  </el-button>
                </el-upload>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- Add Instance Dialog (only shown when model has multiple slave_ids) -->
    <el-dialog v-model="showAddInstanceDialog" :title="t.instanceConfig.addInstance" width="360px">
      <el-form :model="addInstanceForm" label-width="100px">
        <el-form-item :label="t.instanceConfig.model">
          <el-input :value="addInstanceForm.model" disabled />
        </el-form-item>
        <el-form-item :label="t.instanceConfig.slaveId" required>
          <el-select v-model="addInstanceForm.slaveId" style="width: 120px">
            <el-option
              v-for="sid in addInstanceForm.slaveIds"
              :key="sid"
              :label="sid"
              :value="sid"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddInstanceDialog = false">{{ t.common.cancel }}</el-button>
        <el-button type="primary" :loading="store.isSaving" @click="handleAddInstance">
          {{ t.common.confirm }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Dialogs -->
    <InverterConstraintDialog
      v-model:visible="showInverterDialog"
      :row="selectedRow"
      :is-saving="store.isSaving"
      @save="handleSaveInverter"
    />

    <PinConfigDialog
      v-model:visible="showPinDialog"
      :row="selectedRow"
      :mode="pinDialogMode"
      :is-saving="store.isSaving"
      @save="handleSavePins"
    />

    <BackupDialog
      :visible="showBackupsDialog"
      :config-type="currentBackupConfigType"
      :model="activeTab === 'pin_mapping' ? (pinMappingStore.currentModel ?? undefined) : undefined"
      @close="showBackupsDialog = false"
      @restored="handleRestored"
    />

    <PinMappingViewDialog
      v-model:visible="showPinMappingViewDialog"
      :model="selectedPinMappingModel"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  Download,
  Edit,
  FolderOpened,
  Plus,
  Refresh,
  RefreshRight,
  Upload,
  View,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import BackupDialog from '@/components/config/BackupDialog.vue'
import InverterConstraintDialog from '@/components/config/InverterConstraintDialog.vue'
import PinConfigDialog from '@/components/config/PinConfigDialog.vue'
import PinMappingViewDialog from '@/components/config/PinMappingViewDialog.vue'
import { useTalosRestart } from '@/composables/useTalosRestart'
import { useUIStore } from '@/stores/ui'
import { useConfigIOStore } from '@/stores/config_io'
import { useInstanceConfigStore } from '@/stores/instance_config'
import { usePinMappingStore } from '@/stores/pin_mapping'
import type { InstanceConfigRequest } from '@/stores/instance_config'
import type { ConfigType } from '@/types/config'

// ===== Stores =====
const { t } = storeToRefs(useUIStore())
const store = useInstanceConfigStore()
const configIOStore = useConfigIOStore()
const pinMappingStore = usePinMappingStore()

// ===== Tab =====
const activeTab = ref<'instance' | 'pin_mapping'>('instance')

const currentBackupConfigType = computed<ConfigType>(() =>
  activeTab.value === 'pin_mapping' ? 'pin_mapping' : 'device_instance_config',
)

// ===== Pin Mapping View Dialog =====
const showPinMappingViewDialog = ref(false)
const selectedPinMappingModel = ref('')

// ===== Restart =====
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

// ===== Dialog state =====
const showBackupsDialog = ref(false)
const showInverterDialog = ref(false)
const showPinDialog = ref(false)
const showAddInstanceDialog = ref(false)
const pinDialogMode = ref<'ai' | 'di'>('ai')
const selectedRow = ref<any>(null)
const isRefreshing = ref(false)

const addInstanceForm = ref({
  model: '',
  slaveId: 1,
  type: '' as 'inverter' | 'ai' | 'di',
  slaveIds: [] as number[],
})

// ===== Device entries =====
type DeviceEntry = {
  model: string
  slaveId: string
  instance: InstanceConfigRequest
  defaultConstraint?: { min: number; max: number }
  isEmpty: boolean
}

const buildEntries = (models: string[]): DeviceEntry[] => {
  if (!store.config) return []
  const entries: DeviceEntry[] = []
  for (const model of models) {
    const deviceConfig = store.config.devices[model]
    if (!deviceConfig) continue

    if (Object.keys(deviceConfig.instances).length === 0) {
      entries.push({
        model,
        slaveId: '—',
        instance: { initialization: null, constraints: null, pins: null },
        defaultConstraint: deviceConfig.default_constraints?.RW_HZ,
        isEmpty: true,
      })
    } else {
      for (const [slaveId, instance] of Object.entries(deviceConfig.instances)) {
        entries.push({
          model,
          slaveId,
          instance,
          defaultConstraint: deviceConfig.default_constraints?.RW_HZ,
          isEmpty: false,
        })
      }
    }
  }
  return entries
}

const inverterEntries = computed(() => buildEntries(store.inverterModels))
const aiModuleEntries = computed(() => buildEntries(store.aiModels))
const diModuleEntries = computed(() => buildEntries(store.diModels))

// ===== Actions =====
const handleRefresh = async () => {
  isRefreshing.value = true
  try {
    if (activeTab.value === 'instance') {
      await Promise.all([store.fetchConfig(), store.fetchDriverModels()])
    } else {
      await pinMappingStore.fetchModels()
    }
  } finally {
    isRefreshing.value = false
  }
}

const handleTabChange = async (tab: string) => {
  if (tab === 'pin_mapping' && pinMappingStore.models.length === 0) {
    await pinMappingStore.fetchModels()
  }
}

const handleExport = () => {
  configIOStore.exportConfig('device_instance_config')
}

const handleImport = async (file: File) => {
  try {
    await configIOStore.importConfig('device_instance_config', file)
    await store.fetchConfig()
    ElMessage.success(t.value.config.importSuccess)
    promptRestart()
  } catch {
    ElMessage.error(t.value.config.importFailed)
  }
  return false
}

const handleRestored = async () => {
  showBackupsDialog.value = false
  if (activeTab.value === 'pin_mapping') {
    await pinMappingStore.fetchModels()
  } else {
    await store.fetchConfig()
    promptRestart()
  }
}

const handleExportPinMapping = (model: string) => {
  configIOStore.exportConfig('pin_mapping', model)
}

const handleImportPinMapping = async (file: File, model: string) => {
  try {
    await configIOStore.importConfig('pin_mapping', file, model)
    await pinMappingStore.fetchModels()
    ElMessage.success(t.value.config.importSuccess)
  } catch {
    ElMessage.error(t.value.config.importFailed)
  }
  return false
}

// ===== Add Instance =====
const openAddInstanceDialog = (row: DeviceEntry, type: 'inverter' | 'ai' | 'di') => {
  const driverInfo = store.driverModels.find((m) => m.model === row.model)
  const slaveIds = driverInfo?.slave_ids ?? []

  if (slaveIds.length === 0) {
    ElMessage.warning('找不到對應的從站地址')
    return
  }

  if (slaveIds.length === 1) {
    handleAddInstanceDirect(row.model, slaveIds[0]!, type)
    return
  }

  addInstanceForm.value = { model: row.model, slaveId: slaveIds[0]!, type, slaveIds }
  showAddInstanceDialog.value = true
}

const handleAddInstanceDirect = async (
  model: string,
  slaveId: number,
  type: 'inverter' | 'ai' | 'di',
) => {
  try {
    await store.updateInstance(model, String(slaveId), {
      initialization: null,
      constraints: null,
      pins: null,
    })
    await store.fetchConfig()

    const newRow: DeviceEntry = {
      model,
      slaveId: String(slaveId),
      instance: { initialization: null, constraints: null, pins: null },
      isEmpty: false,
    }
    if (type === 'inverter') openInverterDialog(newRow)
    else openPinDialog(newRow, type)
  } catch {
    ElMessage.error(t.value.instanceConfig.saveFailed)
  }
}

const handleAddInstance = async () => {
  const { model, slaveId, type } = addInstanceForm.value
  showAddInstanceDialog.value = false
  await handleAddInstanceDirect(model, slaveId, type)
}

// ===== Dialog handlers =====
const openInverterDialog = (row: DeviceEntry) => {
  selectedRow.value = row
  showInverterDialog.value = true
}

const openPinDialog = (row: DeviceEntry, mode: 'ai' | 'di') => {
  selectedRow.value = row
  pinDialogMode.value = mode
  showPinDialog.value = true
}

const openPinMappingDialog = (model: string) => {
  selectedPinMappingModel.value = model
  showPinMappingViewDialog.value = true
}

const handleSaveInverter = async (payload: InstanceConfigRequest) => {
  if (!selectedRow.value) return
  try {
    await store.updateInstance(selectedRow.value.model, selectedRow.value.slaveId, payload)
    ElMessage.success(t.value.instanceConfig.saveSuccess)
    showInverterDialog.value = false
    promptRestart()
  } catch {
    ElMessage.error(t.value.instanceConfig.saveFailed)
  }
}

const handleSavePins = async (payload: InstanceConfigRequest) => {
  if (!selectedRow.value) return
  try {
    await store.updateInstance(selectedRow.value.model, selectedRow.value.slaveId, payload)
    ElMessage.success(t.value.instanceConfig.saveSuccess)
    showPinDialog.value = false
    promptRestart()
  } catch {
    ElMessage.error(t.value.instanceConfig.saveFailed)
  }
}

// ===== Helpers =====
const formatTimestamp = (ts: string | null) => (ts ? new Date(ts).toLocaleString() : 'N/A')

// ===== Lifecycle =====
onMounted(async () => {
  await Promise.all([store.fetchConfig(), store.fetchDriverModels()])
})
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
.instance-tabs {
  margin-top: 4px;
}
.section-card {
  margin-bottom: 24px;
}
.section-title {
  font-weight: 600;
  font-size: 15px;
}
.text-muted {
  color: #909399;
  font-size: 13px;
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
</style>
