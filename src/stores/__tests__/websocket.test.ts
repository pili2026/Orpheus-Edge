import { setActivePinia, createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebSocketStore } from '@/stores/websocket'

const MAX_RECONNECT_ATTEMPTS = 5
// Base delay is 3000 ms with jitter applied; advancing well past the maximum
// possible delay guarantees any scheduled reconnect timer has fired.
const ADVANCE_PAST_RECONNECT_MS = 10_000
const STORM_GUARD_CYCLES = 50

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  url: string
  readyState = FakeWebSocket.CONNECTING
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
  }

  // ----- test drivers (server side) -----
  serverOpen() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  serverClose(code: number, reason = '') {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason, wasClean: code === 1000 } as CloseEvent)
  }

  serverMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
  }
}

const socketAt = (index: number): FakeWebSocket => {
  const sock = FakeWebSocket.instances[index]
  if (!sock) throw new Error(`no WebSocket instance at index ${index}`)
  return sock
}

const lastSocket = (): FakeWebSocket => socketAt(FakeWebSocket.instances.length - 1)

describe('websocket store reconnect behavior', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    FakeWebSocket.instances = []
  })

  it('does not reset the retry ceiling on open-then-immediate-close; loop terminates at MAX', () => {
    const store = useWebSocketStore()
    store.connect()

    // Server accepts the socket, then immediately closes it (accept-then-close
    // refusal without a terminal close code). The retry ceiling must still hold.
    let cycles = 0
    while (cycles < STORM_GUARD_CYCLES && FakeWebSocket.instances.length > cycles) {
      const sock = socketAt(cycles)
      cycles++
      sock.serverOpen()
      sock.serverClose(1006)
      vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
    }

    expect(FakeWebSocket.instances.length).toBe(1 + MAX_RECONNECT_ATTEMPTS)
    expect(store.error).toContain('Unable to connect')
  })

  it('treats close code 1013 as terminal and surfaces the server reason', () => {
    const store = useWebSocketStore()
    store.connect()

    const reason = 'Dashboard subscription requires unified mode (Core + API)'
    lastSocket().serverOpen()
    lastSocket().serverClose(1013, reason)
    vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)

    expect(FakeWebSocket.instances.length).toBe(1)
    expect(store.error).toBe(reason)
  })

  it('falls back to a default message when a 1013 close has an empty reason', () => {
    const store = useWebSocketStore()
    store.connect()

    lastSocket().serverClose(1013, '')
    vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)

    expect(FakeWebSocket.instances.length).toBe(1)
    expect(store.error).toBeTruthy()
    expect(store.error).not.toContain('refresh')
  })

  it('treats a clean close (1000) as terminal and does not reconnect', () => {
    const store = useWebSocketStore()
    store.connect()

    lastSocket().serverOpen()
    lastSocket().serverClose(1000)
    vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)

    expect(FakeWebSocket.instances.length).toBe(1)
  })

  it('retries abnormal closes (1006) with a bound, then stops at MAX', () => {
    const store = useWebSocketStore()
    store.connect()

    let cycles = 0
    while (cycles < STORM_GUARD_CYCLES && FakeWebSocket.instances.length > cycles) {
      const sock = socketAt(cycles)
      cycles++
      sock.serverClose(1006)
      vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
    }

    expect(FakeWebSocket.instances.length).toBe(1 + MAX_RECONNECT_ATTEMPTS)
    expect(store.error).toContain('Unable to connect')
  })

  it('resets the retry counter once a connection proves stable (first message received)', () => {
    const store = useWebSocketStore()
    store.connect()

    // Burn two attempts on abnormal closes.
    lastSocket().serverClose(1006)
    vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
    lastSocket().serverClose(1006)
    vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
    expect(FakeWebSocket.instances.length).toBe(3)

    // Third attempt succeeds and proves itself with a message.
    const stable = lastSocket()
    stable.serverOpen()
    stable.serverMessage({ type: 'keepalive' })
    expect(store.isConnected).toBe(true)

    // After the stable connection drops, the full retry budget is available again.
    stable.serverClose(1006)
    let created = 0
    while (created < STORM_GUARD_CYCLES) {
      vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
      if (FakeWebSocket.instances.length === 3 + created) break
      created++
      lastSocket().serverClose(1006)
    }

    // 3 sockets before the stable drop + MAX fresh retries afterwards.
    expect(FakeWebSocket.instances.length).toBe(3 + MAX_RECONNECT_ATTEMPTS)
  })

  it('clears the terminal flag on an explicit fresh connect()', () => {
    const store = useWebSocketStore()
    store.connect()

    lastSocket().serverClose(1013, 'refused')
    vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
    expect(FakeWebSocket.instances.length).toBe(1)

    // A later explicit connect() must not be wedged by the earlier refusal.
    store.connect()
    expect(FakeWebSocket.instances.length).toBe(2)

    // And its retry path must work again.
    lastSocket().serverClose(1006)
    vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
    expect(FakeWebSocket.instances.length).toBe(3)
  })

  it('applies jitter to the reconnect delay', () => {
    const timeoutSpy = vi.spyOn(window, 'setTimeout')
    const randomValues = [0, 0.5, 1]
    let call = 0
    vi.spyOn(Math, 'random').mockImplementation(
      () => randomValues[call++ % randomValues.length] ?? 0,
    )

    const store = useWebSocketStore()
    store.connect()

    const delays: number[] = []
    for (let i = 0; i < randomValues.length; i++) {
      lastSocket().serverClose(1006)
      const delay = timeoutSpy.mock.calls.at(-1)?.[1]
      expect(typeof delay).toBe('number')
      delays.push(delay as number)
      vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
    }

    // Delays stay near the 3000 ms base but are not all identical (jitter applied).
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(3000 * 0.7)
      expect(delay).toBeLessThanOrEqual(3000 * 1.3)
    }
    expect(new Set(delays).size).toBeGreaterThan(1)
  })

  it('ignores a stale close from a superseded socket (no terminal-flag leak)', () => {
    const store = useWebSocketStore()
    store.connect()
    const socketA = lastSocket()
    socketA.serverOpen()

    // Fast navigate-away then back: disconnect, then reconnect again before
    // socket A's close event has been delivered.
    store.disconnect()
    store.connect()
    expect(FakeWebSocket.instances.length).toBe(2)
    const socketB = lastSocket()

    // A's clean close arrives late. It must not set the terminal flag or
    // schedule anything.
    socketA.serverClose(1000)
    vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
    expect(FakeWebSocket.instances.length).toBe(2)

    // The CURRENT socket's abnormal close must still take the bounded-retry path.
    socketB.serverClose(1006)
    vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
    expect(FakeWebSocket.instances.length).toBe(3)
  })

  it('restores the retry budget on an explicit connect() after exhaustion; internal reconnects stay bounded', () => {
    const store = useWebSocketStore()
    store.connect()

    // Exhaust the auto-retry budget. Internal reconnects (scheduled by the
    // store itself) must not reset it, so the loop terminates at MAX.
    let cycles = 0
    while (cycles < STORM_GUARD_CYCLES && FakeWebSocket.instances.length > cycles) {
      const sock = socketAt(cycles)
      cycles++
      sock.serverClose(1006)
      vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
    }
    expect(FakeWebSocket.instances.length).toBe(1 + MAX_RECONNECT_ATTEMPTS)
    expect(store.error).toContain('Unable to connect')

    // A deliberate user reconnect gets a fresh budget.
    store.connect()
    expect(FakeWebSocket.instances.length).toBe(2 + MAX_RECONNECT_ATTEMPTS)

    // A close before the connection proves stable schedules a retry instead
    // of immediately hitting the exhausted max-attempts branch.
    lastSocket().serverClose(1006)
    vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
    expect(FakeWebSocket.instances.length).toBe(3 + MAX_RECONNECT_ATTEMPTS)

    // And the fresh auto-loop is itself still bounded at MAX.
    let prev = FakeWebSocket.instances.length
    while (prev < STORM_GUARD_CYCLES) {
      lastSocket().serverClose(1006)
      vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)
      if (FakeWebSocket.instances.length === prev) break
      prev = FakeWebSocket.instances.length
    }
    // 6 sockets from the first exhausted loop + 1 explicit + MAX fresh retries.
    expect(FakeWebSocket.instances.length).toBe(
      1 + MAX_RECONNECT_ATTEMPTS + 1 + MAX_RECONNECT_ATTEMPTS,
    )
  })

  it('does not reconnect after a manual disconnect', () => {
    const store = useWebSocketStore()
    store.connect()

    lastSocket().serverOpen()
    store.disconnect()
    lastSocket().serverClose(1006)
    vi.advanceTimersByTime(ADVANCE_PAST_RECONNECT_MS)

    expect(FakeWebSocket.instances.length).toBe(1)
  })
})
