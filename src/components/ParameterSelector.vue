<template>
  <el-card class="parameter-selector">
    <template #header>
      <div class="card-header">
        <span>⚙️ 參數選擇</span>
        <el-tag v-if="selectedCount > 0" type="primary"> 已選 {{ selectedCount }} 個 </el-tag>
      </div>
    </template>

    <!-- 快速選擇 -->
    <div class="quick-select">
      <el-space wrap>
        <el-button size="small" @click="selectAll"> 全選 </el-button>
        <el-button size="small" @click="clearSelection"> 清除 </el-button>
        <el-button size="small" @click="selectByType('digital')"> 數位參數 </el-button>
        <el-button size="small" @click="selectByType('analog')"> 類比參數 </el-button>
        <el-button size="small" @click="invertSelection"> 反選 </el-button>
      </el-space>
    </div>

    <el-divider />

    <!-- 搜尋框 -->
    <el-input
      v-model="searchKeyword"
      placeholder="搜尋參數..."
      :prefix-icon="Search"
      clearable
      size="default"
      style="margin-bottom: 15px"
    />

    <!-- 參數分類 -->
    <el-tabs v-model="activeTab" type="border-card">
      <!-- 全部參數 -->
      <el-tab-pane label="全部參數" name="all">
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
              {{ param.type === 'digital' ? '數位' : '類比' }}
            </el-tag>
          </div>
        </div>
      </el-tab-pane>

      <!-- 數位輸出 -->
      <el-tab-pane label="數位輸出" name="digital-output">
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

      <!-- 數位輸入 -->
      <el-tab-pane label="數位輸入" name="digital-input">
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

      <!-- 類比參數 -->
      <el-tab-pane label="類比參數" name="analog">
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

    <!-- 已選擇的參數 -->
    <el-divider content-position="left">已選擇的參數</el-divider>
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
      <el-empty v-if="selectedCount === 0" :image-size="60" description="尚未選擇參數" />
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

// 參數定義
interface Parameter {
  name: string
  type: 'digital' | 'analog'
  category: 'output' | 'input'
  description: string
}

const allParameters = ref<Parameter[]>([
  // 數位輸出
  { name: 'DOut01', type: 'digital', category: 'output', description: '數位輸出 1' },
  { name: 'DOut02', type: 'digital', category: 'output', description: '數位輸出 2' },
  { name: 'DOut03', type: 'digital', category: 'output', description: '數位輸出 3' },
  { name: 'DOut04', type: 'digital', category: 'output', description: '數位輸出 4' },
  // 數位輸入
  { name: 'DIn01', type: 'digital', category: 'input', description: '數位輸入 1' },
  { name: 'DIn02', type: 'digital', category: 'input', description: '數位輸入 2' },
  { name: 'DIn03', type: 'digital', category: 'input', description: '數位輸入 3' },
  { name: 'DIn04', type: 'digital', category: 'input', description: '數位輸入 4' },
  // 類比輸入
  { name: 'AIn01', type: 'analog', category: 'input', description: '類比輸入 1 (0-10V)' },
  { name: 'AIn02', type: 'analog', category: 'input', description: '類比輸入 2 (0-10V)' },
])

// 狀態
const selectedParameters = ref<string[]>(props.modelValue || [])
const searchKeyword = ref('')
const activeTab = ref('all')

// 計算屬性
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

// 方法
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
