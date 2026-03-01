<template>
  <div class="action-editor">
    <div class="section-header">
      <span class="section-title">執行動作</span>
    </div>

    <div class="actions-list">
      <div v-for="(action, idx) in actions" :key="action.id" class="action-row">
        <span class="action-index">{{ idx + 1 }}</span>

        <el-select
          v-model="actionDeviceKey[action.id]"
          placeholder="選擇目標設備"
          style="width: 180px"
          @change="(key: string) => onDeviceChange(action, key)"
        >
          <el-option
            v-for="d in devices"
            :key="`${d.model}:${d.slave_id}`"
            :label="`${d.model} (ID:${d.slave_id})`"
            :value="`${d.model}:${d.slave_id}`"
          />
        </el-select>

        <el-select v-model="action.type" style="width: 160px" @change="onTypeChange(action)">
          <el-option label="write_do" value="write_do" />
          <el-option label="set_frequency" value="set_frequency" />
          <el-option label="adjust_frequency" value="adjust_frequency" />
        </el-select>

        <el-select
          v-model="action.target_pin"
          placeholder="目標 pin"
          style="width: 140px"
          :loading="pinLoading[action.id]"
          :disabled="!actionDeviceKey[action.id]"
        >
          <el-option
            v-for="pin in writablePins[action.id]"
            :key="pin.name"
            :label="pin.name"
            :value="pin.name"
          />
        </el-select>

        <el-input-number
          v-if="action.type === 'set_frequency' || action.type === 'write_do'"
          v-model="action.value"
          placeholder="Value"
          style="width: 100px"
          :controls="false"
        />

        <el-checkbox
          v-if="action.type === 'set_frequency'"
          v-model="action.emergency_override"
          label="緊急覆寫"
        />

        <el-button
          type="danger"
          :icon="Minus"
          size="small"
          circle
          :disabled="actions.length <= 1"
          @click="removeAction(action.id)"
        />
      </div>
    </div>

    <el-button size="small" :icon="Plus" @click="addAction">新增動作</el-button>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { Plus, Minus } from '@element-plus/icons-vue'
import { useConfigDeviceStore } from '@/stores/configDevice'
import { useControlStore } from '@/stores/control'
import type { ControlAction, ConfigDevice, Pin } from '@/types/config-builder'

interface Props {
  actions: ControlAction[]
  ruleId: string
  devices: ConfigDevice[]
}

const props = defineProps<Props>()

const configStore = useConfigDeviceStore()
const controlStore = useControlStore()

const actionDeviceKey = reactive<Record<string, string>>({})
const writablePins = reactive<Record<string, Pin[]>>({})
const pinLoading = reactive<Record<string, boolean>>({})

async function onDeviceChange(action: ControlAction, key: string) {
  const [model, slaveIdStr] = key.split(':')
  action.device_model = model
  action.device_slave_id = Number(slaveIdStr)
  action.target_pin = ''

  pinLoading[action.id] = true
  try {
    const pins = await configStore.getPins(model)
    writablePins[action.id] = pins.writable
  } catch {
    writablePins[action.id] = []
  } finally {
    pinLoading[action.id] = false
  }
}

function onTypeChange(action: ControlAction) {
  // Reset value/override when type changes
  if (action.type === 'adjust_frequency') {
    action.value = undefined
    action.emergency_override = false
  }
}

function addAction() {
  controlStore.addAction(props.ruleId)
}

function removeAction(actionId: string) {
  controlStore.removeAction(props.ruleId, actionId)
  delete actionDeviceKey[actionId]
  delete writablePins[actionId]
}
</script>

<style scoped>
.action-editor {
  padding: 12px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  background: #fafbfc;
}

.section-header {
  margin-bottom: 12px;
}

.section-title {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
}

.actions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.action-index {
  font-size: 12px;
  color: #909399;
  width: 16px;
  flex-shrink: 0;
}
</style>
