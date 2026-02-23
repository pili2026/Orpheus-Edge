<template>
  <el-dialog
    :model-value="visible"
    :title="`${row?.model} — Slave ${row?.slaveId}`"
    width="720px"
    @close="$emit('update:visible', false)"
  >
    <div v-if="isLoadingTemplate" v-loading="true" style="height: 120px" />

    <template v-else>
      <div v-if="mode === 'ai' && hasAnyTemplate" style="margin-bottom: 8px; text-align: right">
        <el-button size="small" type="primary" plain @click="applyAllTemplates">
          {{ t.instanceConfig.applyAllTemplates }}
        </el-button>
      </div>

      <el-table :data="pinRows" border>
        <el-table-column prop="pinName" :label="t.instanceConfig.pinName" width="100" />

        <el-table-column :label="t.instanceConfig.pinRemark" width="180">
          <template #default="{ row: pinRow }">
            <el-input
              v-model="pinRow.remark"
              size="small"
              clearable
              :placeholder="pinRow.templateRemark || '—'"
            />
          </template>
        </el-table-column>

        <template v-if="mode === 'ai'">
          <el-table-column label="N1" width="90">
            <template #default="{ row: pinRow }">
              <el-input-number
                v-model="pinRow.n1"
                size="small"
                :controls="false"
                :placeholder="String(pinRow.templateN1 ?? 0)"
                style="width: 80px"
              />
            </template>
          </el-table-column>
          <el-table-column label="N2" width="140">
            <template #default="{ row: pinRow }">
              <el-input-number
                v-model="pinRow.n2"
                size="small"
                :controls="false"
                :precision="10"
                :placeholder="String(pinRow.templateN2 ?? 1)"
                style="width: 130px"
              />
            </template>
          </el-table-column>
          <el-table-column label="N3" width="90">
            <template #default="{ row: pinRow }">
              <el-input-number
                v-model="pinRow.n3"
                size="small"
                :controls="false"
                :placeholder="String(pinRow.templateN3 ?? 0)"
                style="width: 80px"
              />
            </template>
          </el-table-column>
          <el-table-column label="Template" width="120">
            <template #default="{ row: pinRow }">
              <el-button
                v-if="hasTemplate(pinRow)"
                size="small"
                text
                type="primary"
                @click="applyTemplate(pinRow)"
              >
                {{ t.instanceConfig.applyTemplate }}
              </el-button>
            </template>
          </el-table-column>
        </template>
      </el-table>
    </template>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">{{ t.common.cancel }}</el-button>
      <el-button type="primary" :loading="isSaving" @click="handleSave">
        {{ t.common.save }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import axios from 'axios'
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { usePinMappingStore } from '@/stores/pin_mapping'
import type { InstanceConfigRequest, PinConfig } from '@/stores/instance_config'

const props = defineProps<{
  visible: boolean
  row: any
  mode: 'ai' | 'di'
  isSaving: boolean
}>()

const emit = defineEmits<{
  'update:visible': [boolean]
  save: [InstanceConfigRequest]
}>()

const { t } = useI18n()
const pinMappingStore = usePinMappingStore()

// ===== Types =====
interface PinRow {
  pinName: string
  remark: string
  n1: number
  n2: number
  n3: number
  templateRemark: string
  templateN1: number
  templateN2: number
  templateN3: number
}

// ===== State =====
const pinRows = ref<PinRow[]>([])
const isLoadingTemplate = ref(false)

// ===== Computed =====
const hasAnyTemplate = computed(() =>
  pinRows.value.some((r) => r.templateRemark || r.templateN2 !== 1),
)

// ===== Helpers =====
const hasTemplate = (pinRow: PinRow): boolean => {
  return !!(pinRow.templateRemark || pinRow.templateN2 !== 1)
}

const applyTemplate = (pinRow: PinRow) => {
  if (pinRow.templateRemark) pinRow.remark = pinRow.templateRemark
  pinRow.n1 = pinRow.templateN1
  pinRow.n2 = pinRow.templateN2
  pinRow.n3 = pinRow.templateN3
}

const applyAllTemplates = () => {
  for (const pinRow of pinRows.value) {
    if (pinRow.templateRemark) pinRow.remark = pinRow.templateRemark
    pinRow.n1 = pinRow.templateN1
    pinRow.n2 = pinRow.templateN2
    pinRow.n3 = pinRow.templateN3
  }
}

// ===== Watch =====
watch(
  () => props.row,
  async (row) => {
    if (!row) return
    isLoadingTemplate.value = true

    let templatePins: Record<string, { name?: string; formula?: number[] }> = {}
    let driverPinKeys: string[] = []

    if (props.mode === 'ai') {
      try {
        const templateConfig = await pinMappingStore.fetchTemplate(row.model)
        if (templateConfig?.pin_mappings) {
          templatePins = templateConfig.pin_mappings
        }
      } catch {
        // no template
      }
    } else {
      // DI: From driver register_map to get pin list
      try {
        const { data } = await axios.get(`/api/config/modbus_drivers/${row.model}`)
        driverPinKeys = Object.keys(data.register_map ?? {})
      } catch {
        // fallback to existing pins
      }
    }

    const existingPins: Record<string, PinConfig> = row.instance.pins ?? {}

    const keys =
      props.mode === 'ai'
        ? Object.keys(templatePins).length > 0
          ? Object.keys(templatePins)
          : Object.keys(existingPins)
        : driverPinKeys.length > 0
          ? driverPinKeys
          : Object.keys(existingPins)

    pinRows.value = keys.map((pinName) => {
      const existing = existingPins[pinName]
      const template = templatePins[pinName]
      const templateRemark = template?.name ?? ''
      const templateN1 = template?.formula?.[0] ?? 0
      const templateN2 = template?.formula?.[1] ?? 1
      const templateN3 = template?.formula?.[2] ?? 0
      return {
        pinName,
        remark: existing?.remark ?? '',
        n1: existing?.formula?.[0] ?? templateN1,
        n2: existing?.formula?.[1] ?? templateN2,
        n3: existing?.formula?.[2] ?? templateN3,
        templateRemark,
        templateN1,
        templateN2,
        templateN3,
      }
    })

    isLoadingTemplate.value = false
  },
  { immediate: true },
)

// ===== Save =====
const handleSave = () => {
  const pins: Record<string, PinConfig> = {}

  for (const row of pinRows.value) {
    const pin: PinConfig = {}
    if (row.remark) pin.remark = row.remark
    if (props.mode === 'ai') {
      pin.formula = [row.n1, row.n2, row.n3]
    }
    if (Object.keys(pin).length > 0) {
      pins[row.pinName] = pin
    }
  }

  const payload: InstanceConfigRequest = {
    pins: Object.keys(pins).length > 0 ? pins : null,
  }
  emit('save', payload)
}
</script>
