import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/services/mqtt', () => ({
  getMqttConfig: vi.fn(async () => ({ enabled: true, broker: { host: 'h', port: 1883, tls: { enabled: false, ca_cert_path: '', insecure_skip_verify: false } }, credentials: { password_configured: true }, client: { client_id: 'id', clean_session: true, keepalive_sec: 30 }, reconnect: {}, qos: {}, topics: { base_prefix: 'x' }, outbox: {}, status: {}, event: { enabled: true }, telemetry: { enabled: false } })),
  getMqttStatus: vi.fn(async () => ({ registered: true, connected: true })),
  patchMqttConfig: vi.fn(async (p: any) => p),
  restartMqttService: vi.fn(async () => ({})),
}))

import { useMqttStore } from '@/stores/mqtt'

describe('mqtt store', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('loads/saves/restarts', async () => {
    const store = useMqttStore()
    await store.loadConfig(); await store.loadStatus(); await store.saveConfig({ enabled: false }); await store.restartService()
    expect(store.config?.enabled).toBe(false)
    expect(store.status?.connected).toBe(true)
    expect(store.restartRequired).toBe(false)
  })
})
