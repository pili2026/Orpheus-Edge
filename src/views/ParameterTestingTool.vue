<template>
  <div class="parameter-tool">
    <!-- Header Card -->
    <el-card class="header-card" shadow="never">
      <div class="header-content">
        <div class="title-section">
          <h2>{{ t.parameterTool.title }}</h2>
          <el-tag type="info" size="small">{{ t.parameterTool.subtitle }}</el-tag>
        </div>
        <el-button
          :icon="Refresh"
          circle
          @click="loadDevices"
          :loading="loadingDevices"
          :title="t.parameterTool.refresh"
        />
      </div>
    </el-card>

    <!-- Device Selection Card -->
    <el-card class="device-selection" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>{{ t.parameterTool.deviceSelection }}</span>
          <el-tag v-if="selectedDevice" type="success" size="small">
            {{ selectedDevice.device_id }}
          </el-tag>
        </div>
      </template>

      <el-select
        v-model="selectedDeviceId"
        :placeholder="t.parameterTool.selectDevice"
        size="large"
        filterable
        @change="onDeviceChange"
        style="width: 100%"
      >
        <el-option
          v-for="device in devices"
          :key="device.device_id"
          :label="`${device.device_id} - ${device.model || 'Unknown'}`"
          :value="device.device_id"
        />
      </el-select>

      <!-- Simple info alert -->
      <el-alert v-if="selectedDeviceId" type="info" :closable="false" style="margin-top: 12px">
        <template #title>
          <div style="font-size: 13px">💡 This tool uses RESTful API for parameter operations</div>
        </template>
      </el-alert>
    </el-card>

    <!-- Parameter Operations Section -->
    <div v-if="selectedDeviceId" class="operations-section">
      <!-- Read Single Parameter Card -->
      <el-card class="operation-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Document /></el-icon>
            <span>{{ t.parameterTool.readSingle }}</span>
          </div>
        </template>

        <div class="operation-form">
          <el-select
            v-model="singleParameter"
            :placeholder="t.parameterTool.selectParameter"
            filterable
            allow-create
            style="width: 100%"
          >
            <el-option
              v-for="param in availableParameters"
              :key="param.name"
              :label="param.name"
              :value="param.name"
            />
          </el-select>

          <el-button
            type="primary"
            :loading="loadingSingle"
            @click="readSingleParameter"
            :disabled="!singleParameter"
            style="width: 100%"
          >
            {{ t.parameterTool.read }}
          </el-button>

          <!-- Single Read Result -->
          <div v-if="singleResult" class="result-box">
            <el-alert
              :type="singleResult.parameter.is_valid ? 'success' : 'error'"
              :closable="false"
              show-icon
            >
              <template #title>
                <div class="result-title">
                  <span class="param-name">{{ singleResult.parameter.name }}</span>
                  <span class="param-value">
                    <template v-if="singleResult.parameter.is_valid">
                      <template v-if="singleResult.parameter.value === -1">
                        <el-tag type="warning" size="small">N/A</el-tag>
                      </template>
                      <template v-else>
                        {{ singleResult.parameter.value }}
                        <span v-if="singleResult.parameter.unit" class="unit">
                          {{ singleResult.parameter.unit }}
                        </span>
                      </template>
                    </template>
                    <template v-else>
                      <el-tag type="danger" size="small">Failed</el-tag>
                    </template>
                  </span>
                </div>
              </template>
              <div v-if="!singleResult.parameter.is_valid" class="error-message">
                {{ singleResult.parameter.error_message || singleResult.message }}
              </div>
            </el-alert>
          </div>
        </div>
      </el-card>

      <!-- Read Multiple Parameters Card -->
      <el-card class="operation-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><List /></el-icon>
            <span>{{ t.parameterTool.readMultiple }}</span>
          </div>
        </template>

        <div class="operation-form">
          <el-select
            v-model="multipleParameters"
            :placeholder="t.parameterTool.selectParameters"
            filterable
            multiple
            allow-create
            collapse-tags
            collapse-tags-tooltip
            style="width: 100%"
          >
            <el-option
              v-for="param in availableParameters"
              :key="param.name"
              :label="param.name"
              :value="param.name"
            />
          </el-select>

          <el-button
            type="primary"
            :loading="loadingMultiple"
            @click="readMultipleParameters"
            :disabled="multipleParameters.length === 0"
            style="width: 100%"
          >
            {{ t.parameterTool.read }} ({{ multipleParameters.length }})
          </el-button>

          <!-- Multiple Read Results -->
          <div v-if="multipleResult" class="result-box">
            <el-alert :type="getMultipleResultType(multipleResult)" :closable="false" show-icon>
              <template #title>
                {{ t.parameterTool.readResults }}: {{ multipleResult.success_count }} /
                {{ multipleResult.parameters.length }}
              </template>
            </el-alert>

            <div class="parameter-list">
              <div
                v-for="param in multipleResult.parameters"
                :key="param.name"
                class="parameter-item"
                :class="{ 'parameter-error': !param.is_valid }"
              >
                <div class="param-header">
                  <span class="param-name">{{ param.name }}</span>
                  <el-tag :type="param.is_valid ? 'success' : 'danger'" size="small">
                    {{ param.is_valid ? '✓' : '✗' }}
                  </el-tag>
                </div>
                <div class="param-body">
                  <template v-if="param.is_valid">
                    <span v-if="param.value === -1" class="param-value">
                      <el-tag type="warning" size="small">N/A</el-tag>
                    </span>
                    <span v-else class="param-value">
                      {{ param.value }}
                      <span v-if="param.unit" class="unit">{{ param.unit }}</span>
                    </span>
                  </template>
                  <span v-else class="error-text">{{ param.error_message }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-card>

      <!-- Write Parameter Card -->
      <el-card class="operation-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Edit /></el-icon>
            <span>{{ t.parameterTool.write }}</span>
          </div>
        </template>

        <div class="operation-form">
          <el-select
            v-model="writeParameter"
            :placeholder="t.parameterTool.selectParameter"
            filterable
            allow-create
            style="width: 100%"
          >
            <el-option
              v-for="param in availableParameters"
              :key="param.name"
              :label="param.name"
              :value="param.name"
            />
          </el-select>

          <el-input-number
            v-model="writeValue"
            :placeholder="t.parameterTool.enterValue"
            :controls="true"
            :precision="2"
            style="width: 100%"
          />

          <div class="write-options">
            <el-checkbox v-model="writeForce">
              {{ t.parameterTool.forceWrite }}
            </el-checkbox>
            <el-tooltip :content="t.parameterTool.forceWriteTooltip" placement="top">
              <el-icon class="info-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>

          <el-button
            type="danger"
            :loading="loadingWrite"
            @click="writeParameterValue"
            :disabled="!writeParameter || writeValue === null"
            style="width: 100%"
          >
            {{ t.parameterTool.write }}
          </el-button>

          <!-- Write Result -->
          <div v-if="writeResult" class="result-box">
            <el-alert type="success" :closable="false" show-icon>
              <template #title>
                {{ t.parameterTool.writeSuccess }}
              </template>
              <div class="write-details">
                <div class="detail-row">
                  <span class="label">{{ t.parameterTool.parameter }}:</span>
                  <span class="value">{{ writeResult.parameter }}</span>
                </div>
                <div class="detail-row">
                  <span class="label">{{ t.parameterTool.previousValue }}:</span>
                  <span class="value">{{ writeResult.previous_value ?? 'N/A' }}</span>
                </div>
                <div class="detail-row">
                  <span class="label">{{ t.parameterTool.newValue }}:</span>
                  <span class="value">{{ writeResult.new_value }}</span>
                </div>
                <div v-if="writeResult.was_forced" class="detail-row">
                  <el-tag type="warning" size="small">
                    {{ t.parameterTool.forcedWrite }}
                  </el-tag>
                </div>
              </div>
            </el-alert>
          </div>
        </div>
      </el-card>
    </div>

    <!-- Empty State -->
    <el-empty
      v-if="!selectedDeviceId"
      :description="t.parameterTool.selectDeviceFirst"
      :image-size="150"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { Refresh, Document, List, Edit, QuestionFilled } from '@element-plus/icons-vue'
import { useDeviceStore } from '@/stores/device'
import { useUIStore } from '@/stores/ui'
import { parameterService } from '@/services/parameter'
import type {
  ReadParameterResponse,
  ReadMultipleParametersResponse,
  WriteParameterResponse,
} from '@/types/parameter'
import type { ParameterInfo } from '@/types'

const uiStore = useUIStore()
const { t } = storeToRefs(uiStore)
const deviceStore = useDeviceStore()

const loadingDevices = ref(false)
const selectedDeviceId = ref<string | null>(null)
const availableParameters = ref<ParameterInfo[]>([])

const devices = computed(() => deviceStore.devices)
const selectedDevice = computed(() => deviceStore.selectedDevice)

const singleParameter = ref<string>('')
const loadingSingle = ref(false)
const singleResult = ref<ReadParameterResponse | null>(null)

const multipleParameters = ref<string[]>([])
const loadingMultiple = ref(false)
const multipleResult = ref<ReadMultipleParametersResponse | null>(null)

const writeParameter = ref<string>('')
const writeValue = ref<number | null>(null)
const writeForce = ref(false)
const loadingWrite = ref(false)
const writeResult = ref<WriteParameterResponse | null>(null)

async function loadDevices() {
  loadingDevices.value = true
  try {
    await deviceStore.loadAllDevices()
    ElMessage.success(t.value.parameterTool.devicesLoaded)
  } catch (error) {
    ElMessage.error(t.value.parameterTool.loadDevicesFailed)
    console.error('[Parameter Tool] Failed to load devices:', error)
  } finally {
    loadingDevices.value = false
  }
}

async function onDeviceChange(deviceId: string) {
  try {
    await deviceStore.loadDeviceDetails(deviceId)
    await deviceStore.selectDevice(deviceId)
    availableParameters.value = deviceStore.getDeviceParameters(deviceId)

    singleResult.value = null
    multipleResult.value = null
    writeResult.value = null
    singleParameter.value = ''
    multipleParameters.value = []
    writeParameter.value = ''
    writeValue.value = null

    const message = t.value.parameterTool.deviceSelected.replace('{device}', deviceId)
    ElMessage.success(message)
  } catch (error) {
    ElMessage.error(t.value.parameterTool.loadDeviceDetailsFailed)
    console.error('[Parameter Tool] Failed to load device details:', error)
  }
}

async function readSingleParameter() {
  if (!selectedDeviceId.value || !singleParameter.value) return

  loadingSingle.value = true
  singleResult.value = null

  try {
    const result = await parameterService.readSingleParameter(
      selectedDeviceId.value,
      singleParameter.value,
    )
    singleResult.value = result

    if (result.parameter.is_valid && result.parameter.value !== -1) {
      ElMessage.success(t.value.parameterTool.readSuccess)
    }
  } catch (error: any) {
    ElMessage.error(error.message || t.value.parameterTool.readError)
    console.error('[Parameter Tool] Failed to read parameter:', error)
  } finally {
    loadingSingle.value = false
  }
}

async function readMultipleParameters() {
  if (!selectedDeviceId.value || multipleParameters.value.length === 0) return

  loadingMultiple.value = true
  multipleResult.value = null

  try {
    const result = await parameterService.readMultipleParameters(
      selectedDeviceId.value,
      multipleParameters.value,
    )
    multipleResult.value = result

    if (result.status === 'success') {
      ElMessage.success(t.value.parameterTool.readSuccess)
    } else if (result.status === 'partial_success') {
      const message = t.value.parameterTool.partialSuccess
        .replace('{success}', result.success_count.toString())
        .replace('{total}', result.parameters.length.toString())
      ElMessage.warning(message)
    } else {
      ElMessage.error(t.value.parameterTool.readFailed)
    }
  } catch (error: any) {
    ElMessage.error(error.message || t.value.parameterTool.readError)
    console.error('[Parameter Tool] Failed to read parameters:', error)
  } finally {
    loadingMultiple.value = false
  }
}

async function writeParameterValue() {
  if (!selectedDeviceId.value || !writeParameter.value || writeValue.value === null) return

  loadingWrite.value = true
  writeResult.value = null

  try {
    const result = await parameterService.writeParameter(
      selectedDeviceId.value,
      writeParameter.value,
      writeValue.value,
      writeForce.value,
    )
    writeResult.value = result
    ElMessage.success(t.value.parameterTool.writeSuccess)
  } catch (error: any) {
    ElMessage.error(error.message || t.value.parameterTool.writeError)
    console.error('[Parameter Tool] Failed to write parameter:', error)
  } finally {
    loadingWrite.value = false
  }
}

function getMultipleResultType(result: ReadMultipleParametersResponse): string {
  if (result.status === 'success') return 'success'
  if (result.status === 'partial_success') return 'warning'
  return 'error'
}

onMounted(() => {
  loadDevices()
})
</script>

<style scoped lang="scss">
.parameter-tool {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;

  .header-card {
    margin-bottom: 20px;

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .title-section {
        display: flex;
        flex-direction: column;
        gap: 8px;

        h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
      }
    }
  }

  .device-selection {
    margin-bottom: 20px;

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
    }
  }

  .operations-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 20px;

    .operation-card {
      .card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
      }

      .operation-form {
        display: flex;
        flex-direction: column;
        gap: 16px;

        .write-options {
          display: flex;
          align-items: center;
          gap: 8px;

          .info-icon {
            color: var(--el-color-info);
            cursor: help;
          }
        }

        .result-box {
          margin-top: 8px;

          .result-title {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 600;

            .param-name {
              font-family: monospace;
            }

            .param-value {
              font-size: 18px;
              font-weight: bold;

              .unit {
                font-size: 14px;
                color: var(--el-text-color-secondary);
                margin-left: 4px;
              }
            }
          }

          .error-message {
            margin-top: 8px;
            color: var(--el-color-danger);
            font-size: 14px;
          }

          .parameter-list {
            margin-top: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;

            .parameter-item {
              padding: 12px;
              border: 1px solid var(--el-border-color);
              border-radius: 4px;
              background-color: var(--el-fill-color-light);

              &.parameter-error {
                border-color: var(--el-color-danger-light-5);
                background-color: var(--el-color-danger-light-9);
              }

              .param-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;

                .param-name {
                  font-weight: 600;
                  font-family: monospace;
                }
              }

              .param-body {
                .param-value {
                  font-size: 16px;
                  font-weight: 500;

                  .unit {
                    font-size: 12px;
                    color: var(--el-text-color-secondary);
                    margin-left: 4px;
                  }
                }

                .error-text {
                  color: var(--el-color-danger);
                  font-size: 14px;
                }
              }
            }
          }

          .write-details {
            margin-top: 12px;

            .detail-row {
              display: flex;
              justify-content: space-between;
              padding: 4px 0;

              .label {
                font-weight: 600;
                color: var(--el-text-color-secondary);
              }

              .value {
                font-family: monospace;
                font-weight: 500;
              }
            }
          }
        }
      }
    }
  }
}

@media (max-width: 768px) {
  .parameter-tool {
    padding: 12px;

    .operations-section {
      grid-template-columns: 1fr;
    }
  }
}
</style>
