/**
 * Unit tests for configDeviceStore
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConfigDeviceStore } from '@/stores/configDevice'

// Mock the useApi composable
vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    getConfigDevices: vi.fn().mockResolvedValue([
      { model: 'teco_inverter', slave_id: 1, type: 'inverter' },
      { model: 'jy_dam0816d', slave_id: 2 },
    ]),
    getDevicePins: vi.fn().mockResolvedValue({
      readable: [{ name: 'AI_1', readable: true, writable: false }],
      writable: [{ name: 'DO_1', readable: false, writable: true }],
    }),
    validateControlYaml: vi.fn(),
    validateAlertYaml: vi.fn(),
    generateControlYaml: vi.fn(),
    generateAlertYaml: vi.fn(),
    generateDiagram: vi.fn(),
  }),
}))

describe('configDeviceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should start with empty devices', () => {
    const store = useConfigDeviceStore()
    expect(store.devices).toEqual([])
    expect(store.hasDevices).toBe(false)
  })

  it('should load devices from API', async () => {
    const store = useConfigDeviceStore()
    await store.loadDevices()
    expect(store.devices).toHaveLength(2)
    expect(store.hasDevices).toBe(true)
    expect(store.initialized).toBe(true)
  })

  it('should not reload devices if already initialized', async () => {
    const store = useConfigDeviceStore()
    await store.loadDevices()
    const firstDevices = [...store.devices]

    // Should use cached result, not re-call API
    await store.loadDevices()
    expect(store.devices).toEqual(firstDevices)
  })

  it('should reload devices on reloadDevices()', async () => {
    const store = useConfigDeviceStore()
    await store.loadDevices()
    await store.reloadDevices()
    expect(store.devices).toHaveLength(2)
  })

  it('should add a device', () => {
    const store = useConfigDeviceStore()
    store.addDevice({ model: 'test_device', slave_id: 5, type: 'relay' })
    expect(store.devices).toHaveLength(1)
    expect(store.devices[0].model).toBe('test_device')
    expect(store.hasDevices).toBe(true)
  })

  it('should not add duplicate device', () => {
    const store = useConfigDeviceStore()
    store.addDevice({ model: 'test_device', slave_id: 5 })
    store.addDevice({ model: 'test_device', slave_id: 5 })
    expect(store.devices).toHaveLength(1)
  })

  it('should remove a device', () => {
    const store = useConfigDeviceStore()
    store.addDevice({ model: 'test_device', slave_id: 5 })
    store.removeDevice('test_device', 5)
    expect(store.devices).toHaveLength(0)
    expect(store.hasDevices).toBe(false)
  })

  it('should remove only the targeted device', () => {
    const store = useConfigDeviceStore()
    store.addDevice({ model: 'device_a', slave_id: 1 })
    store.addDevice({ model: 'device_b', slave_id: 2 })
    store.removeDevice('device_a', 1)
    expect(store.devices).toHaveLength(1)
    expect(store.devices[0].model).toBe('device_b')
  })

  it('should cache and return pins for a model', async () => {
    const store = useConfigDeviceStore()
    const pins = await store.getPins('teco_inverter')
    expect(pins.readable).toHaveLength(1)
    expect(pins.writable).toHaveLength(1)

    // Second call should use cache (same data structure)
    const cachedPins = await store.getPins('teco_inverter')
    expect(cachedPins).toStrictEqual(pins)
  })

  it('should reset state on $reset()', async () => {
    const store = useConfigDeviceStore()
    await store.loadDevices()
    store.$reset()

    expect(store.devices).toEqual([])
    expect(store.hasDevices).toBe(false)
    expect(store.initialized).toBe(false)
    expect(store.pinsCache).toEqual({})
  })

  it('hasDevices should be false when all devices removed', () => {
    const store = useConfigDeviceStore()
    store.addDevice({ model: 'device_a', slave_id: 1 })
    expect(store.hasDevices).toBe(true)
    store.removeDevice('device_a', 1)
    expect(store.hasDevices).toBe(false)
  })
})
