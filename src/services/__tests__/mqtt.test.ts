import { describe, it, expect, vi } from 'vitest'

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(async () => ({ data: { ok: true } })),
    patch: vi.fn(async () => ({ data: { ok: true } })),
    post: vi.fn(async () => ({ data: { ok: true } })),
  },
}))

import api from '@/services/api'
import { getMqttConfig, getMqttStatus, patchMqttConfig, restartMqttService } from '@/services/mqtt'

describe('mqtt service', () => {
  it('calls config and status APIs', async () => {
    await getMqttConfig(); await getMqttStatus(); await patchMqttConfig({ enabled: true }); await restartMqttService()
    expect(api.get).toHaveBeenCalledWith('/mqtt/config')
    expect(api.get).toHaveBeenCalledWith('/mqtt/status')
    expect(api.patch).toHaveBeenCalledWith('/mqtt/config', { enabled: true })
    expect(api.post).toHaveBeenCalledWith('/mqtt/restart')
  })
})
