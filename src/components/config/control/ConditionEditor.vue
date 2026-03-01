<template>
  <div class="condition-editor">
    <div class="section-header">
      <span class="section-title">觸發條件</span>
      <div class="mode-switch">
        <span class="mode-label">觸發方式：</span>
        <el-radio-group v-model="condition.mode" size="small">
          <el-radio-button value="all">全部 (AND)</el-radio-button>
          <el-radio-button value="any">任一 (OR)</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <div class="sources-list">
      <div
        v-for="(source, idx) in condition.sources"
        :key="source.id"
        class="source-row"
      >
        <span class="source-index">{{ idx + 1 }}</span>

        <el-select
          v-model="sourceDeviceKey[source.id]"
          placeholder="選擇設備"
          style="width: 180px"
          @change="(key: string) => onDeviceChange(source, key)"
        >
          <el-option
            v-for="d in devices"
            :key="`${d.model}:${d.slave_id}`"
            :label="`${d.model} (ID:${d.slave_id})`"
            :value="`${d.model}:${d.slave_id}`"
          />
        </el-select>

        <el-select
          v-model="source.pin"
          placeholder="選擇 pin"
          style="width: 160px"
          :loading="pinLoading[source.id]"
          :disabled="!sourceDeviceKey[source.id]"
        >
          <el-option
            v-for="pin in readablePins[source.id]"
            :key="pin.name"
            :label="pin.name"
            :value="pin.name"
          />
        </el-select>

        <el-select v-model="source.operator" style="width: 100px">
          <el-option label=">" value="gt" />
          <el-option label=">=" value="gte" />
          <el-option label="<" value="lt" />
          <el-option label="<=" value="lte" />
          <el-option label="=" value="eq" />
          <el-option label="≠" value="neq" />
        </el-select>

        <el-input-number
          v-model="source.threshold"
          placeholder="Threshold"
          style="width: 120px"
          :controls="false"
        />

        <el-input-number
          v-model="source.hysteresis"
          placeholder="Hysteresis"
          style="width: 120px"
          :controls="false"
        />

        <el-input-number
          v-model="source.debounce_sec"
          placeholder="Debounce(s)"
          style="width: 120px"
          :controls="false"
          :min="0"
        />

        <el-button
          type="danger"
          :icon="Minus"
          size="small"
          circle
          :disabled="condition.sources.length <= 1"
          @click="removeSource(source.id)"
        />
      </div>
    </div>

    <el-button size="small" :icon="Plus" @click="addSource">新增條件</el-button>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { Plus, Minus } from '@element-plus/icons-vue'
import { useConfigDeviceStore } from '@/stores/configDevice'
import { useControlStore } from '@/stores/control'
import type { ControlCondition, ControlSource, ConfigDevice, Pin } from '@/types/config-builder'

interface Props {
  condition: ControlCondition
  ruleId: string
  devices: ConfigDevice[]
}

const props = defineProps<Props>()

const configStore = useConfigDeviceStore()
const controlStore = useControlStore()

// Track selected device key (model:slave_id) per source id
const sourceDeviceKey = reactive<Record<string, string>>({})
// Track readable pins per source id
const readablePins = reactive<Record<string, Pin[]>>({})
const pinLoading = reactive<Record<string, boolean>>({})

async function onDeviceChange(source: ControlSource, key: string) {
  const [model, slaveIdStr] = key.split(':')
  source.device_model = model
  source.device_slave_id = Number(slaveIdStr)
  source.pin = ''

  pinLoading[source.id] = true
  try {
    const pins = await configStore.getPins(model)
    readablePins[source.id] = pins.readable
  } catch {
    readablePins[source.id] = []
  } finally {
    pinLoading[source.id] = false
  }
}

function addSource() {
  controlStore.addSource(props.ruleId)
}

function removeSource(sourceId: string) {
  controlStore.removeSource(props.ruleId, sourceId)
  delete sourceDeviceKey[sourceId]
  delete readablePins[sourceId]
}
</script>

<style scoped>
.condition-editor {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  background: #fafbfc;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
}

.mode-label {
  font-size: 13px;
  color: #606266;
  margin-right: 4px;
}

.mode-switch {
  display: flex;
  align-items: center;
}

.sources-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.source-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.source-index {
  font-size: 12px;
  color: #909399;
  width: 16px;
  flex-shrink: 0;
}
</style>
