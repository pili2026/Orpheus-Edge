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
import en from '@/locales/en'

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
    expect(above?.textContent).toContain(en.debugNetwork.diagnosis)

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
