/**
 * Control Store
 * Manages control rule form state for the Control Config page
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '@/composables/useApi'
import type {
  ControlRule,
  ControlSource,
  ControlAction,
  ControlCondition,
  ControlPolicy,
  GenerateControlPayload,
  ValidateResponse,
  GenerateYamlResponse,
} from '@/types/config-builder'

function makeId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function makeDefaultSource(): ControlSource {
  return {
    id: makeId(),
    device_model: '',
    device_slave_id: 0,
    pin: '',
    operator: 'gt',
    threshold: null,
    hysteresis: null,
    debounce_sec: null,
  }
}

function makeDefaultAction(): ControlAction {
  return {
    id: makeId(),
    device_model: '',
    device_slave_id: 0,
    type: 'write_do',
    target_pin: '',
    value: null,
    emergency_override: false,
  }
}

function makeDefaultRule(): ControlRule {
  return {
    id: makeId(),
    name: '',
    code: '',
    priority: null,
    blocking: false,
    condition: {
      mode: 'all',
      sources: [makeDefaultSource()],
    } as ControlCondition,
    policy: { type: 'discrete_setpoint' } as ControlPolicy,
    actions: [makeDefaultAction()],
  }
}

export const useControlStore = defineStore('control', () => {
  const api = useApi()

  // ===== State =====
  const selectedDeviceModel = ref<string>('')
  const selectedDeviceSlaveId = ref<number>(0)
  const rules = ref<ControlRule[]>([makeDefaultRule()])
  const generatedYaml = ref<string>('')
  const validationResult = ref<ValidateResponse | null>(null)
  const diagramMermaid = ref<string>('')
  const yamlLoading = ref(false)
  const diagramLoading = ref(false)

  // ===== Actions =====

  function selectDevice(model: string, slaveId: number): void {
    selectedDeviceModel.value = model
    selectedDeviceSlaveId.value = slaveId
  }

  function addRule(): void {
    rules.value.push(makeDefaultRule())
  }

  function removeRule(id: string): void {
    rules.value = rules.value.filter((r) => r.id !== id)
  }

  function addSource(ruleId: string): void {
    const rule = rules.value.find((r) => r.id === ruleId)
    if (rule) rule.condition.sources.push(makeDefaultSource())
  }

  function removeSource(ruleId: string, sourceId: string): void {
    const rule = rules.value.find((r) => r.id === ruleId)
    if (rule) {
      rule.condition.sources = rule.condition.sources.filter((s) => s.id !== sourceId)
    }
  }

  function addAction(ruleId: string): void {
    const rule = rules.value.find((r) => r.id === ruleId)
    if (rule) rule.actions.push(makeDefaultAction())
  }

  function removeAction(ruleId: string, actionId: string): void {
    const rule = rules.value.find((r) => r.id === ruleId)
    if (rule) {
      rule.actions = rule.actions.filter((a) => a.id !== actionId)
    }
  }

  function buildPayload(): GenerateControlPayload {
    return {
      device_model: selectedDeviceModel.value,
      device_slave_id: selectedDeviceSlaveId.value,
      rules: rules.value,
    }
  }

  async function generateYaml(): Promise<GenerateYamlResponse> {
    yamlLoading.value = true
    try {
      const result = await api.generateControlYaml(buildPayload())
      generatedYaml.value = result.yaml
      return result
    } finally {
      yamlLoading.value = false
    }
  }

  async function validateYaml(): Promise<ValidateResponse> {
    const result = await api.validateControlYaml(generatedYaml.value)
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
    addSource,
    removeSource,
    addAction,
    removeAction,
    buildPayload,
    generateYaml,
    validateYaml,
    generateDiagram,
    $reset,
    // expose helpers for tests
    _makeDefaultRule: makeDefaultRule,
    _makeDefaultSource: makeDefaultSource,
    _makeDefaultAction: makeDefaultAction,
  }
})
