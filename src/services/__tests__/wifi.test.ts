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
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import { AxiosError, AxiosHeaders } from 'axios'
import api from '@/services/api'
import { assertBodyStatusSucceeded, wifiApi } from '@/services/wifi'

const getMock = vi.mocked(api.get)
const postMock = vi.mocked(api.post)
const deleteMock = vi.mocked(api.delete)

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

describe('wifiApi.saveNetwork', () => {
  /** The measured success body for a new entry, field for field. */
  const successBody = (over: Record<string, unknown> = {}) => ({
    status: 'success',
    timestamp: '2026-09-23T05:00:00',
    message: null,
    interface: 'wlan0',
    ssid: 'ZZ-SITE-A',
    network_id: 7,
    applied_priority: 4,
    created: true,
    saved: true,
    save_error: null,
    left_disabled: false,
    note: 'Network stored in wpa_supplicant configuration.',
    ...over,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued once-values; a test that failed early must not feed the next.
    postMock.mockReset()
    postMock.mockResolvedValue({ data: successBody() } as never)
  })

  it('posts to /wifi/networks with no params, no interface and the save timeout', async () => {
    await wifiApi.saveNetwork({ ssid: 'ZZ-SITE-A', security: 'WPA2', psk: 'correct horse' })

    expect(api.post).toHaveBeenCalledTimes(1)
    const [path, body, config] = postMock.mock.calls[0]!
    expect(path).toBe('/wifi/networks')
    // I3: the panel's requests carry no interface, in the query or anywhere else.
    expect(config).toEqual({ timeout: 45000 })
    expect(config).not.toHaveProperty('params')
    // Only the three fields the request model allows; any other key is a 422.
    expect(body).toEqual({ ssid: 'ZZ-SITE-A', security: 'WPA2', psk: 'correct horse' })
    expect(Object.keys(body as object).sort()).toEqual(['psk', 'security', 'ssid'])
  })

  it('sends an OPEN request with psk absent, not null', async () => {
    await wifiApi.saveNetwork({ ssid: 'ZZ-OPEN', security: 'OPEN' })

    const body = postMock.mock.calls[0]![1] as Record<string, unknown>
    expect(body).toEqual({ ssid: 'ZZ-OPEN', security: 'OPEN' })
    expect(body).not.toHaveProperty('psk')
  })

  it('sends the values exactly as given', async () => {
    // I8: nothing trims, folds or normalises on the way out.
    await wifiApi.saveNetwork({ ssid: ' ZZ-Site a ', security: 'WPA/WPA2', psk: ' Pass Word ' })

    expect(postMock.mock.calls[0]![1]).toEqual({
      ssid: ' ZZ-Site a ',
      security: 'WPA/WPA2',
      psk: ' Pass Word ',
    })
  })

  it('resolves a success body unchanged', async () => {
    const body = successBody({ created: false })
    postMock.mockResolvedValueOnce({ data: body } as never)

    await expect(
      wifiApi.saveNetwork({ ssid: 'ZZ-SITE-A', security: 'WPA2', psk: 'correct horse' }),
    ).resolves.toEqual(body)
  })

  it('rejects a 200 whose body reports an error, with the server message', async () => {
    // I6: a 2xx alone is never a successful save.
    postMock.mockResolvedValueOnce({
      data: successBody({
        status: 'error',
        message: 'Failed to save WiFi network: wpa_cli returned FAIL',
        network_id: null,
        applied_priority: null,
        created: false,
        saved: false,
      }),
    } as never)

    await expect(
      wifiApi.saveNetwork({ ssid: 'ZZ-SITE-A', security: 'WPA2', psk: 'correct horse' }),
    ).rejects.toThrow(new Error('Failed to save WiFi network: wpa_cli returned FAIL'))
  })

  it('names the save endpoint in the fallback when an error body carries no message', async () => {
    postMock.mockResolvedValueOnce({
      data: successBody({ status: 'error', message: null }),
    } as never)

    await expect(
      wifiApi.saveNetwork({ ssid: 'ZZ-SITE-A', security: 'WPA2', psk: 'correct horse' }),
    ).rejects.toThrow(new Error('POST /wifi/networks returned status "error"'))
  })

  it('lets an HTTP rejection propagate with error.response.data intact', async () => {
    const data = successBody({
      status: 'error',
      message: 'Network was configured but could not be persisted to disk. EROFS',
      saved: false,
      save_error: 'EROFS',
    })
    const rejection = new AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE')
    rejection.response = {
      status: 500,
      statusText: 'Internal Server Error',
      data,
      headers: {},
      config: { headers: new AxiosHeaders() },
    }
    postMock.mockRejectedValueOnce(rejection)

    const caught = await wifiApi
      .saveNetwork({ ssid: 'ZZ-SITE-A', security: 'WPA2', psk: 'correct horse' })
      .then(
        () => null,
        (e: unknown) => e,
      )

    // The same object, not a rewrapped one: the dialog reads the 500's flat body here.
    expect(caught).toBe(rejection)
    expect((caught as AxiosError).response?.data).toEqual(data)
  })
})

describe('wifiApi.deleteNetwork', () => {
  /** The measured success body, field for field. */
  const successBody = (over: Record<string, unknown> = {}) => ({
    status: 'success',
    timestamp: '2026-09-29T05:00:00',
    message: null,
    interface: 'wlan0',
    network_id: 9137,
    ssid: 'ZZ-DEL-A',
    saved: true,
    save_error: null,
    ...over,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued once-values; a test that failed early must not feed the next.
    deleteMock.mockReset()
    deleteMock.mockResolvedValue({ data: successBody() } as never)
  })

  it('deletes /wifi/networks/<id> with only the SSID as a param and the delete timeout', async () => {
    await wifiApi.deleteNetwork(9137, 'ZZ-DEL-A')

    expect(api.delete).toHaveBeenCalledTimes(1)
    const [path, config] = deleteMock.mock.calls[0]!
    // api's baseURL is '/api', so the prefix is not spelled here.
    expect(path).toBe('/wifi/networks/9137')
    expect(config).toEqual({ params: { ssid: 'ZZ-DEL-A' }, timeout: 45000 })
    // I3: no interface, in the query or anywhere else.
    expect(Object.keys(config!.params as object)).toEqual(['ssid'])
    expect(JSON.stringify(deleteMock.mock.calls[0])).not.toContain('ifname')
  })

  it.each([
    ['an empty string', ''],
    ['trailing and inner spaces', 'A B '],
    ['a plus sign', 'A+B'],
    ['an ampersand and a hash', 'A&B#C'],
    ['CJK characters', '工廠'],
    ['a literal backslash escape', '\\xe5'],
  ])('passes %s through byte for byte', async (_label, ssid) => {
    // I8: nothing trims, folds or normalises on the way out; axios encodes it.
    await wifiApi.deleteNetwork(9241, ssid)

    const params = deleteMock.mock.calls[0]![1]!.params as { ssid: string }
    expect(params.ssid).toBe(ssid)
    expect(params.ssid.length).toBe(ssid.length)
  })

  it('resolves a success body unchanged', async () => {
    const body = successBody()
    deleteMock.mockResolvedValueOnce({ data: body } as never)

    await expect(wifiApi.deleteNetwork(9137, 'ZZ-DEL-A')).resolves.toEqual(body)
  })

  it('rejects a 200 whose body reports an error, with the server message', async () => {
    // I6: a 2xx alone is never a successful delete.
    deleteMock.mockResolvedValueOnce({
      data: successBody({
        status: 'error',
        message: 'Failed to remove WiFi network: wpa_cli timeout',
        ssid: '',
        saved: false,
      }),
    } as never)

    await expect(wifiApi.deleteNetwork(9137, 'ZZ-DEL-A')).rejects.toThrow(
      new Error('Failed to remove WiFi network: wpa_cli timeout'),
    )
  })

  it('names the delete endpoint in the fallback when an error body carries no message', async () => {
    deleteMock.mockResolvedValueOnce({
      data: successBody({ status: 'error', message: null }),
    } as never)

    await expect(wifiApi.deleteNetwork(9137, 'ZZ-DEL-A')).rejects.toThrow(
      new Error('DELETE /wifi/networks/{id} returned status "error"'),
    )
  })

  it.each([
    [500, { ...successBody(), status: 'error', saved: false, save_error: 'EROFS' }],
    [
      409,
      {
        status: 'error',
        message: 'Network 9137 is ZZ-OTHER, not ZZ-DEL-A',
        interface: 'wlan0',
        network_id: 9137,
        requested_ssid: 'ZZ-DEL-A',
        actual_ssid: 'ZZ-OTHER',
        match_count: null,
        reason: 'ssid_mismatch',
      },
    ],
    [404, { detail: 'No configured network with id 9137' }],
  ])('lets a %i propagate with error.response.data intact', async (status, data) => {
    const rejection = new AxiosError(
      `Request failed with status code ${status}`,
      'ERR_BAD_RESPONSE',
    )
    rejection.response = {
      status,
      statusText: '',
      data,
      headers: {},
      config: { headers: new AxiosHeaders() },
    }
    deleteMock.mockRejectedValueOnce(rejection)

    const caught = await wifiApi.deleteNetwork(9137, 'ZZ-DEL-A').then(
      () => null,
      (e: unknown) => e,
    )

    // The same object, not a rewrapped one: the panel reads the flat body here.
    expect(caught).toBe(rejection)
    expect((caught as AxiosError).response?.data).toEqual(data)
  })

  it.each([
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a numeric string', '9137' as unknown as number],
    ['null', null as unknown as number],
  ])('throws on %s before any request', async (_label, networkId) => {
    await expect(wifiApi.deleteNetwork(networkId, 'ZZ-DEL-A')).rejects.toThrow(
      'deleteNetwork requires an integer network_id',
    )
    expect(api.delete).not.toHaveBeenCalled()
  })
})

describe('wifiApi.scan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMock.mockReset()
  })

  it('resolves a success body unchanged', async () => {
    const body = {
      status: 'success',
      interface: 'wlan0',
      networks: [
        {
          ssid: 'imaoffice1',
          signal_strength: 80,
          security: 'wpa2-psk',
          in_use: true,
          is_valid: true,
        },
      ],
      total_count: 1,
      current_ssid: 'imaoffice1',
    }
    getMock.mockResolvedValueOnce({ data: body } as never)

    await expect(wifiApi.scan('wlan0')).resolves.toEqual(body)
  })

  it('rejects a 200 error body with the server message', async () => {
    // Talos's scan failure body, field for field: emptiness alone would read as no networks nearby.
    getMock.mockResolvedValueOnce({
      data: {
        status: 'error',
        message: 'Unable to scan WiFi networks',
        networks: [],
        total_count: 0,
        current_ssid: null,
      },
    } as never)

    await expect(wifiApi.scan('wlan0')).rejects.toThrow(new Error('Unable to scan WiFi networks'))
  })
})

describe('assertBodyStatusSucceeded', () => {
  it('returns on a success body', () => {
    expect(() => assertBodyStatusSucceeded({ status: 'success' }, 'X /y')).not.toThrow()
  })

  it('quotes the endpoint label it is given in the fallback', () => {
    expect(() => assertBodyStatusSucceeded({ status: 'failed', message: '' }, 'X /y')).toThrow(
      new Error('X /y returned status "failed"'),
    )
  })
})
