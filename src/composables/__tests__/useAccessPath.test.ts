import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The composable runs over the real Wi-Fi and provision clients with only the
// shared HTTP instance replaced, so these tests see the requests it issues.
vi.mock('@/services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))

type Composable = typeof import('@/composables/useAccessPath')
type Api = typeof import('@/services/api')

let mod: Composable
let getMock: ReturnType<typeof vi.fn>

/** The page as the operator opened it. */
const openedAt = (href: string) => {
  vi.stubGlobal('location', new URL(href))
}

const statusBody = (ip: string | null) => ({
  data: {
    status: 'success',
    status_info: { interface: 'wlan0', ip_address: ip, is_connected: true },
  },
})
const configBody = (hostname: string) => ({
  data: { hostname, reverse_port: 0, port_source: 'service' },
})

/** Answers by path; anything not given hangs, so an unexpected request is visible as a stall. */
const answer = (routes: { status?: () => Promise<unknown>; config?: () => Promise<unknown> }) => {
  getMock.mockImplementation((url: string) => {
    if (url === '/wifi/status' && routes.status) return routes.status()
    if (url === '/provision/config' && routes.config) return routes.config()
    return new Promise(() => {})
  })
}

const configCalls = () => getMock.mock.calls.filter(([url]) => url === '/provision/config').length
const statusCalls = () => getMock.mock.calls.filter(([url]) => url === '/wifi/status')

beforeEach(async () => {
  // The hostname cache is module state; every test starts from an empty one.
  vi.resetModules()
  const api: Api = await import('@/services/api')
  getMock = vi.mocked(api.default.get) as unknown as ReturnType<typeof vi.fn>
  getMock.mockReset()
  mod = await import('@/composables/useAccessPath')
  openedAt('http://192.168.6.100:8080/debug/wifi')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useAccessPath: classification', () => {
  beforeEach(() => {
    answer({ config: async () => configBody('ecutestenv00') })
  })

  it('wifi-ip: the page host is the Wi-Fi IP', async () => {
    const path = await mod.useAccessPath().describe('192.168.6.100')
    expect(path).toEqual({
      kind: 'wifi-ip',
      ip: '192.168.6.100',
      host: '192.168.6.100:8080',
      url: 'http://ecutestenv00.local:8080',
    })
  })

  it('other-ip: the page host is an IP and the Wi-Fi IP is a different one', async () => {
    openedAt('http://192.168.6.101:8080/')
    const path = await mod.useAccessPath().describe('192.168.6.100')
    expect(path.kind).toBe('other-ip')
    expect(path.ip).toBe('192.168.6.100')
    expect(path.host).toBe('192.168.6.101:8080')
  })

  it('ip-unknown: the page host is an IP and the Wi-Fi IP is null', async () => {
    const path = await mod.useAccessPath().describe(null)
    expect(path.kind).toBe('ip-unknown')
    expect(path.ip).toBeNull()
  })

  it("ip-unknown: the page host is an IP and the Wi-Fi IP is ''", async () => {
    const path = await mod.useAccessPath().describe('')
    expect(path.kind).toBe('ip-unknown')
    expect(path.ip).toBeNull()
  })

  it('ip-unknown and wifi-ip do not fetch status when the caller passed a value', async () => {
    await mod.useAccessPath().describe(null)
    await mod.useAccessPath().describe('192.168.6.100')
    expect(statusCalls()).toHaveLength(0)
  })

  it('hostname: a page opened by name, even when its Wi-Fi IP is known', async () => {
    openedAt('http://ecutestenv00.local:8080/')
    const path = await mod.useAccessPath().describe('192.168.6.100')
    expect(path.kind).toBe('hostname')
    expect(path.host).toBe('ecutestenv00.local:8080')
  })

  it('a bracketed IPv6 host is an IP literal, compared without its brackets', async () => {
    openedAt('http://[fe80::1]:8080/')
    expect((await mod.useAccessPath().describe('fe80::1')).kind).toBe('wifi-ip')
    expect((await mod.useAccessPath().describe('fe80::2')).kind).toBe('other-ip')
  })
})

describe('useAccessPath: the URL', () => {
  it('keeps the scheme and the port the page was opened with', async () => {
    openedAt('https://192.168.6.100:8443/')
    answer({ config: async () => configBody('ecutestenv00') })
    expect((await mod.useAccessPath().describe('192.168.6.100')).url).toBe(
      'https://ecutestenv00.local:8443',
    )
  })

  it('adds no port when the page was opened without one', async () => {
    openedAt('http://192.168.6.100/')
    answer({ config: async () => configBody('ecutestenv00') })
    expect((await mod.useAccessPath().describe('192.168.6.100')).url).toBe(
      'http://ecutestenv00.local',
    )
  })

  it('does not add .local to a hostname that already ends in it', async () => {
    answer({ config: async () => configBody('ecutestenv00.local') })
    expect((await mod.useAccessPath().describe('192.168.6.100')).url).toBe(
      'http://ecutestenv00.local:8080',
    )
  })

  it.each([['unknown'], ['']])('gives no URL for the hostname %j', async (hostname) => {
    answer({ config: async () => configBody(hostname) })
    expect((await mod.useAccessPath().describe('192.168.6.100')).url).toBeNull()
  })

  it('gives no URL when the hostname lookup fails, and still classifies', async () => {
    answer({ config: async () => Promise.reject(new Error('Network Error')) })
    const path = await mod.useAccessPath().describe('192.168.6.100')
    expect(path.url).toBeNull()
    expect(path.kind).toBe('wifi-ip')
  })
})

describe('useAccessPath: the status lookup', () => {
  it('with no argument, asks /wifi/status with no params and compares its IP', async () => {
    answer({
      status: async () => statusBody('192.168.6.100'),
      config: async () => configBody('ecutestenv00'),
    })
    const path = await mod.useAccessPath().describe()

    const calls = statusCalls()
    expect(calls).toHaveLength(1)
    const config = calls[0]![1] as { params?: Record<string, unknown> }
    expect(Object.keys(config?.params ?? {})).toEqual([])
    expect(path.kind).toBe('wifi-ip')
    expect(path.ip).toBe('192.168.6.100')
  })

  it('with no argument, a different status IP is other-ip', async () => {
    answer({
      status: async () => statusBody('192.168.6.100'),
      config: async () => configBody('ecutestenv00'),
    })
    openedAt('http://192.168.6.101:8080/')
    expect((await mod.useAccessPath().describe()).kind).toBe('other-ip')
  })

  it('a failed status lookup is ip-unknown', async () => {
    answer({
      status: async () => Promise.reject(new Error('Network Error')),
      config: async () => configBody('ecutestenv00'),
    })
    const path = await mod.useAccessPath().describe()
    expect(path.kind).toBe('ip-unknown')
    expect(path.ip).toBeNull()
  })
})

describe('useAccessPath: the hostname cache', () => {
  it('asks once across two calls after a success', async () => {
    answer({ config: async () => configBody('ecutestenv00') })
    await mod.useAccessPath().describe('192.168.6.100')
    await mod.useAccessPath().describe('192.168.6.100')
    expect(configCalls()).toBe(1)
  })

  it('asks again on the next call after a failure', async () => {
    let calls = 0
    answer({
      config: async () => {
        calls += 1
        if (calls === 1) throw new Error('Network Error')
        return configBody('ecutestenv00')
      },
    })
    expect((await mod.useAccessPath().describe('192.168.6.100')).url).toBeNull()
    expect((await mod.useAccessPath().describe('192.168.6.100')).url).toBe(
      'http://ecutestenv00.local:8080',
    )
    expect(configCalls()).toBe(2)
  })

  it('a successful prefetch means the next describe makes no hostname request', async () => {
    answer({ config: async () => configBody('ecutestenv00') })
    mod.prefetchHostname()
    await vi.waitFor(() => expect(configCalls()).toBe(1))
    await Promise.resolve()

    const path = await mod.useAccessPath().describe('192.168.6.100')
    expect(path.url).toBe('http://ecutestenv00.local:8080')
    expect(configCalls()).toBe(1)
  })

  it('a failed prefetch neither throws nor rejects, and the next describe asks again', async () => {
    let calls = 0
    answer({
      config: async () => {
        calls += 1
        if (calls === 1) throw new Error('Network Error')
        return configBody('ecutestenv00')
      },
    })
    expect(() => mod.prefetchHostname()).not.toThrow()
    await vi.waitFor(() => expect(configCalls()).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((await mod.useAccessPath().describe('192.168.6.100')).url).toBe(
      'http://ecutestenv00.local:8080',
    )
    expect(configCalls()).toBe(2)
  })
})

describe('useAccessPath: the lookup cap', () => {
  /** Starts describe() and reports whether it has settled, and with what. */
  const track = (run: Promise<import('@/composables/useAccessPath').AccessPath>) => {
    const state: { done: boolean; value: import('@/composables/useAccessPath').AccessPath | null } =
      { done: false, value: null }
    run.then((value) => {
      state.done = true
      state.value = value
    })
    return state
  }

  it('is 3000 ms', () => {
    expect(mod.ACCESS_PATH_LOOKUP_TIMEOUT_MS).toBe(3000)
  })

  it('a hanging hostname lookup resolves describe within the cap, with no URL', async () => {
    vi.useFakeTimers()
    answer({}) // the hostname request never answers
    const state = track(mod.useAccessPath().describe('192.168.6.100'))

    await vi.advanceTimersByTimeAsync(2999)
    expect(state.done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.done).toBe(true)
    expect(state.value!.url).toBeNull()
    expect(state.value!.kind).toBe('wifi-ip')
  })

  it('a hanging status lookup resolves describe within the cap, as ip-unknown', async () => {
    vi.useFakeTimers()
    answer({ config: async () => configBody('ecutestenv00') }) // status never answers
    const state = track(mod.useAccessPath().describe())

    await vi.advanceTimersByTimeAsync(2999)
    expect(state.done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.done).toBe(true)
    expect(state.value!.kind).toBe('ip-unknown')
    expect(state.value!.url).toBe('http://ecutestenv00.local:8080')
  })
})
