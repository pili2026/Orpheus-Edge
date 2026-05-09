import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
const getMqttStatus = vi.fn(async () => ({ registered: true, connected: true }))
const getMqttConfig = vi.fn(async () => ({ enabled: true, broker: { host: 'h', port: 1883, tls: { enabled: false, ca_cert_path: '', insecure_skip_verify: false } }, credentials: { password_configured: true, registered: true, username: 'u', gateway_id: 'g1' }, client: { client_id: 'id', clean_session: true, keepalive_sec: 30 }, reconnect: {}, qos: {}, topics: { base_prefix: 'x' }, outbox: {}, status: {}, event: { enabled: true }, telemetry: { enabled: false } }))
const registerMqttGateway = vi.fn(async () => ({ success: true, message: 'ok' }))
const testOrionConnection = vi.fn(async () => ({ reachable: true, message: 'ok', latency_ms: 12 }))
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
  beforeEach(() => setActivePinia(createPinia()))

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

  it('registers and refreshes; refresh failure is non-fatal', async () => {
    const store = useMqttStore()
    getMqttStatus.mockRejectedValueOnce(new Error('status unavailable'))
    await store.registerGateway()
    expect(registerMqttGateway).toHaveBeenCalled()
    expect(store.registrationSuccess).toBeTruthy()
  })
})
