import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
const getMqttStatus = vi.fn(async () => ({ registered: true, connected: true }))
const getMqttConfig = vi.fn(async () => ({ enabled: true, broker: { host: 'h', port: 1883, tls: { enabled: false, ca_cert_path: '', insecure_skip_verify: false } }, credentials: { password_configured: true, registered: true, username: 'u', gateway_id: 'g1' }, client: { client_id: 'id', clean_session: true, keepalive_sec: 30 }, reconnect: {}, qos: {}, topics: { base_prefix: 'x' }, outbox: {}, status: {}, event: { enabled: true }, telemetry: { enabled: false } }))
const registerMqttGateway = vi.fn(async () => ({ success: true, message: 'ok' }))
const testOrionConnection = vi.fn(async () => ({ ok: true, orion_reachable: true, message: 'ok', latency_ms: 12 }))
vi.mock('@/services/mqtt', () => ({
  getMqttConfig,
  getMqttStatus,
  patchMqttConfig: vi.fn(async (p: any) => p),
  restartMqttService: vi.fn(async () => ({})),
  registerMqttGateway,
  testOrionConnection,
}))

import { useMqttStore } from '@/stores/mqtt'

describe('mqtt store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('loads registration state and derives fields', async () => {
    const store = useMqttStore()
    await store.loadRegistrationState()
    expect(store.registrationState.registered).toBe(true)
    expect(store.registrationState.passwordConfigured).toBe(true)
  })

  it('tests orion success/failure', async () => {
    const store = useMqttStore()
    await store.testOrionConnection()
    expect(store.orionTestResult?.reachable).toBe(true)
    testOrionConnection.mockRejectedValueOnce(new Error('bad'))
    await expect(store.testOrionConnection()).rejects.toThrow('bad')
    expect(store.registrationError).toContain('Unable to test Orion')
  })

  it('keeps unreachable orion result without success state', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({ ok: false, orion_reachable: false, message: 'unreachable' })
    const result = await store.testOrionConnection()
    expect(result.reachable).toBe(false)
    expect(store.orionTestResult?.reachable).toBe(false)
    expect(store.registrationSuccess).toBeNull()
  })

  it('registers and refreshes; refresh failure is non-fatal', async () => {
    const store = useMqttStore()
    getMqttStatus.mockRejectedValueOnce(new Error('status unavailable'))
    await store.registerGateway()
    expect(registerMqttGateway).toHaveBeenCalled()
    expect(store.registrationSuccess).toBeTruthy()
  })

  it('handles application-level register failure from HTTP 200', async () => {
    const store = useMqttStore()
    registerMqttGateway.mockResolvedValueOnce({ success: false, message: 'failed' })
    const configCallCount = getMqttConfig.mock.calls.length
    const statusCallCount = getMqttStatus.mock.calls.length
    await expect(store.registerGateway()).rejects.toThrow('failed')
    expect(store.registrationSuccess).toBeNull()
    expect(store.registrationError).toBe('failed')
    expect(getMqttConfig.mock.calls.length).toBe(configCallCount)
    expect(getMqttStatus.mock.calls.length).toBe(statusCallCount)
  })

  it('handles register network failure', async () => {
    const store = useMqttStore()
    registerMqttGateway.mockRejectedValueOnce(new Error('network'))
    await expect(store.registerGateway()).rejects.toThrow('network')
    expect(store.registrationSuccess).toBeNull()
    expect(store.registrationError).toContain('Gateway registration failed')
  })
})
