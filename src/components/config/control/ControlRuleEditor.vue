<template>
  <el-card class="rule-card" shadow="never">
    <template #header>
      <div class="rule-header">
        <el-icon><Setting /></el-icon>
        <span>規則 #{{ index + 1 }}</span>
        <el-button
          type="danger"
          size="small"
          :icon="Delete"
          link
          @click="emit('remove')"
        >刪除</el-button>
      </div>
    </template>

    <el-row :gutter="16">
      <el-col :span="12">
        <el-form-item label="名稱">
          <el-input v-model="rule.name" placeholder="規則顯示名稱" />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="Code">
          <el-input
            v-model="rule.code"
            placeholder="UPPER_SNAKE_CASE，例如：HIGH_TEMP_CONTROL"
            @input="rule.code = rule.code.toUpperCase()"
          />
        </el-form-item>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="8">
        <el-form-item label="優先權">
          <el-input-number v-model="rule.priority" :min="1" :max="9999" style="width: 100%" />
        </el-form-item>
      </el-col>
      <el-col :span="8">
        <el-form-item label="阻斷模式">
          <el-switch v-model="rule.blocking" active-text="是" inactive-text="否" />
        </el-form-item>
      </el-col>
    </el-row>

    <!-- Composite Condition -->
    <ConditionEditor
      v-model:condition="rule.condition"
      :rule-id="rule.id"
      :devices="devices"
    />

    <!-- Policy -->
    <PolicyEditor v-model:policy="rule.policy" />

    <!-- Actions -->
    <ActionEditor
      v-model:actions="rule.actions"
      :rule-id="rule.id"
      :devices="devices"
    />
  </el-card>
</template>

<script setup lang="ts">
import { Setting, Delete } from '@element-plus/icons-vue'
import type { ControlRule, ConfigDevice } from '@/types/config-builder'
import ConditionEditor from './ConditionEditor.vue'
import PolicyEditor from './PolicyEditor.vue'
import ActionEditor from './ActionEditor.vue'

interface Props {
  rule: ControlRule
  index: number
  devices: ConfigDevice[]
}

defineProps<Props>()
const emit = defineEmits<{ (e: 'remove'): void }>()
</script>

<style scoped>
.rule-card {
  border: 1px solid #dcdfe6;
}

.rule-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.rule-header .el-button {
  margin-left: auto;
}
</style>
