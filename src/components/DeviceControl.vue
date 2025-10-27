<template>
  <el-card class="device-control">
    <template #header>
      <div class="card-header">
        <el-icon><Setting /></el-icon>
        <span>{{ t.deviceControl.title }}</span>
      </div>
    </template>

    <template v-if="!currentDeviceId">
      <el-empty :description="t.deviceControl.connectHint" />
    </template>

    <template v-else>
      <!-- 數位輸出控制 -->
      <div class="control-section">
        <h3>{{ t.deviceControl.digitalOutput }}</h3>
        <div class="control-grid">
          <div v-for="param in digitalOutputs" :key="param.name" class="control-item">
            <div class="control-label">{{ param.name }}</div>
            <div class="control-value">
              <el-switch
                :model-value="getLocalValue(param.name)"
                :loading="param.loading"
                @change="(value: boolean) => handleDigitalWrite(param.name, value)"
              />
              <el-tag :type="getLocalValue(param.name) ? 'success' : 'info'" size="small">
                {{ getLocalValue(param.name) ? t.dataDisplay.on : t.dataDisplay.off }}
              </el-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- 類比輸入顯示（只讀） -->
      <el-divider />
      <div class="control-section">
        <h3>類比輸入 (AIn)</h3>
        <div class="control-grid">
          <div v-for="param in analogInputs" :key="param.name" class="control-item">
            <div class="control-label">{{ param.name }}</div>
            <div class="control-value-readonly">
              <span class="value-text">{{ formatValue(param.value) }}</span>
              <span v-if="param.unit" class="value-unit">{{ param.unit }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 自訂參數寫入 -->
      <el-divider />
      <div class="control-section">
        <h3>{{ t.deviceControl.customParameter }}</h3>
        <el-form :model="customForm" inline>
          <el-form-item :label="t.deviceControl.parameterName">
            <el-input
              v-model="customForm.parameter"
              :placeholder="t.deviceControl.parameterPlaceholder"
              style="width: 150px"
            />
          </el-form-item>
          <el-form-item :label="t.deviceControl.writeValue">
            <el-input-number v-model="customForm.value" style="width: 120px" />
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="customForm.force">
              {{ t.deviceControl.forceWrite }}
            </el-checkbox>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :disabled="!customForm.parameter" @click="handleCustomWrite">
              {{ t.deviceControl.write }}
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 快速操作 -->
      <el-divider />
      <div class="control-section">
        <h3>{{ t.deviceControl.quickActions }}</h3>
        <el-space>
          <el-button @click="handleAllOn">{{ t.deviceControl.allOn }}</el-button>
          <el-button @click="handleAllOff">{{ t.deviceControl.allOff }}</el-button>
          <el-button @click="handleResetAll">{{ t.deviceControl.resetAll }}</el-button>
        </el-space>
      </div>

      <!-- 操作歷史 -->
      <el-divider />
      <div class="control-section">
        <h3>{{ t.deviceControl.operationHistory }}</h3>
        <el-timeline v-if="operationHistory.length > 0">
          <el-timeline-item
            v-for="(op, index) in operationHistory.slice(0, 20)"
            :key="index"
            :timestamp="op.timestamp"
            :type="op.success ? 'success' : 'danger'"
          >
            {{ op.message }}
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else :description="t.deviceControl.noHistory" />
      </div>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { useDataStore } from '@/stores/data'
import { useI18n } from '@/composables/useI18n'
import type { PrimitiveValue } from '@/types'

const { t } = useI18n()
const { isConnected, connectionConfig, writeParameter } = useWebSocket()
const dataStore = useDataStore()

// 把 latestData 變成真正的 ref（避免直接讀 state 導致無法響應）
const { latestData } = storeToRefs(dataStore)

const customForm = ref({ parameter: '', value: 0, force: false })

// 本地狀態（避免切換時閃爍）
const localValues = ref<Record<string, number | boolean>>({})
const loadingStates = ref<Record<string, boolean>>({})

const operationHistory = ref<Array<{ timestamp: string; message: string; success: boolean }>>([])

// 目前設備 ID
const currentDeviceId = computed<string>(() => connectionConfig.value?.deviceId || '')

// 目前設備的資料（從 latestData 取）
const currentDeviceData = computed(() => {
  if (!currentDeviceId.value) return {} as Record<string, { value: PrimitiveValue; unit?: string }>
  return latestData.value[currentDeviceId.value]?.data || {}
})

// 數位輸出
const digitalOutputs = computed(() => {
  const data = currentDeviceData.value
  return Object.keys(data)
    .filter((k) => k.startsWith('DOut'))
    .sort()
    .map((key) => ({
      name: key,
      value: data[key]?.value,
      unit: data[key]?.unit,
      loading: loadingStates.value[key] || false,
    }))
})

// 類比輸入（只讀）
const analogInputs = computed(() => {
  const data = currentDeviceData.value
  return Object.keys(data)
    .filter((k) => k.startsWith('AIn'))
    .sort()
    .map((key) => ({ name: key, value: data[key]?.value, unit: data[key]?.unit }))
})

const getLocalValue = (paramName: string): boolean => {
  if (paramName in localValues.value) return Boolean(localValues.value[paramName])
  const value = currentDeviceData.value[paramName]?.value
  return Boolean(value)
}

const formatValue = (value: PrimitiveValue | undefined): string => {
  if (value === undefined || value === null) return '-'
  if (typeof value === 'number') return value.toFixed(2)
  return String(value)
}

const handleDigitalWrite = async (parameter: string, value: boolean) => {
  if (!isConnected.value) {
    ElMessage.warning('請先連接設備')
    return
  }
  try {
    localValues.value[parameter] = value
    loadingStates.value[parameter] = true
    await writeParameter(parameter, value ? 1 : 0, false)
    addOperationHistory(`${parameter} 設為 ${value ? 'ON' : 'OFF'}`, true)
    ElMessage.success(t.value.deviceControl.writeSuccess)
  } catch (e) {
    delete localValues.value[parameter]
    const err = e as Error
    addOperationHistory(`${parameter} 寫入失敗: ${err.message}`, false)
    ElMessage.error(`${t.value.deviceControl.writeFailed}: ${err.message}`)
  } finally {
    loadingStates.value[parameter] = false
  }
}

const handleCustomWrite = async () => {
  if (!isConnected.value) return ElMessage.warning('請先連接設備')
  if (!customForm.value.parameter) return ElMessage.warning('請輸入參數名稱')

  try {
    await writeParameter(customForm.value.parameter, customForm.value.value, customForm.value.force)
    addOperationHistory(
      `${customForm.value.parameter} = ${customForm.value.value}${customForm.value.force ? ' (強制)' : ''}`,
      true,
    )
    ElMessage.success(t.value.deviceControl.writeSuccess)
    customForm.value = { parameter: '', value: 0, force: false }
  } catch (e) {
    const err = e as Error
    addOperationHistory(`寫入失敗: ${err.message}`, false)
    ElMessage.error(`${t.value.deviceControl.writeFailed}: ${err.message}`)
  }
}

const handleAllOn = async () => {
  for (const output of digitalOutputs.value) {
    await handleDigitalWrite(output.name, true)
    await new Promise((r) => setTimeout(r, 100))
  }
}

const handleAllOff = async () => {
  for (const output of digitalOutputs.value) {
    await handleDigitalWrite(output.name, false)
    await new Promise((r) => setTimeout(r, 100))
  }
}

const handleResetAll = async () => {
  await handleAllOff()
}

const addOperationHistory = (message: string, success: boolean) => {
  operationHistory.value.unshift({
    timestamp: new Date().toLocaleString('zh-TW'),
    message,
    success,
  })
  if (operationHistory.value.length > 20) {
    operationHistory.value = operationHistory.value.slice(0, 20)
  }
}

// 後端數據更新時，如無本地值可選擇同步（目前不覆蓋本地樂觀值）
watch(
  () => currentDeviceData.value,
  (newData) => {
    if (!newData) return
    Object.keys(newData).forEach((k) => {
      if (k.startsWith('DOut') && !(k in localValues.value)) {
        // 想與後端同步可打開下一行：
        // localValues.value[k] = Boolean(newData[k]?.value)
      }
    })
  },
  { deep: true },
)

// 連線中斷時清空本地狀態
watch(isConnected, (connected) => {
  if (!connected) {
    localValues.value = {}
    loadingStates.value = {}
  }
})
</script>

<style scoped lang="scss">
.device-control {
  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;

    .el-icon {
      font-size: 18px;
    }
  }

  .control-section {
    margin-bottom: 24px;

    h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--el-text-color-primary);
    }
  }

  .control-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }

  .control-item {
    padding: 12px;
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
    background: var(--el-fill-color-blank);

    .control-label {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
      color: var(--el-text-color-regular);
    }

    .control-value {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .control-value-readonly {
      display: flex;
      align-items: baseline;
      gap: 4px;

      .value-text {
        font-size: 20px;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }

      .value-unit {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }
  }
}
</style>
