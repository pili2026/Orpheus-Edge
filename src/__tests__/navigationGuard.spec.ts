/**
 * Unit tests for navigation guard (requiresDevices)
 * Tests the redirect behavior when accessing Control/Alert pages without devices
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// We test the guard logic directly without mounting the full router
// by simulating the beforeEach handler

vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    getConfigDevices: vi.fn().mockResolvedValue([]),
    getDevicePins: vi.fn(),
    validateControlYaml: vi.fn(),
    validateAlertYaml: vi.fn(),
    generateControlYaml: vi.fn(),
    generateAlertYaml: vi.fn(),
    generateDiagram: vi.fn(),
  }),
}))

/** Simulates the navigation guard logic */
async function runGuard(
  requiresDevices: boolean,
  hasDevices: boolean,
  toPath: string,
): Promise<{ redirected: boolean; redirectName?: string; redirectQuery?: Record<string, string> }> {
  const mockNext = vi.fn()

  if (!requiresDevices) {
    mockNext()
    return { redirected: false }
  }

  const { useConfigDeviceStore } = await import('@/stores/configDevice')
  const store = useConfigDeviceStore()

  if (hasDevices) {
    store.addDevice({ model: 'test_device', slave_id: 1 })
  }

  if (!store.hasDevices) {
    mockNext({ name: 'config-device', query: { redirect: toPath, reason: 'no-devices' } })
    return {
      redirected: true,
      redirectName: 'config-device',
      redirectQuery: { redirect: toPath, reason: 'no-devices' },
    }
  }

  mockNext()
  return { redirected: false }
}

describe('Navigation Guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should allow access to routes without requiresDevices', async () => {
    const result = await runGuard(false, false, '/config/modbus')
    expect(result.redirected).toBe(false)
  })

  it('should redirect to config-device when no devices configured', async () => {
    const result = await runGuard(true, false, '/config/control')
    expect(result.redirected).toBe(true)
    expect(result.redirectName).toBe('config-device')
    expect(result.redirectQuery?.reason).toBe('no-devices')
    expect(result.redirectQuery?.redirect).toBe('/config/control')
  })

  it('should allow access when devices are configured', async () => {
    const result = await runGuard(true, true, '/config/control')
    expect(result.redirected).toBe(false)
  })

  it('should redirect alert page when no devices', async () => {
    const result = await runGuard(true, false, '/config/alert')
    expect(result.redirected).toBe(true)
    expect(result.redirectQuery?.redirect).toBe('/config/alert')
  })

  it('should include original path in redirect query', async () => {
    const originalPath = '/config/control'
    const result = await runGuard(true, false, originalPath)
    expect(result.redirectQuery?.redirect).toBe(originalPath)
  })
})
