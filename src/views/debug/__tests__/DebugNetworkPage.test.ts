import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElDrawer, ElMessageBox } from 'element-plus'

// The page calls wifi.init() on mount, which would reach the HTTP layer. The
// store is replaced by a real Pinia store of the same shape with inert actions:
// the page's setup runs storeToRefs() over it, so a plain object will not do.
// This suite is about what the page renders, not about the store, and the panel
// under test deliberately does not read it.
vi.mock('@/stores/wifi', async () => {
  const { defineStore } = await import('pinia')
  const noop = async () => {}
  return {
    useWiFiStore: defineStore('wifi', {
      state: () => ({
        selectedIfname: 'wlan0',
        interfaces: [],
        statusInfo: null,
        networks: [],
        scanTotalCount: 0,
        currentSsid: null,
        lastConnectResult: null,
        lastConnectNoResponse: false,
        scanError: '',
        lastScanOk: null,
        statusError: '',
        interfacesError: '',
        loading: {
          init: false,
          refreshAll: false,
          interfaces: false,
          status: false,
          scan: false,
          connect: false,
        },
        autoRefreshEnabled: false,
        autoRefreshIntervalMs: 5000,
        autoRefreshTimerId: null,
        pollState: {
          active: false,
          phase: 'idle',
          targetSsid: null,
          startedAt: 0,
          pollIntervalMs: 1000,
          timeoutMs: 30000,
          timerId: null,
        },
      }),
      actions: {
        init: noop,
        scan: noop,
        refreshAll: noop,
        refreshStatus: noop,
        loadInterfaces: noop,
        connect: noop,
        setAutoRefresh: () => {},
      },
    }),
  }
})

// The access path is the composable's to work out, and it has its own suite;
// here it answers whatever each test needs, and its prefetch is observed. One
// test switches to the real composable, to see what a click before the
// prefetch settles shows; the switch is read when the page sets up.
const { describeSyncMock, prefetchMock, realComposable } = vi.hoisted(() => ({
  describeSyncMock: vi.fn(),
  prefetchMock: vi.fn(),
  realComposable: { on: false },
}))
vi.mock('@/composables/useAccessPath', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useAccessPath')>()
  return {
    ...actual,
    useAccessPath: () =>
      realComposable.on ? actual.useAccessPath() : { describeSync: describeSyncMock },
    prefetchHostname: () => (realComposable.on ? actual.prefetchHostname() : prefetchMock()),
  }
})

import DebugNetworkPage from '@/views/debug/DebugNetworkPage.vue'
import ConfiguredWiFiNetworksPanel from '@/components/wifi/ConfiguredWiFiNetworksPanel.vue'
import WiFiConnectForm from '@/components/wifi/WiFiConnectForm.vue'
import WiFiStatusCard from '@/components/wifi/WiFiStatusCard.vue'
import WiFiSummaryRow from '@/components/wifi/WiFiSummaryRow.vue'
import { useUIStore } from '@/stores/ui'
import { useWiFiStore } from '@/stores/wifi'
import { provisionService } from '@/services/provision'
import type { AccessPath } from '@/composables/useAccessPath'
import { installMatchMedia, type MatchMediaStub } from '@/test-utils/matchMedia'
import type {
  WiFiConnectResponse,
  WiFiInterfaceInfo,
  WiFiNetwork,
  WiFiStatusInfo,
} from '@/services/wifi'
import en from '@/locales/en'
import zhTW from '@/locales/zh-TW'

// The page picks its layout with useBreakpoint, which needs matchMedia. Every test
// here runs at a laptop width, the sm+ layout, unless it sets a narrower one itself.
let media: MatchMediaStub
beforeAll(() => {
  media = installMatchMedia(1366)
})
afterAll(() => {
  media.uninstall()
})

// The panel is the one child stubbed: its behaviour has its own suite, and what
// this file protects is that the page still mounts it at all. Element Plus
// renders for real -- the page's own cards need their slots to render, and a
// blanket shallow mount strips the scoped slots its tables rely on.
const mountPage = () =>
  mount(DebugNetworkPage, {
    global: { plugins: [ElementPlus], stubs: { ConfiguredWiFiNetworksPanel: true } },
  })

/** The tag the stubbed panel renders as. */
const PANEL_TAG = 'configured-wi-fi-networks-panel-stub'

const childTags = (el: Element): string[] =>
  Array.from(el.children).map((child) => child.tagName.toLowerCase())

describe('DebugNetworkPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
  })

  it('mounts the configured Wi-Fi networks panel', async () => {
    const wrapper = mountPage()
    await flushPromises()

    // Fails the moment the panel is deleted from the page, which is the point.
    expect(wrapper.findComponent(ConfiguredWiFiNetworksPanel).exists()).toBe(true)
  })

  it('places the panel last in the left-hand column, after the overall-verdict card', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const columns = wrapper.findAll('.el-col')
    expect(columns.length, 'the page no longer has two columns').toBe(2)

    const left = childTags(columns[0]!.element)
    const panelAt = left.indexOf(PANEL_TAG)
    expect(panelAt, 'the panel is not a direct child of the left-hand column').toBeGreaterThan(-1)
    expect(panelAt, 'the panel is not the last card in the left-hand column').toBe(left.length - 1)

    // The card immediately above it is the overall verdict, which is what
    // "after the overall-verdict card" means on this page.
    const above = columns[0]!.element.children[panelAt - 1]
    expect(above?.textContent).toContain(en.debugNetwork.wifiStatus.title)

    // And it is not in the right-hand column at all.
    expect(childTags(columns[1]!.element)).not.toContain(PANEL_TAG)
  })

  it('leaves the right-hand column as the scan list, the connect form and the connect result', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const right = Array.from(wrapper.findAll('.el-col')[1]!.element.children)
    const headings = right.map((el) => el.querySelector('.card-header')?.textContent?.trim() ?? '')

    // Clicking a scan row fills the connect form, so nothing may be wedged
    // between those two.
    expect(headings).toEqual([
      expect.stringContaining(en.debugNetwork.availableNetworks),
      expect.stringContaining(en.debugNetwork.connect),
      expect.stringContaining(en.debugNetwork.connectResult),
    ])
  })
})

describe('DebugNetworkPage: the Wi-Fi status card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
  })

  const WLAN0: WiFiInterfaceInfo = {
    ifname: 'wlan0',
    is_wireless: true,
    is_up: true,
    is_default: true,
    mac: '02:00:00:aa:bb:cc',
    driver: 'rtl8xxxu',
    phy: 'phy0',
  }

  /** Associated without an IP, as Talos reports it: `is_connected` is false. */
  const NO_IP: WiFiStatusInfo = {
    interface: 'wlan0',
    ssid: 'imaoffice1',
    bssid: '11:22:33:44:55:66',
    freq: 5180,
    wpa_state: 'COMPLETED',
    ip_address: null,
    network_id: 7731,
    key_mgmt: 'WPA2-PSK',
    is_connected: false,
  }

  const mountWith = async (statusInfo: WiFiStatusInfo | null) => {
    const wifi = useWiFiStore()
    wifi.interfaces = [WLAN0]
    wifi.statusInfo = statusInfo
    const wrapper = mountPage()
    await flushPromises()
    return wrapper
  }

  const card = (w: VueWrapper) => {
    const c = w.find('.wifi-status-card')
    expect(c.exists(), 'no Wi-Fi status card').toBe(true)
    return c
  }

  it('is the one card above the panel, in place of the four it replaces', async () => {
    const wrapper = await mountWith(NO_IP)

    const left = wrapper.findAll('.el-col')[0]!
    expect(left.findAll('.wifi-status-card')).toHaveLength(1)
    expect(childTags(left.element)).toHaveLength(2)
    expect(left.element.children[0]!.classList).toContain('wifi-status-card')
    expect(childTags(left.element)[1]).toBe(PANEL_TAG)

    for (const gone of [
      'Interface Health',
      'Wi-Fi Link Status',
      'IP / DHCP',
      'Derived Diagnosis',
    ]) {
      expect(wrapper.text()).not.toContain(gone)
    }
  })

  it('associated without an IP: No IP, and nothing in the card says disconnected', async () => {
    const wrapper = await mountWith(NO_IP)
    const c = card(wrapper)

    expect(c.find('.wifi-status-badge').text()).toBe('No IP')
    expect(c.find('.wifi-status-summary').text()).toBe(
      'wlan0 is connected to “imaoffice1” but has no IP address',
    )
    expect(c.text().toLowerCase()).not.toContain('disconnected')
  })

  it('associated without an IP, in the active locale: 沒有 IP', async () => {
    useUIStore().setLanguage('zh-TW')
    const wrapper = await mountWith(NO_IP)
    const c = card(wrapper)

    expect(c.find('.wifi-status-badge').text()).toBe('沒有 IP')
    expect(c.find('.wifi-status-summary').text()).toBe('wlan0 已連上「imaoffice1」，但沒有取得 IP')
    expect(c.find('.wifi-status-next').text()).toBe('請檢查現場 AP 的 DHCP')
    expect(c.findAll('.wifi-status-layer').map((l) => l.attributes('data-state'))).toEqual([
      'pass',
      'pass',
      'fail',
    ])
  })

  it('does not put the status network_id anywhere on the page', async () => {
    const wrapper = await mountWith(NO_IP)
    // The fixture is in effect: its band and channel are rendered.
    expect(card(wrapper).text()).toContain('5 GHz · channel 36')
    expect(wrapper.html()).not.toContain('7731')
  })

  it('stops auto-refresh when the page unmounts', async () => {
    const wifi = useWiFiStore()
    const setAutoRefresh = vi.spyOn(wifi, 'setAutoRefresh')
    wifi.autoRefreshEnabled = true
    const wrapper = mountPage()
    await flushPromises()
    expect(setAutoRefresh).not.toHaveBeenCalled()

    wrapper.unmount()

    expect(setAutoRefresh).toHaveBeenCalledTimes(1)
    expect(setAutoRefresh).toHaveBeenCalledWith(false)
  })
})

// ==================== Ticket A: what a connect does to this page ====================

const HOTSPOT: WiFiNetwork = {
  ssid: 'ZZ-HOTSPOT',
  signal_strength: 70,
  security: 'wpa2-psk',
  in_use: false,
  bssid: 'aa:bb:cc:dd:ee:ff',
  is_valid: true,
}

/** The Wi-Fi IP the page's store reports; the page host in the fixtures below differs from it. */
const STATUS_IP = '192.168.6.100'

const access = (over: Partial<AccessPath> & Pick<AccessPath, 'kind'>): AccessPath => ({
  ip: STATUS_IP,
  host: '192.168.6.100:8080',
  url: 'http://ecutestenv00.local:8080',
  ...over,
})

describe('DebugNetworkPage: toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
  })

  const toolbarButtons = (w: VueWrapper) => w.findAll('.toolbar button').map((b) => b.text())

  it('labels the refresh control by what it reloads', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(toolbarButtons(wrapper)).toContain(en.debugNetwork.refreshStatusAndScan)
    expect(toolbarButtons(wrapper)).not.toContain(en.common.refresh)
  })

  it('renders the refresh control and no separate Scan button, since refresh already scans', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(toolbarButtons(wrapper)).toEqual([en.debugNetwork.refreshStatusAndScan])
    expect(toolbarButtons(wrapper)).not.toContain('Scan')
  })

  it('labels it in the active locale', async () => {
    useUIStore().setLanguage('zh-TW')
    const wrapper = mountPage()
    await flushPromises()
    expect(toolbarButtons(wrapper)).toContain('重新整理狀態與掃描')
  })

  it('starts the hostname prefetch on mount', async () => {
    mountPage()
    await flushPromises()
    expect(prefetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('DebugNetworkPage: the connect confirmation', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    describeSyncMock.mockReset()
    describeSyncMock.mockReturnValue(access({ kind: 'other-ip' }))
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
    document.body.innerHTML = ''
  })

  afterEach(async () => {
    ElMessageBox.close()
    await flushPromises()
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  /** Mounts on `networks`, clicks the scan row for `network` and types `psk`; Connect is not pressed. */
  const readyToConnect = async (network: WiFiNetwork = HOTSPOT, psk: string | null = 'pw-1') => {
    const wifi = useWiFiStore()
    wifi.networks = [network]
    wifi.statusInfo = {
      interface: 'wlan0',
      ssid: 'imaoffice1',
      ip_address: STATUS_IP,
      is_connected: true,
    }
    const connect = vi.spyOn(wifi, 'connect')
    wrapper = mount(DebugNetworkPage, {
      attachTo: document.body,
      global: { plugins: [ElementPlus], stubs: { ConfiguredWiFiNetworksPanel: true } },
    })
    await flushPromises()

    const row = wrapper.findAll('.el-table__body tr.el-table__row')
    expect(row, 'the scan row did not render').toHaveLength(1)
    await row[0]!.trigger('click')
    await flushPromises()
    if (psk !== null) await wrapper.find('input[type="password"]').setValue(psk)
    return connect
  }

  /** As `readyToConnect`, then presses Connect. */
  const connectThrough = async (network: WiFiNetwork = HOTSPOT, psk: string | null = 'pw-1') => {
    const connect = await readyToConnect(network, psk)
    await connectButton().trigger('click')
    await flushPromises()
    return connect
  }

  /** The connect form's one primary control, in whichever locale is active. */
  const connectButton = () => {
    const button = wrapper!.find('.el-form button.el-button--primary')
    expect(button.exists(), 'no Connect button').toBe(true)
    return button
  }

  /** The open confirmation, or null. A closed one stays in <body> with its overlay hidden. */
  const box = (): HTMLElement | null => {
    const open = [...document.querySelectorAll<HTMLElement>('.connect-confirm')].filter(
      (el) => (el.closest('.el-overlay') as HTMLElement | null)?.style.display !== 'none',
    )
    return open[open.length - 1] ?? null
  }
  const openBox = (): HTMLElement => {
    const b = box()
    expect(b, 'no confirmation is open').not.toBeNull()
    return b!
  }
  const part = (className: string) => openBox().querySelector(`.${className}`)?.textContent ?? null
  const title = () => openBox().querySelector('.el-message-box__title')?.textContent?.trim()
  const buttons = () =>
    [...openBox().querySelectorAll('.el-message-box__btns button')].map((b) =>
      b.textContent!.trim(),
    )
  const confirmButton = () =>
    openBox().querySelector<HTMLButtonElement>('.el-message-box__btns .el-button--primary')!
  const cancelButton = () =>
    openBox().querySelector<HTMLButtonElement>(
      '.el-message-box__btns button:not(.el-button--primary)',
    )!

  it('opens a real confirmation saying the other networks are disabled, and sends nothing yet', async () => {
    const connect = await connectThrough()

    expect(title()).toBe('Connect to “ZZ-HOTSPOT”')
    expect(part('connect-confirm-disables')).toBe(
      'After connecting, every other saved network is disabled, including the factory network.',
    )
    expect(buttons()).toEqual([en.common.cancel, en.wifi.connect])
    expect(connect).not.toHaveBeenCalled()
  })

  it('asks the composable about the Wi-Fi IP the store reports', async () => {
    await connectThrough()
    expect(describeSyncMock).toHaveBeenCalledTimes(1)
    expect(describeSyncMock).toHaveBeenCalledWith(STATUS_IP)
  })

  it('passes null when the store has no status', async () => {
    const wifi = useWiFiStore()
    wifi.networks = [HOTSPOT]
    wrapper = mount(DebugNetworkPage, {
      attachTo: document.body,
      global: { plugins: [ElementPlus], stubs: { ConfiguredWiFiNetworksPanel: true } },
    })
    await flushPromises()
    await wrapper.findAll('.el-table__body tr.el-table__row')[0]!.trigger('click')
    await wrapper.find('input[type="password"]').setValue('pw-1')
    await connectButton().trigger('click')
    await flushPromises()
    expect(describeSyncMock).toHaveBeenCalledWith(null)
  })

  it('wifi-ip: says the page dies and where to reopen it', async () => {
    describeSyncMock.mockReturnValue(access({ kind: 'wifi-ip' }))
    await connectThrough()
    expect(part('connect-confirm-hint')).toBe(
      "You opened this page at 192.168.6.100 (the gateway's Wi-Fi address). Connecting changes that address and this page will stop working. Connect your device to “ZZ-HOTSPOT”, then open http://ecutestenv00.local:8080",
    )
  })

  it('wifi-ip with no URL names the hostname form instead', async () => {
    describeSyncMock.mockReturnValue(access({ kind: 'wifi-ip', url: null }))
    await connectThrough()
    expect(part('connect-confirm-hint')).toBe(
      "You opened this page at 192.168.6.100 (the gateway's Wi-Fi address). Connecting changes that address and this page will stop working. Connect your device to “ZZ-HOTSPOT”, then open the gateway's hostname (<name>.local)",
    )
  })

  it('hostname: says to follow the gateway and reload, the host unchanged', async () => {
    describeSyncMock.mockReturnValue(
      access({ kind: 'hostname', ip: null, host: 'ecutestenv00.local:8080' }),
    )
    await connectThrough()
    expect(part('connect-confirm-hint')).toBe(
      'After connecting, connect your device to “ZZ-HOTSPOT” as well, then reload this page (ecutestenv00.local:8080 stays the same).',
    )
  })

  it('ip-unknown: hedges, and names the URL', async () => {
    describeSyncMock.mockReturnValue(access({ kind: 'ip-unknown', ip: null }))
    await connectThrough()
    expect(part('connect-confirm-hint')).toBe(
      "If you opened this page at the gateway's Wi-Fi address, it will stop working after connecting. Connect your device to “ZZ-HOTSPOT”, then open http://ecutestenv00.local:8080",
    )
  })

  it('ip-unknown with no URL names the hostname form instead', async () => {
    describeSyncMock.mockReturnValue(access({ kind: 'ip-unknown', ip: null, url: null }))
    await connectThrough()
    expect(part('connect-confirm-hint')).toBe(
      "If you opened this page at the gateway's Wi-Fi address, it will stop working after connecting. Connect your device to “ZZ-HOTSPOT”, then open the gateway's hostname (<name>.local)",
    )
  })

  it('other-ip: no hint, only the disable line', async () => {
    describeSyncMock.mockReturnValue(access({ kind: 'other-ip', host: '192.168.1.50:8080' }))
    await connectThrough()
    expect(part('connect-confirm-disables')).not.toBeNull()
    expect(part('connect-confirm-hint')).toBeNull()
  })

  it('renders in the active locale', async () => {
    useUIStore().setLanguage('zh-TW')
    describeSyncMock.mockReturnValue(access({ kind: 'wifi-ip', url: null }))
    await connectThrough()
    expect(title()).toBe('連線到「ZZ-HOTSPOT」')
    expect(part('connect-confirm-disables')).toBe(
      '連線後，其他已儲存的網路都會被停用，包括出廠網路。',
    )
    expect(part('connect-confirm-hint')).toBe(
      '你目前用 192.168.6.100（gateway 的 Wi-Fi 位址）開啟這個頁面。連線後這個位址會改變，此頁會失效。請把你的裝置連到「ZZ-HOTSPOT」，再開啟 gateway 的主機名稱（<名稱>.local）',
    )
    expect(buttons()).toEqual(['取消', '連線'])
  })

  it('shows an SSID that looks like markup as text', async () => {
    await connectThrough({ ...HOTSPOT, ssid: '<b>ZZ-BOLD</b>' })
    expect(title()).toBe('Connect to “<b>ZZ-BOLD</b>”')
    expect(openBox().querySelector('b')).toBeNull()
  })

  it('cancel sends nothing', async () => {
    const connect = await connectThrough()
    cancelButton().click()
    await flushPromises()
    expect(box()).toBeNull()
    expect(connect).not.toHaveBeenCalled()
  })

  it('Escape sends nothing', async () => {
    const connect = await connectThrough()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
    )
    await flushPromises()
    expect(box()).toBeNull()
    expect(connect).not.toHaveBeenCalled()
  })

  it('does not put focus on the confirm button, and Enter sends nothing', async () => {
    const connect = await connectThrough()
    expect(document.activeElement).not.toBe(confirmButton())

    const enter = () => new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })
    document.activeElement!.dispatchEvent(enter())
    await flushPromises()
    document.dispatchEvent(enter())
    await flushPromises()

    expect(connect).not.toHaveBeenCalled()
    expect(box()).not.toBeNull()
  })

  it('confirm sends exactly the request the form built', async () => {
    const connect = await connectThrough()
    confirmButton().click()
    await flushPromises()
    expect(connect).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledWith({
      ssid: 'ZZ-HOTSPOT',
      security: 'wpa2-psk',
      save_config: true,
      psk: 'pw-1',
    })
  })

  it('confirm on an open network sends no passphrase', async () => {
    const connect = await connectThrough(
      { ...HOTSPOT, ssid: 'ZZ-OPEN', security: 'open', bssid: null },
      null,
    )
    confirmButton().click()
    await flushPromises()
    expect(connect).toHaveBeenCalledWith({ ssid: 'ZZ-OPEN', security: 'open', save_config: true })
  })

  it('a missing passphrase stops before the confirmation', async () => {
    const connect = await connectThrough(HOTSPOT, null)
    expect(box()).toBeNull()
    expect(describeSyncMock).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })

  it('a second click while the confirmation is open opens no second one', async () => {
    const connect = await connectThrough()
    await connectButton().trigger('click')
    await flushPromises()
    expect(describeSyncMock).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('.connect-confirm')).toHaveLength(1)

    confirmButton().click()
    await flushPromises()
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('the confirmation is present immediately after the click, with nothing awaited', async () => {
    const connect = await readyToConnect()
    vi.useFakeTimers()
    try {
      // A plain synchronous click: no timer advanced, no promise flushed. Element
      // Plus mounts the box inside confirm() itself, so it is already in <body>.
      ;(connectButton().element as HTMLButtonElement).click()
      expect(document.querySelectorAll('.el-message-box')).toHaveLength(1)
      expect(describeSyncMock).toHaveBeenCalledTimes(1)
      expect(connect).not.toHaveBeenCalled()

      // Its class and message are applied on Vue's next render, which proves
      // the box is this one; nothing of ours is awaited for that.
      await nextTick()
      expect(document.querySelector('.connect-confirm .connect-confirm-disables')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends nothing when a confirmation is confirmed after its page has gone', async () => {
    const connect = await connectThrough()
    openBox()

    wrapper!.unmount()
    wrapper = null
    confirmButton().click()
    await flushPromises()

    expect(connect).not.toHaveBeenCalled()
  })

  describe('with the real composable', () => {
    afterEach(() => {
      realComposable.on = false
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })

    it('a click before the prefetch settles shows the URL-less hint; one after it shows the URL', async () => {
      realComposable.on = true
      vi.stubGlobal('location', new URL('http://192.168.6.100:8080/debug/wifi'))
      let settle: (value: unknown) => void = () => {}
      const lookup = vi
        .spyOn(provisionService, 'getCurrentConfig')
        .mockReturnValue(new Promise((resolve) => (settle = resolve)) as never)

      await connectThrough()
      expect(lookup).toHaveBeenCalledTimes(1)
      expect(part('connect-confirm-hint')).toBe(
        "You opened this page at 192.168.6.100 (the gateway's Wi-Fi address). Connecting changes that address and this page will stop working. Connect your device to “ZZ-HOTSPOT”, then open the gateway's hostname (<name>.local)",
      )
      cancelButton().click()
      await flushPromises()

      settle({ hostname: 'ecutestenv00', reverse_port: 0, port_source: 'service' })
      await flushPromises()
      await connectButton().trigger('click')
      await flushPromises()
      expect(part('connect-confirm-hint')).toBe(
        "You opened this page at 192.168.6.100 (the gateway's Wi-Fi address). Connecting changes that address and this page will stop working. Connect your device to “ZZ-HOTSPOT”, then open http://ecutestenv00.local:8080",
      )
      expect(lookup).toHaveBeenCalledTimes(1)
    })
  })
})

describe('DebugNetworkPage: the connect result', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
  })

  const result = (over: Partial<WiFiConnectResponse> = {}): WiFiConnectResponse => ({
    ssid: 'ZZ-HOTSPOT',
    accepted: false,
    bssid_locked: false,
    saved: false,
    rescue_present: true,
    warnings: [],
    recommended_poll_interval_ms: 1000,
    recommended_timeout_ms: 30000,
    note: null,
    ...over,
  })

  const mountWith = async (res: WiFiConnectResponse, noResponse = false) => {
    const wifi = useWiFiStore()
    wifi.lastConnectResult = res
    wifi.lastConnectNoResponse = noResponse
    const wrapper = mountPage()
    await flushPromises()
    return wrapper
  }

  /**
   * The element carrying Element Plus's own classes. Test utils stub the
   * transition these components render through, and our class lands on the stub.
   */
  const styled = (w: VueWrapper, selector: string, kls: string) => {
    const outer = w.find(selector)
    expect(outer.exists(), `nothing matches ${selector}`).toBe(true)
    return outer.classes().includes(kls) ? outer : outer.find(`.${kls}`)
  }
  const badge = (w: VueWrapper) => styled(w, '.connect-result-badge', 'el-tag')
  const reason = (w: VueWrapper) => styled(w, '.connect-result-reason', 'el-alert')
  /** The connect result card is the last card in the right-hand column. */
  const resultCard = (w: VueWrapper) => w.findAll('.el-col')[1]!.findAll('.el-card').at(-1)!
  const warnings = (w: VueWrapper) =>
    resultCard(w)
      .findAll('.steps li')
      .map((li) => li.text())

  it('no response: Result unknown in neutral styling, not REJECTED, with the reason', async () => {
    // What the store writes when the request timed out.
    const w = await mountWith(result({ note: 'timeout of 45000ms exceeded' }), true)

    expect(badge(w).text()).toBe('Result unknown')
    expect(badge(w).classes()).toContain('el-tag--info')
    expect(badge(w).classes()).not.toContain('el-tag--danger')
    expect(w.text()).not.toContain('REJECTED')
    expect(reason(w).find('.el-alert__title').text()).toBe(en.debugNetwork.connectResultNoResponse)
    expect(reason(w).classes()).toContain('el-alert--info')
    expect(w.text()).not.toContain('timeout of 45000ms exceeded')
  })

  it('no response, in the active locale', async () => {
    useUIStore().setLanguage('zh-TW')
    const w = await mountWith(result({ note: 'timeout of 45000ms exceeded' }), true)
    expect(badge(w).text()).toBe('結果未知')
    expect(reason(w).find('.el-alert__title').text()).toBe(
      '沒有收到回應。如果你是經由 gateway 的 Wi-Fi 開啟此頁，連線切換後失去回應是預期的；請依確認視窗的說明重新開啟頁面，再檢查連線狀態。',
    )
  })

  it('a 200 error body shows its message as the reason', async () => {
    const w = await mountWith(
      result({ status: 'error', message: 'Failed to initiate WiFi connection: boom', note: null }),
    )
    expect(badge(w).text()).toBe('REJECTED')
    expect(reason(w).find('.el-alert__title').text()).toBe(
      'Failed to initiate WiFi connection: boom',
    )
    expect(reason(w).classes()).toContain('el-alert--error')
  })

  it('a note still wins over a message', async () => {
    const w = await mountWith(
      result({ accepted: true, status: 'success', note: 'note-from-talos', message: 'msg-x' }),
    )
    expect(badge(w).text()).toBe('ACCEPTED')
    expect(reason(w).find('.el-alert__title').text()).toBe('note-from-talos')
  })

  it('RESCUE_SSID_MISSING is stated, not shown as a code', async () => {
    const w = await mountWith(result({ accepted: true, warnings: ['RESCUE_SSID_MISSING'] }))
    expect(warnings(w)).toEqual([
      'The gateway has no factory network configured; if the site network fails, it cannot recover automatically through the hotspot.',
    ])
  })

  it('RESCUE_SSID_CREDENTIAL_UNCHANGED is stated, not shown as a code', async () => {
    const w = await mountWith(
      result({ accepted: true, warnings: ['RESCUE_SSID_CREDENTIAL_UNCHANGED'] }),
    )
    expect(warnings(w)).toEqual([
      'This is the factory network, and the gateway keeps its stored password; the password and BSSID lock entered this time were not applied.',
    ])
  })

  it('the codes are stated in the active locale', async () => {
    useUIStore().setLanguage('zh-TW')
    const w = await mountWith(
      result({
        accepted: true,
        warnings: ['RESCUE_SSID_MISSING', 'RESCUE_SSID_CREDENTIAL_UNCHANGED'],
      }),
    )
    expect(warnings(w)).toEqual([
      zhTW.debugNetwork.connectWarningRescueMissing,
      zhTW.debugNetwork.connectWarningRescueCredentialUnchanged,
    ])
    expect(warnings(w)[0]).toBe(
      'gateway 上沒有出廠網路的設定；若現場網路失效，將無法透過熱點自動復原。',
    )
  })

  it('an unknown code is shown verbatim', async () => {
    const w = await mountWith(result({ accepted: true, warnings: ['ZZ_FUTURE_CODE'] }))
    expect(warnings(w)).toEqual(['ZZ_FUTURE_CODE'])
  })
})

// ==================== xs: the phone layout ====================

describe('DebugNetworkPage at xs', () => {
  let wrapper: VueWrapper | null = null

  const INVALID: WiFiNetwork = {
    ssid: 'ZZ-BROKEN',
    signal_strength: 30,
    security: 'wpa2-psk',
    in_use: false,
    is_valid: false,
    invalid_reason: 'SSID is not valid UTF-8 and cannot be written through wpa_cli',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    describeSyncMock.mockReset()
    describeSyncMock.mockReturnValue(access({ kind: 'other-ip' }))
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
    document.body.innerHTML = ''
    media.setWidth(390)
  })

  afterEach(async () => {
    ElMessageBox.close()
    await flushPromises()
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    media.setWidth(1366)
  })

  const mountXs = async (networks: WiFiNetwork[] = [HOTSPOT, INVALID]) => {
    const wifi = useWiFiStore()
    wifi.networks = networks
    wifi.statusInfo = {
      interface: 'wlan0',
      ssid: 'imaoffice1',
      wpa_state: 'COMPLETED',
      ip_address: STATUS_IP,
      is_connected: true,
    }
    wrapper = mount(DebugNetworkPage, {
      attachTo: document.body,
      global: { plugins: [ElementPlus], stubs: { ConfiguredWiFiNetworksPanel: true } },
    })
    await flushPromises()
    return wifi
  }

  const w = () => wrapper!
  const sheetOpen = () => w().findComponent(ElDrawer).props('modelValue')
  const sheet = () => w().find('.connect-sheet')
  const rowFor = (ssid: string) => {
    const row = w()
      .findAll('.wifi-network-row')
      .find((r) => r.find('.wifi-network-ssid').text() === ssid)
    expect(row, `no row for ${ssid}`).toBeDefined()
    return row!
  }
  const passwordInputs = () => document.querySelectorAll('input[type="password"]')
  /** Taps the row for `network` and types `psk` into the sheet. */
  const openSheet = async (network: WiFiNetwork = HOTSPOT, psk = 'pw-1') => {
    await rowFor(network.ssid).trigger('click')
    await flushPromises()
    await sheet().find('input[type="password"]').setValue(psk)
  }
  const sheetConnect = () => sheet().find('.el-form button.el-button--primary')
  const confirmBox = () =>
    [...document.querySelectorAll<HTMLElement>('.connect-confirm')].filter(
      (el) => (el.closest('.el-overlay') as HTMLElement | null)?.style.display !== 'none',
    )
  const confirm = async () => {
    expect(confirmBox(), 'no confirmation is open').toHaveLength(1)
    confirmBox()[0]!
      .querySelector<HTMLButtonElement>('.el-message-box__btns .el-button--primary')!
      .click()
    await flushPromises()
  }

  it('renders one column: no el-col, the summary row, the list and the collapsed panel', async () => {
    await mountXs()
    expect(w().findAll('.el-col')).toHaveLength(0)
    expect(w().find('.wifi-summary-row').exists()).toBe(true)
    expect(w().findAll('.wifi-network-row')).toHaveLength(2)
    // Mounted, so it still loads on arrival, inside a collapse that starts closed.
    expect(w().findComponent(ConfiguredWiFiNetworksPanel).exists()).toBe(true)
    expect(w().find('.configured-collapse .el-collapse-item.is-active').exists()).toBe(false)
    expect(w().find('.toolbar').exists()).toBe(true)
  })

  it('tapping the summary row expands the status card, given the very same status object', async () => {
    await mountXs()
    expect(w().findComponent(WiFiStatusCard).exists()).toBe(false)
    await w().find('.wifi-summary-row').trigger('click')
    const card = w().findComponent(WiFiStatusCard)
    expect(card.exists()).toBe(true)
    expect(card.props('status')).toBe(w().findComponent(WiFiSummaryRow).props('status'))
    expect(card.props('detailsColumns')).toBe(1)
  })

  /**
   * The dialog's accessible name from aria-labelledby or aria-label, as App.test.ts
   * reads the navigation drawer's. aria-labelledby wins when present, so every id it
   * lists must resolve to an element with text: a dangling reference fails here rather
   * than silently falling back to aria-label.
   */
  const accessibleName = (dialog: Element): string => {
    const labelledBy = dialog.getAttribute('aria-labelledby')
    if (labelledBy) {
      return labelledBy
        .split(/\s+/)
        .map((id) => {
          const label = document.getElementById(id)
          expect(label, `aria-labelledby points at #${id}, which does not exist`).not.toBeNull()
          return label!.textContent!.trim()
        })
        .join(' ')
        .trim()
    }
    return dialog.getAttribute('aria-label')?.trim() ?? ''
  }

  it.each([
    ['en', en],
    ['zh-TW', zhTW],
  ] as const)('names the open sheet by its title (%s)', async (lang, messages) => {
    useUIStore().setLanguage(lang)
    await mountXs()
    await rowFor('ZZ-HOTSPOT').trigger('click')
    await flushPromises()
    expect(sheetOpen()).toBe(true)

    const dialogs = document.querySelectorAll('[role="dialog"]')
    expect(dialogs).toHaveLength(1)
    const name = accessibleName(dialogs[0]!)

    expect(name).not.toBe('')
    expect(name).toBe(messages.debugNetwork.connect)
    expect(name).toBe(sheet().find('.el-drawer__header .el-drawer__title').text())
  })

  it('tapping a network opens the sheet with that SSID', async () => {
    await mountXs()
    expect(sheetOpen()).toBe(false)
    await rowFor('ZZ-HOTSPOT').trigger('click')
    await flushPromises()
    expect(sheetOpen()).toBe(true)
    expect(sheet().find('.el-drawer__header').text()).toContain('ZZ-HOTSPOT')
    expect(sheet().find('input[readonly]').element).toHaveProperty('value', 'ZZ-HOTSPOT')
  })

  it('runs the confirmation before wifi.connect, and sends the request the form built', async () => {
    const wifi = await mountXs()
    const connect = vi.spyOn(wifi, 'connect')
    await openSheet()
    await sheetConnect().trigger('click')
    await flushPromises()
    expect(confirmBox()).toHaveLength(1)
    expect(connect).not.toHaveBeenCalled()

    await confirm()
    expect(connect).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledWith({
      ssid: 'ZZ-HOTSPOT',
      security: 'wpa2-psk',
      save_config: true,
      psk: 'pw-1',
    })
  })

  it('an invalid network shows its invalid_reason on the row, with no hover, and opens nothing', async () => {
    await mountXs()
    const row = rowFor('ZZ-BROKEN')
    // In the row's own text: a tooltip's content is not, until something hovers it.
    expect(row.text()).toContain(INVALID.invalid_reason)
    expect(row.find('.el-tooltip__trigger').exists()).toBe(false)
    expect(row.element.tagName).toBe('DIV')
    expect(row.attributes('aria-disabled')).toBe('true')

    await row.trigger('click')
    await flushPromises()
    expect(sheetOpen()).toBe(false)
    expect(w().findComponent(WiFiConnectForm).exists()).toBe(false)
  })

  it('has one password input in the DOM at any tier', async () => {
    await mountXs()
    await openSheet()
    expect(passwordInputs()).toHaveLength(1)

    media.setWidth(1366)
    await flushPromises()
    expect(w().findAll('.el-col')).toHaveLength(2)
    expect(passwordInputs()).toHaveLength(1)
    // The selection and the typed password carried over to the inline form.
    expect((passwordInputs()[0] as HTMLInputElement).value).toBe('pw-1')

    media.setWidth(390)
    await flushPromises()
    expect(sheetOpen()).toBe(true)
    expect(passwordInputs()).toHaveLength(1)
  })

  it.each([
    ['still listing it', () => [{ ...HOTSPOT, signal_strength: 12 }]],
    ['no longer listing it', () => [{ ...HOTSPOT, ssid: 'ZZ-OTHER' }]],
  ])('a rescan %s keeps the sheet, the SSID and the typed password', async (_name, next) => {
    const wifi = await mountXs()
    const connect = vi.spyOn(wifi, 'connect')
    await openSheet()

    wifi.networks = next()
    await flushPromises()

    expect(sheetOpen()).toBe(true)
    expect(sheet().find('.el-drawer__header').text()).toContain('ZZ-HOTSPOT')
    expect(sheet().find<HTMLInputElement>('input[type="password"]').element.value).toBe('pw-1')
    await sheetConnect().trigger('click')
    await flushPromises()
    await confirm()
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ ssid: 'ZZ-HOTSPOT', psk: 'pw-1' }),
    )
  })

  it('a failed rescan, which empties the list, keeps the sheet, the SSID and the typed password', async () => {
    const wifi = await mountXs()
    const connect = vi.spyOn(wifi, 'connect')
    await openSheet()

    // What the store's scan() does on an error.
    wifi.scanError = 'timeout of 20000ms exceeded'
    wifi.lastScanOk = false
    wifi.networks = []
    wifi.scanTotalCount = 0
    await flushPromises()

    expect(w().findAll('.wifi-network-row')).toHaveLength(0)
    expect(sheetOpen()).toBe(true)
    expect(sheet().find('.el-drawer__header').text()).toContain('ZZ-HOTSPOT')
    expect(sheet().find<HTMLInputElement>('input[type="password"]').element.value).toBe('pw-1')
    await sheetConnect().trigger('click')
    await flushPromises()
    await confirm()
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ ssid: 'ZZ-HOTSPOT', psk: 'pw-1' }),
    )
  })

  describe('after the connect', () => {
    const response = (accepted: boolean): WiFiConnectResponse => ({
      ssid: 'ZZ-HOTSPOT',
      accepted,
      bssid_locked: false,
      saved: true,
      rescue_present: true,
      warnings: [],
      recommended_poll_interval_ms: 1000,
      recommended_timeout_ms: 30000,
      note: accepted ? null : 'wrong password',
    })

    /** Connects through the sheet, with the store answering as `answer` says. */
    const connectAnswered = async (answer: WiFiConnectResponse, noResponse: boolean) => {
      const wifi = await mountXs()
      vi.spyOn(wifi, 'connect').mockImplementation(async () => {
        wifi.lastConnectResult = answer
        wifi.lastConnectNoResponse = noResponse
        return noResponse ? null : answer
      })
      await openSheet()
      await sheetConnect().trigger('click')
      await flushPromises()
      await confirm()
    }

    const badgeIn = (selector: string) => {
      const outer = w().find(`${selector} .connect-result-badge`)
      return outer.exists() ? outer.text() : null
    }

    it('a definite rejection keeps the sheet open with the password, and shows the result in it', async () => {
      await connectAnswered(response(false), false)
      expect(sheetOpen()).toBe(true)
      expect(sheet().find<HTMLInputElement>('input[type="password"]').element.value).toBe('pw-1')
      expect(badgeIn('.connect-sheet')).toBe('REJECTED')
      expect(sheet().find('.connect-result-reason').text()).toContain('wrong password')
      // One place at a time.
      expect(w().find('.connect-result-page').exists()).toBe(false)
      expect(w().findAll('.connect-result-badge')).toHaveLength(1)
    })

    it('an acceptance closes the sheet and shows the result under the summary row', async () => {
      await connectAnswered(response(true), false)
      expect(sheetOpen()).toBe(false)
      expect(w().findComponent(WiFiConnectForm).exists()).toBe(false)
      expect(badgeIn('.connect-result-page')).toBe('ACCEPTED')
      expect(w().findAll('.connect-result-badge')).toHaveLength(1)
      // Directly under the summary row (the status card is collapsed).
      expect(w().find('.wifi-summary-row + .connect-result-page').exists()).toBe(true)
    })

    it('no response closes the sheet and shows "Result unknown" under the summary row', async () => {
      await connectAnswered({ ...response(false), note: 'timeout of 45000ms exceeded' }, true)
      expect(sheetOpen()).toBe(false)
      expect(w().findComponent(WiFiConnectForm).exists()).toBe(false)
      expect(badgeIn('.connect-result-page')).toBe(en.debugNetwork.connectResultUnknown)
      expect(w().findAll('.connect-result-badge')).toHaveLength(1)
    })

    describe('a completion for a network whose sheet was closed meanwhile', () => {
      const OTHER: WiFiNetwork = { ...HOTSPOT, ssid: 'ZZ-OTHER', bssid: null }

      /**
       * Starts a connect to HOTSPOT that stays pending and closes its sheet. Returns
       * what settles HOTSPOT's connect.
       */
      const pendingThenClose = async (answer: WiFiConnectResponse, noResponse: boolean) => {
        const wifi = await mountXs([HOTSPOT, OTHER])
        let settle = () => {}
        vi.spyOn(wifi, 'connect').mockImplementation(
          () =>
            new Promise((resolve) => {
              settle = () => {
                wifi.lastConnectResult = answer
                wifi.lastConnectNoResponse = noResponse
                resolve(noResponse ? null : answer)
              }
            }),
        )
        await openSheet(HOTSPOT, 'pw-a')
        await sheetConnect().trigger('click')
        await flushPromises()
        await confirm()

        await sheet().find('.el-drawer__close-btn').trigger('click')
        await flushPromises()
        expect(sheetOpen(), 'the sheet closes while the connect is pending').toBe(false)
        return async () => {
          settle()
          await flushPromises()
        }
      }

      /** As `pendingThenClose`, then opens `reopen`'s sheet with `psk` typed. */
      const pendingThenReopen = async (
        answer: WiFiConnectResponse,
        noResponse: boolean,
        reopen: WiFiNetwork,
        psk: string,
      ) => {
        const settle = await pendingThenClose(answer, noResponse)
        await openSheet(reopen, psk)
        expect(sheet().find('.el-drawer__header').text()).toContain(reopen.ssid)
        return settle
      }

      const OUTCOMES = [
        ['accepted', response(true), false, 'ACCEPTED'],
        ['definitely rejected', response(false), false, 'REJECTED'],
        [
          'unanswered',
          { ...response(false), note: 'timeout of 45000ms exceeded' },
          true,
          en.debugNetwork.connectResultUnknown,
        ],
      ] as const

      it.each(OUTCOMES)(
        "%s: the other network's sheet, selection and password stay; the result shows under the summary row",
        async (_outcome, answer, noResponse, badge) => {
          const settle = await pendingThenReopen(answer, noResponse, OTHER, 'pw-b')
          await settle()

          expect(sheetOpen()).toBe(true)
          expect(sheet().find('.el-drawer__header').text()).toContain('ZZ-OTHER')
          expect(sheet().find<HTMLInputElement>('input[readonly]').element.value).toBe('ZZ-OTHER')
          expect(sheet().find<HTMLInputElement>('input[type="password"]').element.value).toBe(
            'pw-b',
          )
          expect(badgeIn('.connect-result-page')).toBe(badge)
          // Nothing of HOTSPOT's connect is inside ZZ-OTHER's sheet.
          expect(sheet().find('.connect-result-badge').exists()).toBe(false)
          expect(sheet().text()).not.toContain('ZZ-HOTSPOT')
        },
      )

      it.each(OUTCOMES)(
        '%s: a sheet reopened on the same network keeps its new password; the result shows under the summary row',
        async (_outcome, answer, noResponse, badge) => {
          const settle = await pendingThenReopen(answer, noResponse, HOTSPOT, 'pw-new')
          await settle()

          expect(sheetOpen()).toBe(true)
          expect(sheet().find<HTMLInputElement>('input[readonly]').element.value).toBe('ZZ-HOTSPOT')
          expect(sheet().find<HTMLInputElement>('input[type="password"]').element.value).toBe(
            'pw-new',
          )
          expect(badgeIn('.connect-result-page')).toBe(badge)
          // The first request's result is not inside the reopened sheet.
          expect(sheet().find('.connect-result-badge').exists()).toBe(false)
          expect(sheet().find('.connect-result-reason').exists()).toBe(false)
        },
      )

      it.each(OUTCOMES)(
        '%s, with the sheet left closed: the result shows under the summary row, brought into view',
        async (_outcome, answer, noResponse, badge) => {
          // jsdom has no scrollIntoView; the page calls it to bring the result into view.
          const scrolled = vi.fn()
          Element.prototype.scrollIntoView = scrolled
          try {
            const settle = await pendingThenClose(answer, noResponse)
            await settle()

            expect(sheetOpen()).toBe(false)
            expect(badgeIn('.connect-result-page')).toBe(badge)
            expect(w().find('.connect-result-sheet').exists()).toBe(false)
            const pageResult = w().find('.connect-result-page').element
            expect(
              scrolled.mock.contexts,
              'the result under the summary row is scrolled to',
            ).toContain(pageResult)
          } finally {
            delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
          }
        },
      )
    })

    // Previously broken cells of the state × event table: a tier change while a connect
    // is pending, a finished inline form rotated onto a phone (D3), and an unmount.
    describe('across a tier change, and an unmount', () => {
      const FINISHED = [
        ['accepted', response(true), false, 'ACCEPTED'],
        [
          'unanswered',
          { ...response(false), note: 'timeout of 45000ms exceeded' },
          true,
          en.debugNetwork.connectResultUnknown,
        ],
      ] as const

      /** Makes `wifi.connect` hang until the returned function answers it. */
      const holdConnect = (wifi: ReturnType<typeof useWiFiStore>) => {
        let release = () => {}
        vi.spyOn(wifi, 'connect').mockImplementation(
          () =>
            new Promise((resolve) => {
              release = () => resolve(null)
            }),
        )
        return async (answer: WiFiConnectResponse, noResponse: boolean) => {
          wifi.lastConnectResult = answer
          wifi.lastConnectNoResponse = noResponse
          release()
          await flushPromises()
        }
      }

      const rotate = async (width: number) => {
        media.setWidth(width)
        await flushPromises()
      }

      /** Sends a connect to HOTSPOT from the sheet at xs, with 'pw-1'. */
      const sendFromSheet = async () => {
        await openSheet(HOTSPOT, 'pw-1')
        await sheetConnect().trigger('click')
        await flushPromises()
        await confirm()
      }

      /** Sends a connect to HOTSPOT from the inline form at sm+, with 'pw-1'. */
      const sendInline = async () => {
        const row = w()
          .findAll('.el-table__body tr.el-table__row')
          .find((r) => r.text().includes('ZZ-HOTSPOT'))
        expect(row, 'no scan row for ZZ-HOTSPOT').toBeDefined()
        await row!.trigger('click')
        await flushPromises()
        await w().find('.el-form input[type="password"]').setValue('pw-1')
        await w().find('.el-form button.el-button--primary').trigger('click')
        await flushPromises()
        await confirm()
      }

      const inlineForm = () => w().findComponent(WiFiConnectForm)
      const passwordValue = () =>
        (document.querySelector('input[type="password"]') as HTMLInputElement | null)?.value ?? null

      it.each(FINISHED)(
        'D1 · %s, sent from the sheet, settling at 1366: the inline form goes; back on a phone, no sheet and the result under the summary row',
        async (_outcome, answer, noResponse, badge) => {
          const answerWith = holdConnect(await mountXs())
          await sendFromSheet()
          await rotate(1366)
          expect(inlineForm().exists(), 'the pending opening is shown inline').toBe(true)

          await answerWith(answer, noResponse)
          expect(inlineForm().exists(), 'no form stays for a finished connect').toBe(false)
          expect(w().find('.connect-result-badge').text()).toBe(badge)

          await rotate(390)
          expect(sheetOpen()).toBe(false)
          expect(badgeIn('.connect-result-page')).toBe(badge)
          expect(w().find('.connect-result-sheet').exists()).toBe(false)
        },
      )

      it('D1 · rejected, sent from the sheet, settling at 1366: the form and password stay; back on a phone, the sheet has the result', async () => {
        const answerWith = holdConnect(await mountXs())
        await sendFromSheet()
        await rotate(1366)

        await answerWith(response(false), false)
        expect(inlineForm().exists()).toBe(true)
        expect(passwordValue()).toBe('pw-1')
        expect(w().find('.connect-result-badge').text()).toBe('REJECTED')

        await rotate(390)
        expect(sheetOpen()).toBe(true)
        expect(badgeIn('.connect-result-sheet')).toBe('REJECTED')
        expect(w().find('.connect-result-page').exists()).toBe(false)
        expect(passwordValue()).toBe('pw-1')
      })

      it.each(FINISHED)(
        'D2 · %s, sent inline at 1366, settling at 390: the sheet closes; the result under the summary row',
        async (_outcome, answer, noResponse, badge) => {
          media.setWidth(1366)
          const answerWith = holdConnect(await mountXs())
          await sendInline()
          await rotate(390)
          expect(sheetOpen(), 'the pending opening is shown as the sheet').toBe(true)

          await answerWith(answer, noResponse)
          expect(sheetOpen()).toBe(false)
          expect(inlineForm().exists()).toBe(false)
          expect(badgeIn('.connect-result-page')).toBe(badge)
        },
      )

      it('D2 · rejected, sent inline at 1366, settling at 390: the sheet stays with the password and the result', async () => {
        media.setWidth(1366)
        const answerWith = holdConnect(await mountXs())
        await sendInline()
        await rotate(390)

        await answerWith(response(false), false)
        expect(sheetOpen()).toBe(true)
        expect(badgeIn('.connect-result-sheet')).toBe('REJECTED')
        expect(w().find('.connect-result-page').exists()).toBe(false)
        expect(passwordValue()).toBe('pw-1')
      })

      it.each(FINISHED)(
        'there and back · %s, sent from the sheet, rotated to 1366 and back before it settles: the sheet closes',
        async (_outcome, answer, noResponse, badge) => {
          const answerWith = holdConnect(await mountXs())
          await sendFromSheet()
          await rotate(1366)
          await rotate(390)
          expect(sheetOpen(), 'the same opening, shown as the sheet again').toBe(true)

          await answerWith(answer, noResponse)
          expect(sheetOpen()).toBe(false)
          expect(badgeIn('.connect-result-page')).toBe(badge)
        },
      )

      it('there and back · rejected: the sheet stays with the password and the result', async () => {
        const answerWith = holdConnect(await mountXs())
        await sendFromSheet()
        await rotate(1366)
        await rotate(390)

        await answerWith(response(false), false)
        expect(sheetOpen()).toBe(true)
        expect(badgeIn('.connect-result-sheet')).toBe('REJECTED')
        expect(passwordValue()).toBe('pw-1')
      })

      it.each(FINISHED)(
        'D3 · %s at 1366 keeps the inline form, as today; rotated onto a phone, no sheet opens',
        async (_outcome, answer, noResponse, badge) => {
          media.setWidth(1366)
          const answerWith = holdConnect(await mountXs())
          await sendInline()
          await answerWith(answer, noResponse)
          expect(inlineForm().exists(), 'sm+ unchanged: the form stays').toBe(true)
          expect(passwordValue()).toBe('pw-1')

          await rotate(390)
          expect(sheetOpen()).toBe(false)
          expect(passwordValue()).toBeNull()
          expect(badgeIn('.connect-result-page')).toBe(badge)
        },
      )

      it('D3 · a rejection at 1366, rotated onto a phone: the sheet opens with the password and the result', async () => {
        media.setWidth(1366)
        const answerWith = holdConnect(await mountXs())
        await sendInline()
        await answerWith(response(false), false)

        await rotate(390)
        expect(sheetOpen()).toBe(true)
        expect(passwordValue()).toBe('pw-1')
        expect(badgeIn('.connect-result-sheet')).toBe('REJECTED')
      })

      it('unmount while pending: on return, the result is under the summary row and no sheet is open', async () => {
        const wifi = await mountXs()
        const answerWith = holdConnect(wifi)
        await sendFromSheet()
        wrapper!.unmount()
        wrapper = null

        await answerWith(response(true), false)
        await mountXs()
        expect(sheetOpen()).toBe(false)
        expect(badgeIn('.connect-result-page')).toBe('ACCEPTED')
        expect(w().find('.connect-result-sheet').exists()).toBe(false)
      })
    })
  })
})
