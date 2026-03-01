<template>
  <div class="yaml-preview-panel">
    <div class="panel-header">
      <span class="panel-title">YAML 預覽</span>
      <el-tag v-if="validResult !== null" :type="validResult ? 'success' : 'danger'" size="small">
        {{ validResult ? '驗證通過' : '驗證失敗' }}
      </el-tag>
      <el-button size="small" :loading="loading" @click="emit('refresh')">重新產生</el-button>
    </div>

    <div v-if="errors.length" class="error-list">
      <div v-for="err in errors" :key="err.field" class="error-item">
        <span class="error-field">{{ err.field }}</span>：{{ err.message }}
      </div>
    </div>

    <pre v-if="yaml" class="yaml-content">{{ yaml }}</pre>
    <el-empty v-else description="尚無 YAML 資料，請先填寫表單" :image-size="60" />
  </div>
</template>

<script setup lang="ts">
import type { ValidationError } from '@/types/config-builder'

interface Props {
  yaml: string
  loading?: boolean
  errors?: ValidationError[]
  validResult?: boolean | null
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  errors: () => [],
  validResult: null,
})

const emit = defineEmits<{ (e: 'refresh'): void }>()
</script>

<style scoped>
.yaml-preview-panel {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  flex: 1;
}

.error-list {
  padding: 8px 16px;
  background: #fef0f0;
  border-bottom: 1px solid #fde2e2;
}

.error-item {
  font-size: 13px;
  color: #f56c6c;
  margin-bottom: 4px;
}

.error-item:last-child {
  margin-bottom: 0;
}

.error-field {
  font-weight: 600;
  font-family: monospace;
}

.yaml-content {
  margin: 0;
  padding: 16px;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
  background: #1e1e2e;
  color: #cdd6f4;
}
</style>
