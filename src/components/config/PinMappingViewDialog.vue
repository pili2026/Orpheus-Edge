<template>
  <el-dialog
    :model-value="visible"
    :title="`Pin Mapping — ${model}`"
    width="760px"
    @close="$emit('update:visible', false)"
  >
    <div v-if="isLoading" v-loading="true" style="height: 200px" />

    <template v-else-if="config">
      <div class="dialog-meta">
        <el-tag :type="source === 'override' ? 'success' : 'info'" size="small">
          {{ source }}
        </el-tag>
        <span v-if="config.description" class="description">{{ config.description }}</span>
      </div>

      <el-table :data="pinRows" border style="margin-top: 12px">
        <el-table-column prop="pinName" label="Pin" width="100" />
        <el-table-column prop="name" label="名稱" width="140" />
        <el-table-column prop="type" label="類型" width="120" />
        <el-table-column prop="unit" label="單位" width="80" />
        <el-table-column prop="precision" label="精度" width="80" />
        <el-table-column label="N1" width="80">
          <template #default="{ row }">{{ row.n1 }}</template>
        </el-table-column>
        <el-table-column label="N2" width="140">
          <template #default="{ row }">{{ row.n2 }}</template>
        </el-table-column>
        <el-table-column label="N3" width="80">
          <template #default="{ row }">{{ row.n3 }}</template>
        </el-table-column>
      </el-table>
    </template>

    <el-empty v-else :description="'無 Pin Mapping 資料'" />

    <template #footer>
      <el-button @click="$emit('update:visible', false)">{{ t.common.close }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { usePinMappingStore } from '@/stores/pin_mapping'

const props = defineProps<{
  visible: boolean
  model: string
}>()

const emit = defineEmits<{
  'update:visible': [boolean]
}>()

const { t } = useI18n()
const pinMappingStore = usePinMappingStore()

const isLoading = ref(false)
const config = ref<any>(null)
const source = ref<string>('')

interface PinRow {
  pinName: string
  name: string
  type: string
  unit: string
  precision: number | string
  n1: number
  n2: number
  n3: number
}

const pinRows = computed<PinRow[]>(() => {
  if (!config.value?.pin_mappings) return []
  return Object.entries(config.value.pin_mappings).map(([pinName, pin]: [string, any]) => ({
    pinName,
    name: pin.name ?? '—',
    type: pin.type ?? '—',
    unit: pin.unit ?? '—',
    precision: pin.precision ?? '—',
    n1: pin.formula?.[0] ?? 0,
    n2: pin.formula?.[1] ?? 1,
    n3: pin.formula?.[2] ?? 0,
  }))
})

watch(
  () => [props.visible, props.model],
  async ([visible, model]) => {
    if (!visible || !model) return
    isLoading.value = true
    try {
      const result = await pinMappingStore.fetchPinMapping(model as string)
      config.value = pinMappingStore.currentConfig
      source.value = pinMappingStore.currentSource ?? ''
    } finally {
      isLoading.value = false
    }
  },
)
</script>

<style scoped>
.dialog-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}
.description {
  font-size: 13px;
  color: #909399;
}
</style>
