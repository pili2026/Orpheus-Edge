<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit ? t.config.device.editDevice : t.config.device.addDevice"
    width="700px"
    @close="handleClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" label-position="left">
      <!-- ===== Step 1: Select Type（for filter）===== -->
      <el-form-item :label="t.config.device.selectType" prop="typeFilter">
        <el-select
          v-model="form.typeFilter"
          :placeholder="t.config.device.selectTypePlaceholder"
          @change="handleTypeFilterChange"
          style="width: 100%"
          clearable
        >
          <el-option
            v-for="deviceType in availableTypes"
            :key="deviceType.value"
            :label="deviceType.label"
            :value="deviceType.value"
          >
            <div class="type-option">
              <el-tag :type="deviceType.color" size="small">
                {{ deviceType.label }}
              </el-tag>
              <span class="type-count">({{ getDriverCountByType(deviceType.value) }})</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>

      <!-- ===== Step 2: Select Model ===== -->
      <el-form-item :label="t.config.device.selectModel" prop="selectedDriver">
        <el-select
          v-model="form.selectedDriver"
          filterable
          :placeholder="t.config.device.selectModelPlaceholder"
          :disabled="!form.typeFilter && filteredDrivers.length === 0"
          @change="handleDriverChange"
          style="width: 100%"
        >
          <el-option
            v-for="driver in filteredDrivers"
            :key="driver.model"
            :label="driver.model"
            :value="driver.model"
          >
            <div class="driver-option">
              <span class="driver-model">{{ driver.model }}</span>
              <div class="driver-option-desc">{{ driver.description }}</div>
            </div>
          </el-option>
        </el-select>
        <div v-if="!form.typeFilter" class="form-item-tip">
          {{ t.config.device.selectTypeFirst }}
        </div>
      </el-form-item>

      <!-- ===== Auto-filled Fields ===== -->
      <el-divider content-position="left">{{ t.config.device.autoFilled }}</el-divider>

      <el-form-item :label="t.config.device.model">
        <el-input
          v-model="form.model"
          readonly
          disabled
          :placeholder="t.config.device.willAutoFill"
        />
      </el-form-item>

      <el-form-item :label="t.config.device.type">
        <el-tag v-if="form.type" :type="getDriverTypeColor(form.type)">
          {{ getDriverTypeLabel(form.type) }}
        </el-tag>
        <span v-else class="placeholder-text">{{ t.config.device.willAutoFill }}</span>
      </el-form-item>

      <el-form-item :label="t.config.device.driverFile">
        <el-input
          v-model="form.model_file"
          readonly
          disabled
          :placeholder="t.config.device.willAutoFill"
        >
          <template #prefix>
            <el-icon><Document /></el-icon>
          </template>
        </el-input>
      </el-form-item>

      <!-- ===== Manual Input Fields ===== -->
      <el-divider content-position="left">{{ t.config.device.manualInput }}</el-divider>

      <!-- Bus Select -->
      <el-form-item :label="t.config.device.bus" prop="bus">
        <el-select
          v-model="form.bus"
          :placeholder="t.config.device.busRequired"
          style="width: 100%"
        >
          <el-option
            v-for="bus in availableBuses"
            :key="bus.name"
            :label="`${bus.name} (${bus.port})`"
            :value="bus.name"
          >
            <div class="bus-option">
              <span class="bus-name">{{ bus.name }}</span>
              <span class="bus-port">{{ bus.port }} @ {{ bus.baudrate }} baud</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item :label="t.config.device.slaveId" prop="slave_id">
        <el-input-number
          v-model="form.slave_id"
          :min="1"
          :max="247"
          controls-position="right"
          style="width: 200px"
        />

        <el-alert v-if="duplicateDevice" type="error" :closable="false" style="margin-top: 8px">
          <template #title>
            <el-icon style="vertical-align: middle"><WarningFilled /></el-icon>
            {{ t.config.device.duplicateSlaveId }}
          </template>
          <div class="duplicate-detail">
            {{
              t.config.device.duplicateSlaveIdDetail
                .replace('{bus}', form.bus)
                .replace('{slaveId}', form.slave_id.toString())
                .replace('{device}', getDeviceDisplayName(duplicateDevice))
            }}
          </div>
        </el-alert>
      </el-form-item>

      <!-- ===== Modes (Optional) ===== -->
      <el-divider content-position="left">
        <el-button text @click="modesExpanded = !modesExpanded" style="font-size: 14px">
          {{ t.config.device.modes.title }}
          <el-icon style="margin-left: 4px">
            <component :is="modesExpanded ? ArrowUp : ArrowDown" />
          </el-icon>
        </el-button>
      </el-divider>

      <el-collapse-transition>
        <div v-show="modesExpanded" class="modes-section">
          <el-form-item :label="t.config.device.modes.name">
            <el-input
              v-model="form.modes.name"
              :placeholder="t.config.device.modes.namePlaceholder"
            />
            <div class="form-item-tip">{{ t.config.device.modes.nameTip }}</div>
          </el-form-item>

          <el-form-item :label="t.config.device.modes.purpose">
            <el-input
              v-model="form.modes.purpose"
              :placeholder="t.config.device.modes.purposePlaceholder"
            />
            <div class="form-item-tip">{{ t.config.device.modes.purposeTip }}</div>
          </el-form-item>

          <el-form-item :label="t.config.device.modes.customFields">
            <el-input
              v-model="form.modes.custom"
              type="textarea"
              :rows="3"
              :placeholder="t.config.device.modes.customPlaceholder"
            />
            <div class="form-item-tip">{{ t.config.device.modes.customTip }}</div>
          </el-form-item>
        </div>
      </el-collapse-transition>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">{{ t.config.common.cancel }}</el-button>
      <el-button type="primary" @click="handleSubmit" :disabled="!canSubmit">
        {{ t.config.common.save }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Document, ArrowDown, ArrowUp, WarningFilled } from '@element-plus/icons-vue'
import { useUIStore } from '@/stores/ui'
import { useConfigStore } from '@/stores/modbus_config'
import type { ModbusDevice } from '@/stores/modbus_config'
import axios from 'axios'

// ===== Props & Emits =====
interface Props {
  visible: boolean
  device?: ModbusDevice
  isEdit?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isEdit: false,
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', device: ModbusDevice): void
}>()

// ===== Stores =====
const { t } = storeToRefs(useUIStore())
const configStore = useConfigStore()

// ===== Data =====
const formRef = ref<FormInstance>()
const modesExpanded = ref(false)

const availableDrivers = ref<
  Array<{
    model: string
    type: string
    description: string
    file_path: string
  }>
>([])

const form = ref({
  typeFilter: '',
  selectedDriver: '',
  model: '',
  type: '',
  model_file: '',
  slave_id: 1,
  bus: '',
  modes: {
    name: '',
    purpose: '',
    custom: '',
  },
})

// ===== Computed =====
const availableBuses = computed(() => configStore.busList)

const availableTypes = computed(() => {
  const types = [
    { value: 'inverter', label: t.value.config.device.types.inverter, color: 'warning' },
    { value: 'power_meter', label: t.value.config.device.types.power_meter, color: 'success' },
    { value: 'ai_module', label: t.value.config.device.types.ai_module, color: 'info' },
    { value: 'di_module', label: t.value.config.device.types.di_module, color: 'info' },
    { value: 'io_module', label: t.value.config.device.types.io_module, color: '' },
    { value: 'sensor', label: t.value.config.device.types.sensor, color: 'primary' },
    { value: 'panel_meter', label: t.value.config.device.types.panel_meter, color: 'primary' },
    { value: 'other', label: t.value.config.device.types.other, color: 'info' },
  ]
  return types.filter((type) => getDriverCountByType(type.value) > 0)
})

const filteredDrivers = computed(() => {
  if (!form.value.typeFilter) {
    return availableDrivers.value
  }
  return availableDrivers.value.filter((d) => d.type === form.value.typeFilter)
})

const duplicateDevice = computed(() => {
  if (!form.value.bus || !form.value.slave_id) {
    return null
  }

  const devices = configStore.devices

  return devices.find((d) => {
    if (props.isEdit && props.device) {
      if (d.model === props.device.model && d.slave_id === props.device.slave_id) {
        return false
      }
    }

    return d.bus === form.value.bus && d.slave_id === form.value.slave_id
  })
})

const canSubmit = computed(() => {
  return form.value.model && form.value.slave_id && form.value.bus && !duplicateDevice.value
})

const getDriverCountByType = (type: string): number => {
  return availableDrivers.value.filter((d) => d.type === type).length
}

const rules = computed<FormRules>(() => ({
  typeFilter: [{ required: true, message: t.value.config.device.selectTypeRequired }],
  selectedDriver: [{ required: true, message: t.value.config.device.selectDriverRequired }],
  slave_id: [{ required: true, message: t.value.config.device.slaveIdRequired }],
  bus: [{ required: true, message: t.value.config.device.busRequired }],
}))

// ===== Methods =====

const fetchDrivers = async () => {
  try {
    const response = await axios.get('/api/config/modbus_drivers')
    availableDrivers.value = response.data.drivers
  } catch (error) {
    console.error('Failed to fetch drivers:', error)
    ElMessage.error('載入 Driver 列表失敗')
  }
}

const handleTypeFilterChange = () => {
  form.value.selectedDriver = ''
  form.value.model = ''
  form.value.type = ''
  form.value.model_file = ''
}

const handleDriverChange = (modelName: string) => {
  const driver = availableDrivers.value.find((d) => d.model === modelName)
  if (driver) {
    form.value.model = driver.model
    form.value.type = driver.type
    form.value.model_file = driver.file_path
    form.value.typeFilter = driver.type
  }
}

const getDriverTypeLabel = (type: string): string => {
  return t.value.config.device.types[type] || type
}

const getDriverTypeColor = (type: string): string => {
  const colorMap: Record<string, string> = {
    inverter: 'warning',
    power_meter: 'success',
    ai_module: 'info',
    di_module: 'info',
    io_module: '',
    sensor: 'primary',
    panel_meter: 'primary',
    other: 'info',
  }
  return colorMap[type] || 'info'
}

const getDeviceDisplayName = (device: ModbusDevice): string => {
  return configStore.getDeviceDisplayName(device)
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()

    if (duplicateDevice.value) {
      ElMessage.error(
        t.value.config.device.duplicateSlaveIdError.replace(
          '{device}',
          getDeviceDisplayName(duplicateDevice.value),
        ),
      )
      return
    }

    const modes: Record<string, any> = {}
    if (form.value.modes.name) modes.name = form.value.modes.name
    if (form.value.modes.purpose) modes.purpose = form.value.modes.purpose

    if (form.value.modes.custom) {
      try {
        const customFields = JSON.parse(form.value.modes.custom)
        Object.assign(modes, customFields)
      } catch (error) {
        ElMessage.error(t.value.config.device.modes.invalidJson)
        return
      }
    }

    const deviceData: any = {
      model: form.value.model,
      type: form.value.type,
      model_file: form.value.model_file,
      slave_id: form.value.slave_id,
      bus: form.value.bus,
    }

    if (Object.keys(modes).length > 0) {
      deviceData.modes = modes
    }

    emit('submit', deviceData)
  } catch (error) {
    console.error('Form validation failed:', error)
  }
}

const handleClose = () => {
  form.value = {
    typeFilter: '',
    selectedDriver: '',
    model: '',
    type: '',
    model_file: '',
    slave_id: 1,
    bus: '',
    modes: {
      name: '',
      purpose: '',
      custom: '',
    },
  }

  formRef.value?.resetFields()
  emit('close')
}

// Initialize form when editing
watch(
  () => props.device,
  (device) => {
    if (device && props.isEdit) {
      form.value.typeFilter = device.type
      form.value.selectedDriver = device.model
      form.value.model = device.model
      form.value.type = device.type
      form.value.model_file = device.model_file
      form.value.slave_id = device.slave_id
      form.value.bus = device.bus

      if (device.modes) {
        form.value.modes.name = (device.modes as any).name || ''
        form.value.modes.purpose = (device.modes as any).purpose || ''

        const { name, purpose, ...customFields } = device.modes as any
        if (Object.keys(customFields).length > 0) {
          form.value.modes.custom = JSON.stringify(customFields, null, 2)
        }
      }
    }
  },
  { immediate: true },
)

// Fetch drivers on mount
watch(
  () => props.visible,
  (visible) => {
    if (visible && availableDrivers.value.length === 0) {
      fetchDrivers()
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.type-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-count {
  font-size: 12px;
  color: #909399;
}

.driver-option {
  padding: 4px 0;
}

.driver-model {
  font-weight: 600;
  color: #303133;
}

.driver-option-desc {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bus-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.bus-name {
  font-weight: 500;
}

.bus-port {
  font-size: 12px;
  color: #909399;
}

.modes-section {
  padding: 0 20px;
  background: #f5f7fa;
  border-radius: 4px;
  margin: -10px 0 10px;
}

.form-item-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}

.placeholder-text {
  color: #c0c4cc;
  font-size: 14px;
}

.duplicate-detail {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.5;
}

:deep(.el-divider__text) {
  background: #fff;
  padding: 0 12px;
  font-weight: 500;
}
</style>
