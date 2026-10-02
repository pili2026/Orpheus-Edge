import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError } from 'axios'

// The store runs over the real Wi-Fi API client with only the shared HTTP
// instance replaced, so a rejection reaches it exactly as axios delivers one.
vi.mock('@/services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))

import api from '@/services/api'
import { useWiFiStore } from '@/stores/wifi'
import type { WiFiConnectRequest } from '@/services/wifi'

const getMock = vi.mocked(api.get)
const postMock = vi.mocked(api.post)

const REQ: WiFiConnectRequest = { ssid: 'ZZ-HOTSPOT', security: 'wpa2-psk', psk: 'pw-1' }

/** What axios rejects with when the request went out and nothing came back. */
const noResponse = () => new AxiosError('timeout of 45000ms exceeded', 'ECONNABORTED')

const httpError = (status: number, data: unknown) =>
  Object.assign(new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE'), {
    response: { status, data },
  })

const statusBody = {
  data: {
    status: 'success',
    status_info: { interface: 'wlan0', ssid: null, ip_address: null, is_connected: false },
  },
}

const deferred = () => {
  let resolve: (value: unknown) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useWiFiStore: connect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getMock.mockReset()
    postMock.mockReset()
    getMock.mockResolvedValue(statusBody as never)
    setActivePinia(createPinia())
    useWiFiStore().selectedIfname = 'wlan0'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('a rejection without a response sets lastConnectNoResponse and starts no poll', async () => {
    const wifi = useWiFiStore()
    postMock.mockRejectedValueOnce(noResponse())

    expect(await wifi.connect(REQ)).toBeNull()

    expect(wifi.lastConnectNoResponse).toBe(true)
    expect(wifi.lastConnectResult?.accepted).toBe(false)
    expect(wifi.pollState.active).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60000)
    expect(getMock).not.toHaveBeenCalled()
  })

  it('a rejection with a response does not set it', async () => {
    const wifi = useWiFiStore()
    postMock.mockRejectedValueOnce(
      httpError(500, { status: 'error', message: 'An unexpected error occurred', detail: null }),
    )

    await wifi.connect(REQ)

    expect(wifi.lastConnectNoResponse).toBe(false)
    expect(wifi.lastConnectResult?.accepted).toBe(false)
    expect(wifi.pollState.active).toBe(false)
  })

  it('is cleared when the next connect starts, before it settles', async () => {
    const wifi = useWiFiStore()
    postMock.mockRejectedValueOnce(noResponse())
    await wifi.connect(REQ)
    expect(wifi.lastConnectNoResponse).toBe(true)

    const pending = deferred()
    postMock.mockReturnValueOnce(pending.promise as never)
    const run = wifi.connect(REQ)
    expect(wifi.lastConnectNoResponse).toBe(false)

    pending.resolve({
      data: {
        status: 'error',
        message: 'Failed to initiate WiFi connection: boom',
        note: null,
        ssid: REQ.ssid,
        accepted: false,
        bssid_locked: false,
        saved: false,
        rescue_present: true,
        warnings: [],
        recommended_poll_interval_ms: 1000,
        recommended_timeout_ms: 30000,
      },
    })
    await run
    expect(wifi.lastConnectNoResponse).toBe(false)
    expect(wifi.lastConnectResult?.status).toBe('error')
    expect(wifi.lastConnectResult?.message).toBe('Failed to initiate WiFi connection: boom')
  })
})

describe('useWiFiStore: the reason written for a failed connect', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    setActivePinia(createPinia())
    useWiFiStore().selectedIfname = 'wlan0'
  })

  const noteFor = async (error: unknown) => {
    const wifi = useWiFiStore()
    postMock.mockRejectedValueOnce(error)
    await wifi.connect(REQ)
    return wifi.lastConnectResult?.note
  }

  it('prefers the body detail over its message', async () => {
    expect(
      await noteFor(httpError(400, { detail: 'detail-from-body', message: 'message-from-body' })),
    ).toBe('detail-from-body')
  })

  it("uses the body message when there is no detail (Talos's 422 and 500 bodies)", async () => {
    expect(
      await noteFor(
        httpError(422, { status: 'error', message: 'Request validation failed', errors: [] }),
      ),
    ).toBe('Request validation failed')
  })

  it("falls back to the error's own message when the body has neither", async () => {
    expect(await noteFor(httpError(502, {}))).toBe('Request failed with status code 502')
  })
})

describe('useWiFiStore: lastScanOk', () => {
  beforeEach(() => {
    getMock.mockReset()
    setActivePinia(createPinia())
    useWiFiStore().selectedIfname = 'wlan0'
  })

  const scanBody = {
    data: {
      status: 'success',
      interface: 'wlan0',
      networks: [],
      total_count: 0,
      current_ssid: null,
    },
  }

  it('is null before any scan', () => {
    expect(useWiFiStore().lastScanOk).toBeNull()
  })

  it('is true after a successful scan', async () => {
    const wifi = useWiFiStore()
    getMock.mockResolvedValueOnce(scanBody as never)
    await wifi.scan()
    expect(wifi.lastScanOk).toBe(true)
    expect(wifi.scanError).toBe('')
  })

  it('is false after a 200 error body, which also sets the scan error', async () => {
    const wifi = useWiFiStore()
    wifi.lastScanOk = true
    getMock.mockResolvedValueOnce({
      data: {
        status: 'error',
        message: 'Unable to scan WiFi networks',
        networks: [],
        total_count: 0,
        current_ssid: null,
      },
    } as never)
    await wifi.scan()
    expect(wifi.lastScanOk).toBe(false)
    expect(wifi.scanError).toBe('Unable to scan WiFi networks')
    expect(wifi.networks).toEqual([])
  })

  it('is false after an HTTP error', async () => {
    const wifi = useWiFiStore()
    wifi.lastScanOk = true
    getMock.mockRejectedValueOnce(httpError(500, { status: 'error', message: 'scan-500' }))
    await wifi.scan()
    expect(wifi.lastScanOk).toBe(false)
    expect(wifi.scanError).toBe('scan-500')
  })

  it('is true again after a later success', async () => {
    const wifi = useWiFiStore()
    getMock.mockRejectedValueOnce(noResponse())
    await wifi.scan()
    expect(wifi.lastScanOk).toBe(false)
    getMock.mockResolvedValueOnce(scanBody as never)
    await wifi.scan()
    expect(wifi.lastScanOk).toBe(true)
  })
})
