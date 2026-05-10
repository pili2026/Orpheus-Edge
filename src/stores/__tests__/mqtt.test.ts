import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrionConnectionResult } from '@/services/mqtt'

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))
const getMqttStatus = vi.fn(async () => ({ registered: true, connected: true }))
const getMqttConfig = vi.fn(async () => ({
  enabled: true,
  broker: {
    host: 'h',
    port: 1883,
    tls: { enabled: false, ca_cert_path: '', insecure_skip_verify: false },
  },
  credentials: { password_configured: true, registered: true, username: 'u', gateway_id: 'g1' },
  client: { client_id: 'id', clean_session: true, keepalive_sec: 30 },
  reconnect: {},
  qos: {},
  topics: { base_prefix: 'x' },
  outbox: {},
  status: {},
  event: { enabled: true },
  telemetry: { enabled: false },
}))
const registerMqttGateway = vi.fn(async () => ({ success: true, message: 'ok' }))
const testOrionConnection = vi.fn<() => Promise<OrionConnectionResult>>(async () => ({
  ok: true,
  orion_reachable: true,
  message: 'ok',
  latency_ms: 12,
}))
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
    expect(store.orionTestResult?.ok).toBe(false)
    expect(store.orionTestResult?.orion_reachable).toBe(false)
    expect(store.orionTestResult?.reachable).toBe(false)
    expect(store.orionTestResult?.message).toContain('Unable to test Orion')
  })

  it('keeps unreachable orion result without success state', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({
      ok: false,
      orion_reachable: false,
      message: 'unreachable',
    })
    const result = await store.testOrionConnection()
    expect(result.reachable).toBe(false)
    expect(store.orionTestResult?.reachable).toBe(false)
    expect(store.registrationSuccess).toBeNull()
  })

  it('normalizes legacy success shape to new flags', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({ reachable: true, message: 'legacy ok' })
    const result = await store.testOrionConnection()
    expect(result.ok).toBe(true)
    expect(result.orion_reachable).toBe(true)
    expect(result.reachable).toBe(true)
    expect(result.message).toBe('legacy ok')
    expect(result.latency_ms).toBeNull()
  })

  it('normalizes legacy failure shape and fallback message', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({ reachable: false })
    const result = await store.testOrionConnection()
    expect(result.ok).toBe(false)
    expect(result.orion_reachable).toBe(false)
    expect(result.reachable).toBe(false)
    expect(result.message).toContain('Unable to test Orion')
    expect(result.latency_ms).toBeNull()
  })

  it('uses fallback message when new-shape failure has no message', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({ ok: true, orion_reachable: false })
    const result = await store.testOrionConnection()
    expect(result.reachable).toBe(false)
    expect(result.message).toContain('Unable to test Orion')
  })

  it('normalizes ok=false without orion_reachable as reachable=false', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({ ok: false })
    const result = await store.testOrionConnection()
    expect(result.ok).toBe(false)
    expect(result.orion_reachable).toBe(false)
    expect(result.reachable).toBe(false)
  })

  it('normalizes ok=false with nullable/true orion_reachable to false/false/false', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({ ok: false, orion_reachable: null })
    const nullFlagResult = await store.testOrionConnection()
    expect(nullFlagResult.ok).toBe(false)
    expect(nullFlagResult.orion_reachable).toBe(false)
    expect(nullFlagResult.reachable).toBe(false)

    testOrionConnection.mockResolvedValueOnce({ ok: false, orion_reachable: true })
    const trueFlagResult = await store.testOrionConnection()
    expect(trueFlagResult.ok).toBe(false)
    expect(trueFlagResult.orion_reachable).toBe(false)
    expect(trueFlagResult.reachable).toBe(false)
  })

  it('normalizes ok=true without orion_reachable as reachable=null', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({ ok: true })
    const result = await store.testOrionConnection()
    expect(result.ok).toBe(true)
    expect(result.orion_reachable).toBeNull()
    expect(result.reachable).toBeNull()
  })

  it('normalizes mixed shape ok=true with legacy reachable', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({ ok: true, reachable: true })
    const reachableTrueResult = await store.testOrionConnection()
    expect(reachableTrueResult.ok).toBe(true)
    expect(reachableTrueResult.orion_reachable).toBe(true)
    expect(reachableTrueResult.reachable).toBe(true)

    testOrionConnection.mockResolvedValueOnce({ ok: true, reachable: false })
    const reachableFalseResult = await store.testOrionConnection()
    expect(reachableFalseResult.ok).toBe(true)
    expect(reachableFalseResult.orion_reachable).toBe(false)
    expect(reachableFalseResult.reachable).toBe(false)
  })

  it('normalizes orion_reachable without ok', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({ orion_reachable: true })
    const successResult = await store.testOrionConnection()
    expect(successResult.reachable).toBe(true)

    testOrionConnection.mockResolvedValueOnce({ orion_reachable: false })
    const failureResult = await store.testOrionConnection()
    expect(failureResult.reachable).toBe(false)
  })

  it('normalizes empty payload as unknown', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({})
    const result = await store.testOrionConnection()
    expect(result.reachable).toBeNull()
  })

  it('preserves unknown reachability when legacy reachable is null', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({ reachable: null })
    const result = await store.testOrionConnection()
    expect(result.ok).toBeNull()
    expect(result.orion_reachable).toBeNull()
    expect(result.reachable).toBeNull()
    expect(result.message).toContain('unknown')
  })

  it('preserves unknown reachability when flags are missing', async () => {
    const store = useMqttStore()
    testOrionConnection.mockResolvedValueOnce({ message: 'pending check' })
    const result = await store.testOrionConnection()
    expect(result.ok).toBeNull()
    expect(result.orion_reachable).toBeNull()
    expect(result.reachable).toBeNull()
    expect(result.message).toBe('pending check')
  })


  it('normalizes Orion connectivity payloads with table-driven contract', async () => {
    const store = useMqttStore()
    const cases: Array<{
      name: string
      payload: OrionConnectionResult
      expected: { ok: boolean | null; orion_reachable: boolean | null; reachable: boolean | null }
    }> = [
      { name: 'ok false', payload: { ok: false }, expected: { ok: false, orion_reachable: false, reachable: false } },
      { name: 'ok false ignores conflicting true', payload: { ok: false, orion_reachable: true }, expected: { ok: false, orion_reachable: false, reachable: false } },
      { name: 'ok true + orion true', payload: { ok: true, orion_reachable: true }, expected: { ok: true, orion_reachable: true, reachable: true } },
      { name: 'ok true + orion false', payload: { ok: true, orion_reachable: false }, expected: { ok: true, orion_reachable: false, reachable: false } },
      { name: 'ok true + legacy true', payload: { ok: true, reachable: true }, expected: { ok: true, orion_reachable: true, reachable: true } },
      { name: 'ok true + legacy false', payload: { ok: true, reachable: false }, expected: { ok: true, orion_reachable: false, reachable: false } },
      { name: 'ok true no reachability', payload: { ok: true }, expected: { ok: true, orion_reachable: null, reachable: null } },
      { name: 'orion only true', payload: { orion_reachable: true }, expected: { ok: true, orion_reachable: true, reachable: true } },
      { name: 'orion only false', payload: { orion_reachable: false }, expected: { ok: false, orion_reachable: false, reachable: false } },
      { name: 'legacy only true', payload: { reachable: true }, expected: { ok: true, orion_reachable: true, reachable: true } },
      { name: 'legacy only false', payload: { reachable: false }, expected: { ok: false, orion_reachable: false, reachable: false } },
      { name: 'legacy null', payload: { reachable: null }, expected: { ok: null, orion_reachable: null, reachable: null } },
      { name: 'empty payload', payload: {}, expected: { ok: null, orion_reachable: null, reachable: null } },
    ]

    for (const testCase of cases) {
      testOrionConnection.mockResolvedValueOnce(testCase.payload)
      const result = await store.testOrionConnection()
      expect(result.ok, testCase.name).toBe(testCase.expected.ok)
      expect(result.orion_reachable, testCase.name).toBe(testCase.expected.orion_reachable)
      expect(result.reachable, testCase.name).toBe(testCase.expected.reachable)
    }

    testOrionConnection.mockRejectedValueOnce(new Error('network down'))
    await expect(store.testOrionConnection()).rejects.toThrow('network down')
    expect(store.orionTestResult).toMatchObject({ ok: false, orion_reachable: false, reachable: false })
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
