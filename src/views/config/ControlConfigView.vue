<template>
  <div class="control-config-page">
    <!-- Device Selector -->
    <el-card class="section-card">
      <template #header>
        <div class="card-header">
          <el-icon><Operation /></el-icon>
          <span>控制策略配置</span>
        </div>
      </template>

      <el-form label-width="100px" inline>
        <el-form-item label="目標設備">
          <el-select
            v-model="selectedKey"
            placeholder="選擇要配置 control 的設備"
            style="width: 280px"
            @change="onDeviceSelect"
          >
            <el-option
              v-for="d in configDeviceStore.devices"
              :key="`${d.model}:${d.slave_id}`"
              :label="`${d.model} (ID:${d.slave_id})`"
              :value="`${d.model}:${d.slave_id}`"
            />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <template v-if="selectedKey">
      <!-- Rules -->
      <div class="rules-section">
        <ControlRuleEditor
          v-for="(rule, idx) in controlStore.rules"
          :key="rule.id"
          :rule="rule"
          :index="idx"
          :devices="configDeviceStore.devices"
          @remove="controlStore.removeRule(rule.id)"
        />

        <el-button :icon="Plus" @click="controlStore.addRule()">新增規則</el-button>
      </div>

      <!-- Preview Row -->
      <div class="preview-row">
        <YamlPreviewPanel
          :yaml="controlStore.generatedYaml"
          :loading="controlStore.yamlLoading"
          :errors="controlStore.validationResult?.errors ?? []"
          :valid-result="controlStore.validationResult?.valid ?? null"
          class="preview-panel"
          @refresh="onRefreshYaml"
        />

        <DiagramPanel
          :mermaid="controlStore.diagramMermaid"
          :loading="controlStore.diagramLoading"
          class="preview-panel"
          @refresh="onRefreshDiagram"
        />
      </div>
    </template>

    <el-empty v-else description="請先選擇目標設備" :image-size="80" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Operation, Plus } from '@element-plus/icons-vue'
import { useConfigDeviceStore } from '@/stores/configDevice'
import { useControlStore } from '@/stores/control'
import ControlRuleEditor from '@/components/config/control/ControlRuleEditor.vue'
import YamlPreviewPanel from '@/components/config/YamlPreviewPanel.vue'
import DiagramPanel from '@/components/config/DiagramPanel.vue'

const configDeviceStore = useConfigDeviceStore()
const controlStore = useControlStore()

const selectedKey = ref<string>('')

// Debounce timer for auto-generate
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function onDeviceSelect(key: string) {
  const [model, slaveIdStr] = key.split(':')
  controlStore.selectDevice(model, Number(slaveIdStr))
  triggerGenerate()
}

function triggerGenerate() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    try {
      await controlStore.generateYaml()
      await Promise.all([controlStore.validateYaml(), controlStore.generateDiagram()])
    } catch {
      // errors are shown via store state
    }
  }, 500)
}

// Watch rule changes for auto-generate
watch(
  () => JSON.stringify(controlStore.rules),
  () => {
    if (selectedKey.value) triggerGenerate()
  },
  { deep: true },
)

async function onRefreshYaml() {
  try {
    await controlStore.generateYaml()
    await controlStore.validateYaml()
  } catch (err: unknown) {
    ElMessage.error((err as { message?: string })?.message ?? 'YAML 產生失敗')
  }
}

async function onRefreshDiagram() {
  try {
    await controlStore.generateDiagram()
  } catch (err: unknown) {
    ElMessage.error((err as { message?: string })?.message ?? '流程圖產生失敗')
  }
}
</script>

<style scoped>
.control-config-page {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-card {
  flex-shrink: 0;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.rules-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.preview-panel {
  min-width: 0;
}
</style>
