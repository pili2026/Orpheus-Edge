<template>
  <div class="diagram-panel">
    <div class="panel-header">
      <span class="panel-title">流程圖預覽</span>
      <el-button size="small" :loading="loading" @click="emit('refresh')">重新整理</el-button>
    </div>

    <div v-if="loading" class="diagram-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>產生中...</span>
    </div>
    <div v-else-if="mermaid" ref="diagramRef" class="diagram-content"></div>
    <el-empty v-else description="尚無流程圖，請先產生 YAML" :image-size="60" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { Loading } from '@element-plus/icons-vue'

interface Props {
  mermaid: string
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{ (e: 'refresh'): void }>()

const diagramRef = ref<HTMLElement>()

watch(
  () => props.mermaid,
  async (code) => {
    if (!code || !diagramRef.value) return
    await nextTick()
    try {
      // Dynamically import mermaid to keep initial bundle small
      const mermaid = (await import('mermaid')).default
      mermaid.initialize({ startOnLoad: false, theme: 'default' })
      const { svg } = await mermaid.render(`diagram-${Date.now()}`, code)
      if (diagramRef.value) {
        diagramRef.value.innerHTML = svg
      }
    } catch (err) {
      if (diagramRef.value) {
        diagramRef.value.innerHTML = `<div class="diagram-error">流程圖渲染失敗：${(err as Error).message}</div>`
      }
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.diagram-panel {
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

.diagram-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 16px;
  color: #909399;
}

.diagram-content {
  padding: 16px;
  min-height: 200px;
  overflow: auto;
}

:deep(.diagram-error) {
  color: #f56c6c;
  font-size: 13px;
  padding: 16px;
}
</style>
