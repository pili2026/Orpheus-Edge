import { describe, it, expect, vi, beforeEach } from 'vitest'

// D5: the assertion target is the shared HTTP instance the client actually
// uses, in the style of the MQTT service test. Other parts of the tree call a
// bare HTTP library with literal full paths; that is not this file's
// convention, so those tests are not this test's model.
vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(async () => ({
      data: { interface: null, networks: [], total_count: 0, psk_store_available: false },
    })),
  },
}))

import api from '@/services/api'
import { wifiApi } from '@/services/wifi'

const getMock = vi.mocked(api.get)

describe('wifiApi.listConfiguredNetworks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMock.mockResolvedValue({
      data: { interface: null, networks: [], total_count: 0, psk_store_available: false },
    } as never)
  })

  it('requests /wifi/networks with no interface and a per-call timeout', async () => {
    await wifiApi.listConfiguredNetworks()

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/wifi/networks', {
      params: {},
      timeout: expect.any(Number),
    })
  })

  it('writes the path without the /api prefix the shared instance supplies', async () => {
    await wifiApi.listConfiguredNetworks()

    // api's baseURL is '/api'. A method that spelled the prefix itself would
    // request /api/api/wifi/networks against the running gateway.
    const path = String(getMock.mock.calls[0]![0])
    expect(path).toBe('/wifi/networks')
    expect(path.startsWith('/api')).toBe(false)
  })

  it('passes an interface name through as a query parameter when one is given', async () => {
    await wifiApi.listConfiguredNetworks('wlan0')

    expect(api.get).toHaveBeenCalledWith('/wifi/networks', {
      params: { ifname: 'wlan0' },
      timeout: expect.any(Number),
    })
  })

  it('returns the response body unwrapped', async () => {
    const body = {
      interface: 'wlan0',
      total_count: 1,
      psk_store_available: true,
      networks: [
        {
          network_id: 4,
          ssid: 'SITE-A',
          priority: 10,
          enabled: true,
          current: true,
          is_factory_default: false,
          psk_state: 'known' as const,
        },
      ],
    }
    getMock.mockResolvedValueOnce({ data: body } as never)

    await expect(wifiApi.listConfiguredNetworks()).resolves.toEqual(body)
  })

  it('lets a rejection propagate rather than swallowing it', async () => {
    getMock.mockRejectedValueOnce(new Error('wpa_supplicant unavailable'))

    await expect(wifiApi.listConfiguredNetworks()).rejects.toThrow('wpa_supplicant unavailable')
  })
})
