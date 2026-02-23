<template>
  <el-dialog
    :model-value="visible"
    :title="`${row?.model} — Slave ${row?.slaveId}`"
    width="480px"
    @close="$emit('update:visible', false)"
  >
    <el-form :model="form" label-width="140px">
      <el-form-item :label="t.instanceConfig.startupFreq">
        <el-input-number v-model="form.startupFreq" :min="0" :max="120" :step="0.5" />
      </el-form-item>

      <el-form-item :label="t.instanceConfig.autoTurnOn">
        <el-switch v-model="form.autoTurnOn" />
      </el-form-item>

      <el-divider />

      <el-form-item :label="t.instanceConfig.enableConstraint">
        <el-switch v-model="form.enableConstraint" />
      </el-form-item>

      <template v-if="form.enableConstraint">
        <el-form-item :label="t.instanceConfig.minHz">
          <el-input-number v-model="form.minHz" :min="0" :max="120" :step="0.5" />
        </el-form-item>
        <el-form-item :label="t.instanceConfig.maxHz">
          <el-input-number v-model="form.maxHz" :min="0" :max="120" :step="0.5" />
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">{{ t.common.cancel }}</el-button>
      <el-button type="primary" :loading="isSaving" @click="handleSave">
        {{ t.common.save }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useI18n } from '@/composables/useI18n'
import type { InstanceConfigRequest } from '@/stores/instance_config'

const props = defineProps<{
  visible: boolean
  row: any
  isSaving: boolean
}>()

const emit = defineEmits<{
  'update:visible': [boolean]
  save: [InstanceConfigRequest]
}>()

const { t } = useI18n()

const form = reactive({
  startupFreq: 50.0,
  autoTurnOn: false,
  enableConstraint: false,
  minHz: 30.0,
  maxHz: 60.0,
})

// Populate form when row changes
watch(
  () => props.row,
  (row) => {
    if (!row) return
    form.startupFreq = row.instance.initialization?.startup_frequency ?? 50.0
    form.autoTurnOn = row.instance.initialization?.auto_turn_on ?? false
    form.enableConstraint = !!row.instance.constraints?.RW_HZ
    form.minHz = row.instance.constraints?.RW_HZ?.min ?? row.defaultConstraint?.min ?? 30.0
    form.maxHz = row.instance.constraints?.RW_HZ?.max ?? row.defaultConstraint?.max ?? 60.0
  },
  { immediate: true },
)

const handleSave = () => {
  const payload: InstanceConfigRequest = {
    initialization: {
      startup_frequency: form.startupFreq,
      auto_turn_on: form.autoTurnOn,
    },
    constraints: form.enableConstraint ? { RW_HZ: { min: form.minHz, max: form.maxHz } } : null,
    use_default_constraints: !form.enableConstraint,
  }
  emit('save', payload)
}
</script>
