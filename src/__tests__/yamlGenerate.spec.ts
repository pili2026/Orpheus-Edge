/**
 * Unit tests for YAML generate form data transformation logic
 * Tests that controlStore.buildPayload() and alertStore.buildPayload()
 * correctly transform form data into the expected API payload structure
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    getConfigDevices: vi.fn().mockResolvedValue([]),
    getDevicePins: vi.fn(),
    validateControlYaml: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    validateAlertYaml: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    generateControlYaml: vi.fn().mockResolvedValue({ yaml: 'control_yaml: {}' }),
    generateAlertYaml: vi.fn().mockResolvedValue({ yaml: 'alert_yaml: {}' }),
    generateDiagram: vi.fn().mockResolvedValue({ mermaid: 'graph TD;' }),
  }),
}))

describe('controlStore - buildPayload', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should build payload with selected device', async () => {
    const { useControlStore } = await import('@/stores/control')
    const store = useControlStore()

    store.selectDevice('teco_inverter', 3)
    const payload = store.buildPayload()

    expect(payload.device_model).toBe('teco_inverter')
    expect(payload.device_slave_id).toBe(3)
  })

  it('should include all rules in payload', async () => {
    const { useControlStore } = await import('@/stores/control')
    const store = useControlStore()

    store.selectDevice('teco_inverter', 1)
    store.addRule()
    const payload = store.buildPayload()

    expect(payload.rules).toHaveLength(2) // 1 default + 1 added
  })

  it('should add and remove rules correctly', async () => {
    const { useControlStore } = await import('@/stores/control')
    const store = useControlStore()

    const initialCount = store.rules.length
    store.addRule()
    expect(store.rules).toHaveLength(initialCount + 1)

    const lastRuleId = store.rules[store.rules.length - 1].id
    store.removeRule(lastRuleId)
    expect(store.rules).toHaveLength(initialCount)
  })

  it('should add and remove sources within a rule', async () => {
    const { useControlStore } = await import('@/stores/control')
    const store = useControlStore()

    const ruleId = store.rules[0].id
    const initialSourceCount = store.rules[0].condition.sources.length

    store.addSource(ruleId)
    expect(store.rules[0].condition.sources).toHaveLength(initialSourceCount + 1)

    const lastSourceId = store.rules[0].condition.sources[store.rules[0].condition.sources.length - 1].id
    store.removeSource(ruleId, lastSourceId)
    expect(store.rules[0].condition.sources).toHaveLength(initialSourceCount)
  })

  it('should add and remove actions within a rule', async () => {
    const { useControlStore } = await import('@/stores/control')
    const store = useControlStore()

    const ruleId = store.rules[0].id
    const initialActionCount = store.rules[0].actions.length

    store.addAction(ruleId)
    expect(store.rules[0].actions).toHaveLength(initialActionCount + 1)

    const lastActionId = store.rules[0].actions[store.rules[0].actions.length - 1].id
    store.removeAction(ruleId, lastActionId)
    expect(store.rules[0].actions).toHaveLength(initialActionCount)
  })

  it('should call generateControlYaml API and store result', async () => {
    const { useControlStore } = await import('@/stores/control')
    const store = useControlStore()

    store.selectDevice('teco_inverter', 1)
    await store.generateYaml()

    expect(store.generatedYaml).toBe('control_yaml: {}')
  })

  it('should call validateControlYaml API and store result', async () => {
    const { useControlStore } = await import('@/stores/control')
    const store = useControlStore()

    store.selectDevice('teco_inverter', 1)
    await store.generateYaml()
    await store.validateYaml()

    expect(store.validationResult).not.toBeNull()
    expect(store.validationResult?.valid).toBe(true)
    expect(store.validationResult?.errors).toHaveLength(0)
  })

  it('should reset state on $reset()', async () => {
    const { useControlStore } = await import('@/stores/control')
    const store = useControlStore()

    store.selectDevice('teco_inverter', 1)
    store.addRule()
    store.$reset()

    expect(store.selectedDeviceModel).toBe('')
    expect(store.selectedDeviceSlaveId).toBe(0)
    expect(store.rules).toHaveLength(1)
    expect(store.generatedYaml).toBe('')
    expect(store.validationResult).toBeNull()
  })

  it('default rule should have correct structure', async () => {
    const { useControlStore } = await import('@/stores/control')
    const store = useControlStore()

    const rule = store.rules[0]
    expect(rule).toHaveProperty('id')
    expect(rule).toHaveProperty('name')
    expect(rule).toHaveProperty('code')
    expect(rule).toHaveProperty('priority')
    expect(rule).toHaveProperty('blocking')
    expect(rule.condition.mode).toBe('all')
    expect(rule.condition.sources).toHaveLength(1)
    expect(rule.policy.type).toBe('discrete_setpoint')
    expect(rule.actions).toHaveLength(1)
  })
})

describe('alertStore - buildPayload', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should build payload with selected device', async () => {
    const { useAlertStore } = await import('@/stores/alert')
    const store = useAlertStore()

    store.selectDevice('jy_dam0816d', 2)
    const payload = store.buildPayload()

    expect(payload.device_model).toBe('jy_dam0816d')
    expect(payload.device_slave_id).toBe(2)
  })

  it('should update rules device info on selectDevice', async () => {
    const { useAlertStore } = await import('@/stores/alert')
    const store = useAlertStore()

    store.addRule()
    store.selectDevice('jy_dam0816d', 5)

    store.rules.forEach((rule) => {
      expect(rule.device_model).toBe('jy_dam0816d')
      expect(rule.device_slave_id).toBe(5)
      expect(rule.sources).toEqual([])
    })
  })

  it('should add and remove alert rules', async () => {
    const { useAlertStore } = await import('@/stores/alert')
    const store = useAlertStore()

    store.selectDevice('jy_dam0816d', 2)
    const initial = store.rules.length

    store.addRule()
    expect(store.rules).toHaveLength(initial + 1)

    const id = store.rules[store.rules.length - 1].id
    store.removeRule(id)
    expect(store.rules).toHaveLength(initial)
  })

  it('should call generateAlertYaml API and store result', async () => {
    const { useAlertStore } = await import('@/stores/alert')
    const store = useAlertStore()

    store.selectDevice('jy_dam0816d', 2)
    await store.generateYaml()

    expect(store.generatedYaml).toBe('alert_yaml: {}')
  })

  it('default alert rule should have correct structure', async () => {
    const { useAlertStore } = await import('@/stores/alert')
    const store = useAlertStore()

    const rule = store.rules[0]
    expect(rule).toHaveProperty('id')
    expect(rule).toHaveProperty('code')
    expect(rule).toHaveProperty('name')
    expect(rule).toHaveProperty('severity')
    expect(rule.type).toBe('threshold')
    expect(rule.severity).toBe('WARNING')
    expect(Array.isArray(rule.sources)).toBe(true)
  })

  it('should reset state on $reset()', async () => {
    const { useAlertStore } = await import('@/stores/alert')
    const store = useAlertStore()

    store.selectDevice('jy_dam0816d', 2)
    store.addRule()
    store.$reset()

    expect(store.selectedDeviceModel).toBe('')
    expect(store.selectedDeviceSlaveId).toBe(0)
    expect(store.rules).toHaveLength(1)
    expect(store.generatedYaml).toBe('')
  })
})
