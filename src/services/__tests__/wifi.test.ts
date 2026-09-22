import { describe, it, expect, vi, beforeEach } from 'vitest'

// D5: the assertion target is the shared HTTP instance the client actually
// uses, in the style of the MQTT service test. Other parts of the tree call a
// bare HTTP library with literal full paths; that is not this file's
// convention, so those tests are not this test's model.
vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(async () => ({
      data: {
        status: 'success',
        interface: null,
        networks: [],
        total_count: 0,
        psk_store_available: false,
      },
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
      data: {
        status: 'success',
        interface: null,
        networks: [],
        total_count: 0,
        psk_store_available: false,
      },
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
      status: 'success',
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

  // Talos reports some listing failures as HTTP 200 with a non-success `status`,
  // an empty `networks` and a `total_count` of 0 -- a body a client cannot tell
  // from a gateway that stores nothing by looking at the rows. A caller that
  // returned it as data would report the failure as an empty gateway.
  describe('a 200 whose body does not report success', () => {
    /** The measured failure body, field for field. */
    const errorBody = (over: Record<string, unknown> = {}) => ({
      data: {
        status: 'error',
        message: 'Unable to list configured WiFi networks',
        interface: 'wlan0',
        networks: [],
        total_count: 0,
        psk_store_available: false,
        ...over,
      },
    })

    it('resolves a success body unchanged', async () => {
      const body = {
        status: 'success',
        interface: 'wlan0',
        message: null,
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

      // Nothing is stripped, reshaped or defaulted on the way through.
      await expect(wifiApi.listConfiguredNetworks()).resolves.toEqual(body)
    })

    it('rejects with the server message when the body carries one', async () => {
      getMock.mockResolvedValueOnce(errorBody() as never)

      // The server named the cause; inventing wording over it would lose it.
      await expect(wifiApi.listConfiguredNetworks()).rejects.toThrow(
        new Error('Unable to list configured WiFi networks'),
      )
    })

    it('rejects a body with no status at all', async () => {
      // Neither field is present: the shape of a response this client does not
      // recognise, rather than a failure Talos declared.
      const { status: _status, message: _message, ...unrecognised } = errorBody().data
      getMock.mockResolvedValueOnce({ data: unrecognised } as never)

      // A body that does not say it succeeded has not said it succeeded. There
      // is no cause to name, so the status is quoted exactly as it arrived.
      await expect(wifiApi.listConfiguredNetworks()).rejects.toThrow(
        new Error('GET /wifi/networks returned status "undefined"'),
      )
    })

    it.each([
      ['an empty string', ''],
      ['null', null],
    ])('rejects with the fallback text when message is %s', async (_label, message) => {
      getMock.mockResolvedValueOnce(errorBody({ message }) as never)

      // Neither is something to show an operator, so neither is used as one.
      await expect(wifiApi.listConfiguredNetworks()).rejects.toThrow(
        new Error('GET /wifi/networks returned status "error"'),
      )
    })
  })
})
