<template>
  <el-card class="rule-card" shadow="never">
    <template #header>
      <div class="rule-header">
        <el-icon><Bell /></el-icon>
        <span>告警規則 #{{ index + 1 }}</span>
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
      <el-col :span="8">
        <el-form-item label="Code">
          <el-input v-model="rule.code" placeholder="UPPER_SNAKE_CASE" @input="rule.code = rule.code.toUpperCase()" />
        </el-form-item>
      </el-col>
      <el-col :span="8">
        <el-form-item label="名稱">
          <el-input v-model="rule.name" placeholder="告警顯示名稱" />
        </el-form-item>
      </el-col>
      <el-col :span="8">
        <el-form-item label="設備名稱">
          <el-input v-model="rule.device_name" placeholder="設備描述名稱" />
        </el-form-item>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="12">
        <el-form-item label="監控 Pin">
          <el-select
            v-model="rule.sources"
            multiple
            placeholder="選擇監控的 pin（可多選）"
            style="width: 100%"
            :loading="pinsLoading"
          >
            <el-option
              v-for="pin in availablePins"
              :key="pin.name"
              :label="pin.name"
              :value="pin.name"
            />
          </el-select>
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="告警類型">
          <el-select v-model="rule.type" style="width: 100%" @change="onTypeChange">
            <el-option label="threshold（閾值）" value="threshold" />
            <el-option label="schedule_threshold（排程閾值）" value="schedule_threshold" />
            <el-option label="schedule_expected_state（排程預期狀態）" value="schedule_expected_state" />
            <el-option label="average（平均）" value="average" />
            <el-option label="sum（加總）" value="sum" />
            <el-option label="min（最小值）" value="min" />
            <el-option label="max（最大值）" value="max" />
          </el-select>
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="嚴重程度">
          <el-select v-model="rule.severity" style="width: 100%">
            <el-option label="INFO" value="INFO" />
            <el-option label="WARNING" value="WARNING" />
            <el-option label="CRITICAL" value="CRITICAL" />
          </el-select>
        </el-form-item>
      </el-col>
    </el-row>

    <!-- schedule_threshold: active_hours -->
    <el-row v-if="rule.type === 'schedule_threshold'" :gutter="16">
      <el-col :span="12">
        <el-form-item label="啟動時間段">
          <div class="time-range">
            <el-time-picker
              v-model="activeStart"
              format="HH:mm"
              value-format="HH:mm"
              placeholder="開始時間"
              style="width: 140px"
              @change="updateActiveHours"
            />
            <span class="time-sep">至</span>
            <el-time-picker
              v-model="activeEnd"
              format="HH:mm"
              value-format="HH:mm"
              placeholder="結束時間（可跨夜）"
              style="width: 140px"
              @change="updateActiveHours"
            />
          </div>
        </el-form-item>
      </el-col>
    </el-row>

    <!-- schedule_expected_state: expected_state -->
    <el-row v-if="rule.type === 'schedule_expected_state'" :gutter="16">
      <el-col :span="6">
        <el-form-item label="預期狀態">
          <el-radio-group v-model="rule.expected_state">
            <el-radio value="on">開啟 (on)</el-radio>
            <el-radio value="off">關閉 (off)</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-col>
    </el-row>

    <!-- aggregate types need at least 2 sources warning -->
    <el-alert
      v-if="isAggregateType && rule.sources.length < 2"
      title="此告警類型需要至少 2 個監控 pin"
      type="warning"
      :closable="false"
      show-icon
      class="source-warning"
    />

    <el-row :gutter="16">
      <el-col :span="6">
        <el-form-item label="條件運算子">
          <el-select v-model="rule.condition">
            <el-option label=">" value="gt" />
            <el-option label=">=" value="gte" />
            <el-option label="<" value="lt" />
            <el-option label="<=" value="lte" />
            <el-option label="=" value="eq" />
            <el-option label="≠" value="neq" />
          </el-select>
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="閾值">
          <el-input-number
            v-model="rule.threshold"
            :controls="false"
            style="width: 100%"
            placeholder="觸發閾值"
          />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item label="告警訊息">
          <el-input v-model="rule.message" placeholder="自訂告警訊息（選填）" />
        </el-form-item>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { Bell, Delete } from '@element-plus/icons-vue'
import { useConfigDeviceStore } from '@/stores/configDevice'
import type { AlertRule, AlertType, Pin } from '@/types/config-builder'

interface Props {
  rule: AlertRule
  index: number
}

const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'remove'): void }>()

const configStore = useConfigDeviceStore()
const availablePins = ref<Pin[]>([])
const pinsLoading = ref(false)

const activeStart = ref<string>(props.rule.active_hours?.start ?? '')
const activeEnd = ref<string>(props.rule.active_hours?.end ?? '')

const isAggregateType = computed(() =>
  ['average', 'sum', 'min', 'max'].includes(props.rule.type),
)

onMounted(async () => {
  if (props.rule.device_model) {
    await loadPins(props.rule.device_model)
  }
})

watch(
  () => props.rule.device_model,
  async (model) => {
    if (model) await loadPins(model)
  },
)

async function loadPins(model: string) {
  pinsLoading.value = true
  try {
    const pins = await configStore.getPins(model)
    availablePins.value = pins.readable
  } catch {
    availablePins.value = []
  } finally {
    pinsLoading.value = false
  }
}

function onTypeChange(type: AlertType) {
  if (type !== 'schedule_threshold') {
    props.rule.active_hours = undefined
  }
  if (type !== 'schedule_expected_state') {
    props.rule.expected_state = undefined
  }
}

function updateActiveHours() {
  if (activeStart.value && activeEnd.value) {
    props.rule.active_hours = {
      start: activeStart.value,
      end: activeEnd.value,
    }
  }
}
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

.time-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-sep {
  color: #606266;
  font-size: 13px;
  white-space: nowrap;
}

.source-warning {
  margin-bottom: 12px;
}
</style>
