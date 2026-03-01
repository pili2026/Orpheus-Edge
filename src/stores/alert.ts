/**
 * Alert Store
 * Manages alert rule form state for the Alert Config page
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '@/composables/useApi'
import type {
  AlertRule,
  GenerateAlertPayload,
  ValidateResponse,
  GenerateYamlResponse,
} from '@/types/config-builder'

function makeId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function makeDefaultRule(): AlertRule {
  return {
    id: makeId(),
    code: '',
    name: '',
    device_name: '',
    device_model: '',
    device_slave_id: 0,
    sources: [],
    type: 'threshold',
    condition: 'gt',
    threshold: null,
    severity: 'WARNING',
    message: '',
  }
}

export const useAlertStore = defineStore('alert', () => {
  const api = useApi()

  // ===== State =====
  const selectedDeviceModel = ref<string>('')
  const selectedDeviceSlaveId = ref<number>(0)
  const rules = ref<AlertRule[]>([makeDefaultRule()])
  const generatedYaml = ref<string>('')
  const validationResult = ref<ValidateResponse | null>(null)
  const diagramMermaid = ref<string>('')
  const yamlLoading = ref(false)
  const diagramLoading = ref(false)

  // ===== Actions =====

  function selectDevice(model: string, slaveId: number): void {
    selectedDeviceModel.value = model
    selectedDeviceSlaveId.value = slaveId
    // Update device info on each rule
    rules.value.forEach((r) => {
      r.device_model = model
      r.device_slave_id = slaveId
      r.sources = []
    })
  }

  function addRule(): void {
    const rule = makeDefaultRule()
    rule.device_model = selectedDeviceModel.value
    rule.device_slave_id = selectedDeviceSlaveId.value
    rules.value.push(rule)
  }

  function removeRule(id: string): void {
    rules.value = rules.value.filter((r) => r.id !== id)
  }

  function buildPayload(): GenerateAlertPayload {
    return {
      device_model: selectedDeviceModel.value,
      device_slave_id: selectedDeviceSlaveId.value,
      rules: rules.value,
    }
  }

  async function generateYaml(): Promise<GenerateYamlResponse> {
    yamlLoading.value = true
    try {
      const result = await api.generateAlertYaml(buildPayload())
      generatedYaml.value = result.yaml
      return result
    } finally {
      yamlLoading.value = false
    }
  }

  async function validateYaml(): Promise<ValidateResponse> {
    const result = await api.validateAlertYaml(generatedYaml.value)
    validationResult.value = result
    return result
  }

  async function generateDiagram(): Promise<void> {
    if (!generatedYaml.value) return
    diagramLoading.value = true
    try {
      const result = await api.generateDiagram(generatedYaml.value)
      diagramMermaid.value = result.mermaid
    } finally {
      diagramLoading.value = false
    }
  }

  function $reset(): void {
    selectedDeviceModel.value = ''
    selectedDeviceSlaveId.value = 0
    rules.value = [makeDefaultRule()]
    generatedYaml.value = ''
    validationResult.value = null
    diagramMermaid.value = ''
    yamlLoading.value = false
    diagramLoading.value = false
  }

  return {
    // State
    selectedDeviceModel,
    selectedDeviceSlaveId,
    rules,
    generatedYaml,
    validationResult,
    diagramMermaid,
    yamlLoading,
    diagramLoading,
    // Actions
    selectDevice,
    addRule,
    removeRule,
    buildPayload,
    generateYaml,
    validateYaml,
    generateDiagram,
    $reset,
    // expose helpers for tests
    _makeDefaultRule: makeDefaultRule,
  }
})
