import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn(), success: vi.fn() } }))
const getMqttStatus = vi.fn(async () => ({ registered: true, connected: true }))
vi.mock('@/services/mqtt', () => ({
  getMqttConfig: vi.fn(async () => ({ enabled: true, broker: { host: 'h', port: 1883, tls: { enabled: false, ca_cert_path: '', insecure_skip_verify: false } }, credentials: { password_configured: true }, client: { client_id: 'id', clean_session: true, keepalive_sec: 30 }, reconnect: {}, qos: {}, topics: { base_prefix: 'x' }, outbox: {}, status: {}, event: { enabled: true }, telemetry: { enabled: false } })),
  getMqttStatus,
  patchMqttConfig: vi.fn(async (p: any) => p),
  restartMqttService: vi.fn(async () => ({})),
}))

import { useMqttStore } from '@/stores/mqtt'

describe('mqtt store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads/saves/restarts', async () => {
    const store = useMqttStore()
    await store.loadConfig()
    await store.loadStatus()
    await store.saveConfig({ enabled: false })
    await store.restartService()
    expect(store.config?.enabled).toBe(false)
    expect(store.status?.connected).toBe(true)
    expect(store.restartRequired).toBe(false)
  })

  it('clears stale status when loadStatus fails', async () => {
    const store = useMqttStore()
    store.status = { registered: true, connected: true } as any
    getMqttStatus.mockRejectedValueOnce(new Error('status unavailable'))
    await expect(store.loadStatus()).rejects.toThrow('status unavailable')
    expect(store.status).toBeNull()
    expect(store.loadingStatus).toBe(false)
  })
})
