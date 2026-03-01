<template>
  <div class="policy-editor">
    <div class="section-title">執行策略</div>

    <el-row :gutter="16">
      <el-col :span="8">
        <el-form-item label="策略類型">
          <el-select v-model="policy.type" @change="onTypeChange">
            <el-option label="discrete_setpoint（離散設定點）" value="discrete_setpoint" />
            <el-option label="incremental_linear（線性增量）" value="incremental_linear" />
          </el-select>
        </el-form-item>
      </el-col>

      <template v-if="policy.type === 'incremental_linear'">
        <el-col :span="8">
          <el-form-item label="Input Source">
            <el-input
              v-model="(policy as IncrementalLinearPolicy).input_source"
              placeholder="對應 sources_id"
            />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="Gain (Hz/unit)">
            <el-input-number
              v-model="(policy as IncrementalLinearPolicy).gain_hz_per_unit"
              :controls="false"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>
      </template>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import type { ControlPolicy, IncrementalLinearPolicy } from '@/types/config-builder'

interface Props {
  policy: ControlPolicy
}

const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update:policy', v: ControlPolicy): void }>()

function onTypeChange(type: string) {
  if (type === 'discrete_setpoint') {
    emit('update:policy', { type: 'discrete_setpoint' })
  } else {
    emit('update:policy', {
      type: 'incremental_linear',
      input_source: '',
      gain_hz_per_unit: null,
    } as IncrementalLinearPolicy)
  }
}
</script>

<style scoped>
.policy-editor {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  background: #fafbfc;
}

.section-title {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
  margin-bottom: 12px;
}
</style>
