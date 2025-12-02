<template>
  <el-card class="parameter-selector">
    <template #header>
      <div class="card-header">
        <span>⚙️ Parameter Selection</span>
        <el-tag v-if="selectedCount > 0" type="primary"> Selected {{ selectedCount }} </el-tag>
      </div>
    </template>

    <!-- Quick Actions -->
    <div class="quick-select">
      <el-space wrap>
        <el-button size="small" @click="selectAll"> Select All </el-button>
        <el-button size="small" @click="clearSelection"> Clear </el-button>
        <el-button size="small" @click="selectByType('digital')"> Digital Parameters </el-button>
        <el-button size="small" @click="selectByType('analog')"> Analog Parameters </el-button>
        <el-button size="small" @click="invertSelection"> Invert Selection </el-button>
      </el-space>
    </div>

    <el-divider />

    <!-- Search Box -->
    <el-input
      v-model="searchKeyword"
      placeholder="Search parameters..."
      :prefix-icon="Search"
      clearable
      size="default"
      style="margin-bottom: 15px"
    />

    <!-- Parameter Tabs -->
    <el-tabs v-model="activeTab" type="border-card">
      <!-- All Parameters -->
      <el-tab-pane label="All Parameters" name="all">
        <div class="parameter-list">
          <div
            v-for="param in filteredParameters"
            :key="param.name"
            class="parameter-item"
            :class="{ 'is-selected': isSelected(param.name) }"
            @click="toggleParameter(param.name)"
          >
            <el-checkbox
              :model-value="isSelected(param.name)"
              @click.stop="toggleParameter(param.name)"
            />
            <div class="parameter-info">
              <div class="parameter-name">
                {{ param.name }}
              </div>
              <div class="parameter-description">
                {{ param.description }}
              </div>
            </div>
            <el-tag :type="param.type === 'digital' ? 'success' : 'primary'" size="small">
              {{ param.type === 'digital' ? 'Digital' : 'Analog' }}
            </el-tag>
          </div>
        </div>
      </el-tab-pane>

      <!-- Digital Output -->
      <el-tab-pane label="Digital Output" name="digital-output">
        <div class="parameter-grid">
          <div
            v-for="param in digitalOutputParameters"
            :key="param.name"
            class="parameter-card"
            :class="{ 'is-selected': isSelected(param.name) }"
            @click="toggleParameter(param.name)"
          >
            <el-checkbox
              :model-value="isSelected(param.name)"
              @click.stop="toggleParameter(param.name)"
            />
            <div class="card-content">
              <div class="card-name">{{ param.name }}</div>
              <div class="card-desc">{{ param.description }}</div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- Digital Input -->
      <el-tab-pane label="Digital Input" name="digital-input">
        <div class="parameter-grid">
          <div
            v-for="param in digitalInputParameters"
            :key="param.name"
            class="parameter-card"
            :class="{ 'is-selected': isSelected(param.name) }"
            @click="toggleParameter(param.name)"
          >
            <el-checkbox
              :model-value="isSelected(param.name)"
              @click.stop="toggleParameter(param.name)"
            />
            <div class="card-content">
              <div class="card-name">{{ param.name }}</div>
              <div class="card-desc">{{ param.description }}</div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- Analog Parameters -->
      <el-tab-pane label="Analog Parameters" name="analog">
        <div class="parameter-grid">
          <div
            v-for="param in analogParameters"
            :key="param.name"
            class="parameter-card"
            :class="{ 'is-selected': isSelected(param.name) }"
            @click="toggleParameter(param.name)"
          >
            <el-checkbox
              :model-value="isSelected(param.name)"
              @click.stop="toggleParameter(param.name)"
            />
            <div class="card-content">
              <div class="card-name">{{ param.name }}</div>
              <div class="card-desc">{{ param.description }}</div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- Selected Parameters -->
    <el-divider content-position="left">Selected Parameters</el-divider>
    <div class="selected-parameters">
      <el-tag
        v-for="param in selectedParameters"
        :key="param"
        closable
        @close="toggleParameter(param)"
        style="margin: 4px"
      >
        {{ param }}
      </el-tag>
      <el-empty v-if="selectedCount === 0" :image-size="60" description="No parameters selected" />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search } from '@element-plus/icons-vue'

// Props & Emits
interface Props {
  modelValue?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

// Parameter Definition
interface Parameter {
  name: string
  type: 'digital' | 'analog'
  category: 'output' | 'input'
  description: string
}

const allParameters = ref<Parameter[]>([
  // Digital Output
  { name: 'DOut01', type: 'digital', category: 'output', description: 'Digital Output 1' },
  { name: 'DOut02', type: 'digital', category: 'output', description: 'Digital Output 2' },
  { name: 'DOut03', type: 'digital', category: 'output', description: 'Digital Output 3' },
  { name: 'DOut04', type: 'digital', category: 'output', description: 'Digital Output 4' },
  // Digital Input
  { name: 'DIn01', type: 'digital', category: 'input', description: 'Digital Input 1' },
  { name: 'DIn02', type: 'digital', category: 'input', description: 'Digital Input 2' },
  { name: 'DIn03', type: 'digital', category: 'input', description: 'Digital Input 3' },
  { name: 'DIn04', type: 'digital', category: 'input', description: 'Digital Input 4' },
  // Analog Input
  { name: 'AIn01', type: 'analog', category: 'input', description: 'Analog Input 1 (0-10V)' },
  { name: 'AIn02', type: 'analog', category: 'input', description: 'Analog Input 2 (0-10V)' },
])

// State
const selectedParameters = ref<string[]>(props.modelValue || [])
const searchKeyword = ref('')
const activeTab = ref('all')

// Computed
const selectedCount = computed(() => selectedParameters.value.length)

const filteredParameters = computed(() => {
  if (!searchKeyword.value) return allParameters.value

  const keyword = searchKeyword.value.toLowerCase()
  return allParameters.value.filter(
    (param) =>
      param.name.toLowerCase().includes(keyword) ||
      param.description.toLowerCase().includes(keyword),
  )
})

const digitalOutputParameters = computed(() =>
  allParameters.value.filter((p) => p.type === 'digital' && p.category === 'output'),
)

const digitalInputParameters = computed(() =>
  allParameters.value.filter((p) => p.type === 'digital' && p.category === 'input'),
)

const analogParameters = computed(() => allParameters.value.filter((p) => p.type === 'analog'))

// Methods
function isSelected(paramName: string): boolean {
  return selectedParameters.value.includes(paramName)
}

function toggleParameter(paramName: string) {
  const index = selectedParameters.value.indexOf(paramName)
  if (index >= 0) {
    selectedParameters.value.splice(index, 1)
  } else {
    selectedParameters.value.push(paramName)
  }
  emit('update:modelValue', selectedParameters.value)
}

function selectAll() {
  selectedParameters.value = allParameters.value.map((p) => p.name)
  emit('update:modelValue', selectedParameters.value)
}

function clearSelection() {
  selectedParameters.value = []
  emit('update:modelValue', selectedParameters.value)
}

function selectByType(type: 'digital' | 'analog') {
  selectedParameters.value = allParameters.value.filter((p) => p.type === type).map((p) => p.name)
  emit('update:modelValue', selectedParameters.value)
}

function invertSelection() {
  const newSelection = allParameters.value.filter((p) => !isSelected(p.name)).map((p) => p.name)
  selectedParameters.value = newSelection
  emit('update:modelValue', selectedParameters.value)
}
</script>

<style scoped>
.parameter-selector {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.quick-select {
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.parameter-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.parameter-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.parameter-item:hover {
  border-color: #409eff;
  background: #f0f9ff;
}

.parameter-item.is-selected {
  border-color: #67c23a;
  background: #f0f9ff;
}

.parameter-info {
  flex: 1;
  min-width: 0;
}

.parameter-name {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.parameter-description {
  font-size: 12px;
  color: #909399;
}

.parameter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.parameter-card {
  padding: 15px;
  border: 2px solid #ebeef5;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.parameter-card:hover {
  border-color: #409eff;
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.parameter-card.is-selected {
  border-color: #67c23a;
  background: #f0f9ff;
}

.card-content {
  flex: 1;
  min-width: 0;
}

.card-name {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.card-desc {
  font-size: 12px;
  color: #909399;
}

.selected-parameters {
  min-height: 60px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

:deep(.el-tabs__content) {
  padding: 15px 10px;
}
</style>
