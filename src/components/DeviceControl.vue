<template>
  <el-card v-if="hasWritableParams" class="device-control">
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
      <!-- Inverter Control -->
      <template v-if="isInverter">
        <div class="control-section inverter-section">
          <h3>{{ t.deviceControl.inverterControl }}</h3>

          <div class="inverter-controls">
            <!-- Frequency Setting with Force Write -->
            <div class="inverter-item">
              <div class="inverter-label">
                <span>{{ t.deviceControl.frequency }}</span>
                <span class="current-value">{{ formatValue(inverterParams.currentHz) }} Hz</span>
              </div>
              <div class="inverter-input-group">
                <el-input-number
                  v-model="inverterForm.hz"
                  :min="30"
                  :max="60"
                  :step="0.1"
                  :precision="1"
                  controls-position="right"
                  style="width: 150px"
                />
                <el-checkbox v-model="inverterForm.force" size="small">
                  {{ t.deviceControl.forceWrite }}
                </el-checkbox>
                <el-button
                  type="primary"
                  :loading="loadingStates['RW_HZ']"
                  :disabled="!isConnected"
                  @click="handleInverterFrequencyWrite"
                >
                  {{ t.deviceControl.setFrequency }}
                </el-button>
              </div>
            </div>

            <!-- Run Control -->
            <div class="inverter-item">
              <div class="inverter-label">
                <span>{{ t.deviceControl.runControl }}</span>
                <el-tag :type="inverterParams.isRunning ? 'success' : 'info'" size="large">
                  {{ inverterParams.isRunning ? t.dataDisplay.on : t.dataDisplay.off }}
                </el-tag>
              </div>
              <div class="inverter-button-group">
                <el-button
                  type="success"
                  :loading="loadingStates['RW_ON_OFF']"
                  :disabled="!isConnected || inverterParams.isRunning"
                  @click="handleInverterOnOff(1)"
                >
                  {{ t.deviceControl.start }}
                </el-button>
                <el-button
                  type="warning"
                  :loading="loadingStates['RW_ON_OFF']"
                  :disabled="!isConnected || !inverterParams.isRunning"
                  @click="handleInverterOnOff(0)"
                >
                  {{ t.deviceControl.stop }}
                </el-button>
              </div>
            </div>

            <!-- Reset Button -->
            <div class="inverter-item">
              <div class="inverter-label">
                <span>{{ t.deviceControl.reset }}</span>
              </div>
              <el-button
                type="danger"
                :loading="loadingStates['RW_RESET']"
                :disabled="!isConnected"
                @click="handleInverterReset"
              >
                {{ t.deviceControl.resetInverter }}
              </el-button>
            </div>
          </div>

          <!-- Inverter Realtime Monitoring -->
          <el-divider />
          <div class="inverter-monitor">
            <div class="monitor-item">
              <span class="monitor-label">{{ t.deviceControl.power }}</span>
              <span class="monitor-value">{{ formatValue(inverterParams.kw) }} kW</span>
            </div>
            <div class="monitor-item">
              <span class="monitor-label">{{ t.deviceControl.voltage }}</span>
              <span class="monitor-value">{{ formatValue(inverterParams.voltage) }} V</span>
            </div>
            <div class="monitor-item">
              <span class="monitor-label">{{ t.deviceControl.current }}</span>
              <span class="monitor-value">{{ formatValue(inverterParams.current) }} A</span>
            </div>
            <div class="monitor-item">
              <span class="monitor-label">{{ t.deviceControl.frequency }}</span>
              <span class="monitor-value">{{ formatValue(inverterParams.hz) }} Hz</span>
            </div>
            <div class="monitor-item">
              <span class="monitor-label">{{ t.deviceControl.status }}</span>
              <el-tag :type="getStatusType(inverterParams.invStatus)" size="small">
                {{ getStatusText(inverterParams.invStatus) }}
              </el-tag>
            </div>
          </div>
        </div>
        <el-divider />
      </template>

      <!-- Digital Output Control -->
      <div v-if="digitalOutputs.length > 0" class="control-section">
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

      <!-- Analog Input Display (read-only) -->
      <template v-if="analogInputs.length > 0">
        <el-divider />
        <div class="control-section">
          <h3>Analog Input (AIn)</h3>
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
      </template>

      <!-- Quick Actions (only shown when digital outputs exist) -->
      <template v-if="digitalOutputs.length > 0">
        <el-divider />
        <div class="control-section">
          <h3>{{ t.deviceControl.quickActions }}</h3>
          <el-space>
            <el-button @click="handleAllOn">{{ t.deviceControl.allOn }}</el-button>
            <el-button @click="handleAllOff">{{ t.deviceControl.allOff }}</el-button>
            <el-button @click="handleResetAll">{{ t.deviceControl.resetAll }}</el-button>
          </el-space>
        </div>
      </template>

      <!-- Operation History -->
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

  <el-card v-else-if="currentDeviceId" class="device-control">
    <el-empty :description="t.deviceControl.readOnlyDevice">
      <el-text type="info">{{ t.deviceControl.readOnlyDeviceHint }}</el-text>
    </el-empty>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { useDataStore } from '@/stores/data'
import { useI18n } from '@/composables/useI18n'
import type { PrimitiveValue } from '@/types'

const { t } = useI18n()
const { isConnected, connectionConfig, writeParameter } = useWebSocket()
const dataStore = useDataStore()

const { latestData } = storeToRefs(dataStore)

const inverterForm = ref({ hz: 50, force: false })

const localValues = ref<Record<string, number | boolean>>({})
const loadingStates = ref<Record<string, boolean>>({})

const operationHistory = ref<Array<{ timestamp: string; message: string; success: boolean }>>([])

const currentDeviceId = computed<string>(() => connectionConfig.value?.deviceId || '')

const currentDeviceData = computed(() => {
  if (!currentDeviceId.value) return {} as Record<string, { value: PrimitiveValue; unit?: string }>
  return latestData.value[currentDeviceId.value]?.data || {}
})

const availableParams = computed(() => {
  const deviceId = currentDeviceId.value
  if (!deviceId) return []
  return dataStore.deviceParameters[deviceId] || []
})

const isInverter = computed(() => {
  const params = availableParams.value
  if (params.length > 0) {
    return params.includes('RW_HZ') || params.includes('RW_ON_OFF')
  }
  const data = currentDeviceData.value
  return 'RW_HZ' in data || 'HZ' in data || 'KW' in data
})

const inverterParams = computed(() => {
  const data = currentDeviceData.value
  return {
    currentHz: data['RW_HZ']?.value ?? data['HZ']?.value ?? 0,
    isRunning: Boolean(data['RW_ON_OFF']?.value ?? data['INVSTATUS']?.value),
    kw: data['KW']?.value ?? 0,
    voltage: data['VOLTAGE']?.value ?? 0,
    current: data['CURRENT']?.value ?? 0,
    hz: data['HZ']?.value ?? 0,
    kwh: data['KWH']?.value ?? 0,
    error: data['ERROR']?.value ?? 0,
    alert: data['ALERT']?.value ?? 0,
    invStatus: data['INVSTATUS']?.value ?? 0,
  }
})

const digitalOutputs = computed(() => {
  const data = currentDeviceData.value
  const params = availableParams.value

  const paramList =
    params.length > 0
      ? params.filter((k) => k.startsWith('DOut'))
      : Object.keys(data).filter((k) => k.startsWith('DOut'))

  return paramList.sort().map((key) => ({
    name: key,
    value: data[key]?.value,
    unit: data[key]?.unit,
    loading: loadingStates.value[key] || false,
  }))
})

const analogInputs = computed(() => {
  const data = currentDeviceData.value
  const params = availableParams.value

  const paramList =
    params.length > 0
      ? params.filter((k) => k.startsWith('AIn'))
      : Object.keys(data).filter((k) => k.startsWith('AIn'))

  return paramList.sort().map((key) => ({
    name: key,
    value: data[key]?.value,
    unit: data[key]?.unit,
  }))
})

const hasWritableParams = computed(() => {
  if (!currentDeviceId.value) return false

  const hasInverter = isInverter.value
  const hasDigitalOutputs = digitalOutputs.value.length > 0
  const hasAnalogOutputs = Object.keys(currentDeviceData.value).some((key) =>
    key.startsWith('AOut'),
  )

  return hasInverter || hasDigitalOutputs || hasAnalogOutputs
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

const getStatusType = (status: PrimitiveValue | undefined): string => {
  if (!status) return 'info'
  const statusNum = Number(status)
  if (statusNum === 1) return 'success'
  if (statusNum === 0) return 'info'
  return 'warning'
}

const getStatusText = (status: PrimitiveValue | undefined): string => {
  if (!status) return t.value.dataDisplay.off
  const statusNum = Number(status)
  if (statusNum === 1) return 'Running'
  if (statusNum === 0) return 'Stopped'
  return `Status ${statusNum}`
}

const handleInverterFrequencyWrite = async () => {
  if (!isConnected.value) {
    ElMessage.warning('Please connect to the device first')
    return
  }

  const hz = inverterForm.value.hz
  if (hz < 30 || hz > 60) {
    ElMessage.warning('Frequency must be between 30-60 Hz')
    return
  }

  const force = inverterForm.value.force

  if (force) {
    try {
      await ElMessageBox.confirm(
        `Are you sure you want to force set frequency to ${hz} Hz? This will bypass safety constraints.`,
        'Confirm Force Write',
        {
          confirmButtonText: 'Confirm',
          cancelButtonText: 'Cancel',
          type: 'warning',
        },
      )
    } catch {
      return
    }
  }

  try {
    loadingStates.value['RW_HZ'] = true
    await writeParameter('RW_HZ', hz, force)
    addOperationHistory(`Set frequency to ${hz} Hz${force ? ' (forced)' : ''}`, true)
    ElMessage.success(t.value.deviceControl.writeSuccess)
    inverterForm.value.force = false
  } catch (e) {
    const err = e as Error
    addOperationHistory(`Failed to set frequency: ${err.message}`, false)
    ElMessage.error(`${t.value.deviceControl.writeFailed}: ${err.message}`)
  } finally {
    loadingStates.value['RW_HZ'] = false
  }
}

const handleInverterOnOff = async (value: number) => {
  if (!isConnected.value) {
    ElMessage.warning('Please connect to the device first')
    return
  }

  try {
    loadingStates.value['RW_ON_OFF'] = true
    await writeParameter('RW_ON_OFF', value, false)
    addOperationHistory(`Inverter ${value === 1 ? 'started' : 'stopped'}`, true)
    ElMessage.success(t.value.deviceControl.writeSuccess)
  } catch (e) {
    const err = e as Error
    addOperationHistory(`Inverter control failed: ${err.message}`, false)
    ElMessage.error(`${t.value.deviceControl.writeFailed}: ${err.message}`)
  } finally {
    loadingStates.value['RW_ON_OFF'] = false
  }
}

const handleInverterReset = async () => {
  if (!isConnected.value) {
    ElMessage.warning('Please connect to the device first')
    return
  }

  try {
    await ElMessageBox.confirm(
      'Are you sure you want to reset the inverter? This will clear the error status.',
      'Confirm Reset',
      {
        confirmButtonText: 'Confirm',
        cancelButtonText: 'Cancel',
        type: 'warning',
      },
    )

    loadingStates.value['RW_RESET'] = true
    await writeParameter('RW_RESET', 1, true)
    addOperationHistory('Inverter has been reset', true)
    ElMessage.success(t.value.deviceControl.writeSuccess)
  } catch (e) {
    if (e === 'cancel') return
    const err = e as Error
    addOperationHistory(`Reset failed: ${err.message}`, false)
    ElMessage.error(`${t.value.deviceControl.writeFailed}: ${err.message}`)
  } finally {
    loadingStates.value['RW_RESET'] = false
  }
}

const handleDigitalWrite = async (parameter: string, value: boolean) => {
  if (!isConnected.value) {
    ElMessage.warning('Please connect to the device first')
    return
  }
  try {
    localValues.value[parameter] = value
    loadingStates.value[parameter] = true
    await writeParameter(parameter, value ? 1 : 0, false)
    addOperationHistory(`${parameter} set to ${value ? 'ON' : 'OFF'}`, true)
    ElMessage.success(t.value.deviceControl.writeSuccess)
  } catch (e) {
    delete localValues.value[parameter]
    const err = e as Error
    addOperationHistory(`${parameter} write failed: ${err.message}`, false)
    ElMessage.error(`${t.value.deviceControl.writeFailed}: ${err.message}`)
  } finally {
    loadingStates.value[parameter] = false
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
    timestamp: new Date().toLocaleString('en-US'),
    message,
    success,
  })
  if (operationHistory.value.length > 20) {
    operationHistory.value = operationHistory.value.slice(0, 20)
  }
}

watch(
  () => inverterParams.value.currentHz,
  (newHz) => {
    if (typeof newHz === 'number' && newHz > 0 && !loadingStates.value['RW_HZ']) {
      inverterForm.value.hz = newHz
    }
  },
  { immediate: true },
)

watch(
  () => currentDeviceData.value,
  (newData) => {
    if (!newData) return
    Object.keys(newData).forEach((k) => {
      if (k.startsWith('DOut') && !(k in localValues.value)) {
        // localValues.value[k] = Boolean(newData[k]?.value)
      }
    })
  },
  { deep: true },
)

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

  .inverter-section {
    background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
    padding: 16px;
    border-radius: 8px;
    border: 2px solid #667eea;
  }

  .inverter-controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .inverter-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: var(--el-fill-color-blank);
    border-radius: 4px;
    border: 1px solid var(--el-border-color);

    .inverter-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 120px;

      span:first-child {
        font-weight: 600;
        color: var(--el-text-color-primary);
      }

      .current-value {
        font-size: 14px;
        color: var(--el-text-color-secondary);
      }
    }

    .inverter-input-group,
    .inverter-button-group {
      display: flex;
      gap: 12px;
      align-items: center;
    }
  }

  .inverter-monitor {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    padding: 12px;
    background: var(--el-fill-color-light);
    border-radius: 4px;

    .monitor-item {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .monitor-label {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      .monitor-value {
        font-size: 18px;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }
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
