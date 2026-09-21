import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

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
        scanError: '',
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

import DebugNetworkPage from '@/views/debug/DebugNetworkPage.vue'
import ConfiguredWiFiNetworksPanel from '@/components/wifi/ConfiguredWiFiNetworksPanel.vue'
import { useUIStore } from '@/stores/ui'

// The panel is the one child stubbed: its behaviour has its own suite, and what
// this file protects is that the page still mounts it at all. Element Plus
// renders for real -- the page's own cards need their slots to render, and a
// blanket shallow mount strips the scoped slots its tables rely on.
const mountPage = () =>
  mount(DebugNetworkPage, {
    global: { plugins: [ElementPlus], stubs: { ConfiguredWiFiNetworksPanel: true } },
  })

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

  it('places the panel above the scan list, and not between it and the connect form', async () => {
    const wrapper = mountPage()
    await flushPromises()

    // Right-hand column, in document order.
    const columns = wrapper.findAll('.el-col')
    expect(columns.length, 'the page no longer has two columns').toBe(2)

    const order = Array.from(columns[1]!.element.children).map((el) => el.tagName.toLowerCase())
    const panelAt = order.indexOf('configured-wi-fi-networks-panel-stub')
    expect(panelAt, 'the panel is not a direct child of the right-hand column').toBeGreaterThan(-1)
    // First, so it is above the scan list. Clicking a scan row fills the
    // connect form, so nothing may be wedged between those two.
    expect(panelAt).toBe(0)
  })
})
