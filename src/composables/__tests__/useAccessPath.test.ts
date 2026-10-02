import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The composable runs over the real Wi-Fi and provision clients with only the
// shared HTTP instance replaced, so these tests see the requests it issues.
vi.mock('@/services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))

type Composable = typeof import('@/composables/useAccessPath')
type Api = typeof import('@/services/api')
type AccessPath = import('@/composables/useAccessPath').AccessPath

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

/** Lets a settled request's handlers run; real timers only. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Fills the hostname cache the only way it can be filled: a prefetch that succeeds. */
const prefetched = async (hostname: string) => {
  answer({ config: async () => configBody(hostname) })
  mod.prefetchHostname()
  await settle()
  getMock.mockClear()
}

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

describe('describeSync: classification', () => {
  beforeEach(async () => {
    await prefetched('ecutestenv00')
  })

  it('wifi-ip: the page host is the Wi-Fi IP', () => {
    expect(mod.useAccessPath().describeSync('192.168.6.100')).toEqual({
      kind: 'wifi-ip',
      ip: '192.168.6.100',
      host: '192.168.6.100:8080',
      url: 'http://ecutestenv00.local:8080',
    })
  })

  it('other-ip: the page host is an IP and the Wi-Fi IP is a different one', () => {
    openedAt('http://192.168.6.101:8080/')
    const path = mod.useAccessPath().describeSync('192.168.6.100')
    expect(path.kind).toBe('other-ip')
    expect(path.ip).toBe('192.168.6.100')
    expect(path.host).toBe('192.168.6.101:8080')
  })

  it('ip-unknown: the page host is an IP and the Wi-Fi IP is null', () => {
    const path = mod.useAccessPath().describeSync(null)
    expect(path.kind).toBe('ip-unknown')
    expect(path.ip).toBeNull()
  })

  it("ip-unknown: the page host is an IP and the Wi-Fi IP is ''", () => {
    const path = mod.useAccessPath().describeSync('')
    expect(path.kind).toBe('ip-unknown')
    expect(path.ip).toBeNull()
  })

  it('hostname: a page opened by name, even when its Wi-Fi IP is known', () => {
    openedAt('http://ecutestenv00.local:8080/')
    const path = mod.useAccessPath().describeSync('192.168.6.100')
    expect(path.kind).toBe('hostname')
    expect(path.host).toBe('ecutestenv00.local:8080')
  })

  it('a bracketed IPv6 host is an IP literal, compared without its brackets', () => {
    openedAt('http://[fe80::1]:8080/')
    expect(mod.useAccessPath().describeSync('fe80::1').kind).toBe('wifi-ip')
    expect(mod.useAccessPath().describeSync('fe80::2').kind).toBe('other-ip')
  })

  it('makes no request, whatever it is asked', () => {
    for (const ip of ['192.168.6.100', '192.168.6.101', null, '']) {
      mod.useAccessPath().describeSync(ip)
    }
    expect(getMock).not.toHaveBeenCalled()
  })
})

describe('describeSync: the URL', () => {
  it('is null with an empty cache, and asking starts no hostname request', () => {
    answer({ config: async () => configBody('ecutestenv00') })
    const path = mod.useAccessPath().describeSync('192.168.6.100')
    expect(path.url).toBeNull()
    expect(path.kind).toBe('wifi-ip')
    expect(getMock).not.toHaveBeenCalled()
  })

  it('keeps the scheme and the port the page was opened with', async () => {
    openedAt('https://192.168.6.100:8443/')
    await prefetched('ecutestenv00')
    expect(mod.useAccessPath().describeSync('192.168.6.100').url).toBe(
      'https://ecutestenv00.local:8443',
    )
  })

  it('adds no port when the page was opened without one', async () => {
    openedAt('http://192.168.6.100/')
    await prefetched('ecutestenv00')
    expect(mod.useAccessPath().describeSync('192.168.6.100').url).toBe('http://ecutestenv00.local')
  })

  it('does not add .local to a hostname that already ends in it', async () => {
    await prefetched('ecutestenv00.local')
    expect(mod.useAccessPath().describeSync('192.168.6.100').url).toBe(
      'http://ecutestenv00.local:8080',
    )
  })

  it.each([['unknown'], ['']])('gives no URL for the hostname %j', async (hostname) => {
    await prefetched(hostname)
    expect(mod.useAccessPath().describeSync('192.168.6.100').url).toBeNull()
  })

  it('gives no URL after a failed prefetch, and still classifies', async () => {
    answer({ config: async () => Promise.reject(new Error('Network Error')) })
    mod.prefetchHostname()
    await settle()
    const path = mod.useAccessPath().describeSync('192.168.6.100')
    expect(path.url).toBeNull()
    expect(path.kind).toBe('wifi-ip')
  })
})

describe('describe(): for a caller with no Wi-Fi IP', () => {
  it('asks /wifi/status with no params, compares its IP, and makes no provision request', async () => {
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
    expect(path.url).toBeNull()
    expect(configCalls()).toBe(0)
  })

  it('takes the URL from a cache a prefetch filled', async () => {
    await prefetched('ecutestenv00')
    answer({ status: async () => statusBody('192.168.6.100') })
    expect((await mod.useAccessPath().describe()).url).toBe('http://ecutestenv00.local:8080')
    expect(configCalls()).toBe(0)
  })

  it('a different status IP is other-ip', async () => {
    answer({ status: async () => statusBody('192.168.6.100') })
    openedAt('http://192.168.6.101:8080/')
    expect((await mod.useAccessPath().describe()).kind).toBe('other-ip')
  })

  it('a failed status lookup is ip-unknown', async () => {
    answer({ status: async () => Promise.reject(new Error('Network Error')) })
    const path = await mod.useAccessPath().describe()
    expect(path.kind).toBe('ip-unknown')
    expect(path.ip).toBeNull()
  })

  it('the status cap is 3000 ms', () => {
    expect(mod.ACCESS_PATH_LOOKUP_TIMEOUT_MS).toBe(3000)
  })

  it('a hanging status lookup resolves within the cap, as ip-unknown', async () => {
    vi.useFakeTimers()
    answer({}) // status never answers
    const state: { done: boolean; value: AccessPath | null } = { done: false, value: null }
    void mod
      .useAccessPath()
      .describe()
      .then((value) => {
        state.done = true
        state.value = value
      })

    await vi.advanceTimersByTimeAsync(2999)
    expect(state.done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.done).toBe(true)
    expect(state.value!.kind).toBe('ip-unknown')
    expect(configCalls()).toBe(0)
  })
})

describe('prefetchHostname()', () => {
  it('starts one request while one is in flight', () => {
    answer({}) // the hostname request never answers
    mod.prefetchHostname()
    mod.prefetchHostname()
    mod.prefetchHostname()
    expect(configCalls()).toBe(1)
  })

  it('a success fills the cache, and a later prefetch asks nothing', async () => {
    answer({ config: async () => configBody('ecutestenv00') })
    mod.prefetchHostname()
    await settle()
    expect(mod.useAccessPath().describeSync('192.168.6.100').url).toBe(
      'http://ecutestenv00.local:8080',
    )

    mod.prefetchHostname()
    expect(configCalls()).toBe(1)
  })

  it('retries after a failure, and the retry can fill the cache', async () => {
    let calls = 0
    answer({
      config: async () => {
        calls += 1
        if (calls === 1) throw new Error('Network Error')
        return configBody('ecutestenv00')
      },
    })
    mod.prefetchHostname()
    await settle()
    expect(mod.useAccessPath().describeSync('192.168.6.100').url).toBeNull()

    mod.prefetchHostname()
    await settle()
    expect(configCalls()).toBe(2)
    expect(mod.useAccessPath().describeSync('192.168.6.100').url).toBe(
      'http://ecutestenv00.local:8080',
    )
  })

  it('never throws, even when the request cannot be made', async () => {
    getMock.mockImplementation(() => {
      throw new Error('synchronous failure')
    })
    expect(() => mod.prefetchHostname()).not.toThrow()
    await settle()
    expect(mod.useAccessPath().describeSync('192.168.6.100').url).toBeNull()
  })
})
