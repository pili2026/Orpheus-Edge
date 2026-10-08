import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

import WiFiSummaryRow from '@/components/wifi/WiFiSummaryRow.vue'
import WiFiStatusCard from '@/components/wifi/WiFiStatusCard.vue'
import { useUIStore } from '@/stores/ui'
import { deriveWifiStatus, type WifiStatus, type WifiStatusInput } from '@/utils/wifi_status'
import type { WiFiInterfaceInfo, WiFiStatusInfo } from '@/services/wifi'

// The fixtures WiFiStatusCard.test.ts and DebugNetworkPage.test.ts use, so the row is
// held to the card on every verdict the card itself is tested on.
const WLAN0: WiFiInterfaceInfo = {
  ifname: 'wlan0',
  is_wireless: true,
  is_up: true,
  is_default: true,
  mac: '02:00:00:aa:bb:cc',
  driver: 'rtl8xxxu',
  phy: 'phy0',
}

const CONNECTED: WiFiStatusInfo = {
  interface: 'wlan0',
  ssid: 'imaoffice1',
  bssid: '11:22:33:44:55:66',
  freq: 2437,
  wpa_state: 'COMPLETED',
  ip_address: '192.168.6.100',
  key_mgmt: 'WPA2-PSK',
  is_connected: true,
}

const SCANNING: WiFiStatusInfo = {
  interface: 'wlan0',
  wpa_state: 'SCANNING',
  is_connected: false,
}

/** DebugNetworkPage.test.ts's NO_IP: associated without an IP. */
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

const derive = (over: Partial<WifiStatusInput> = {}): WifiStatus =>
  deriveWifiStatus({
    selectedIfname: 'wlan0',
    interfaces: [WLAN0],
    interfacesError: '',
    interfacesLoading: false,
    statusInfo: CONNECTED,
    statusError: '',
    networksCount: 3,
    lastScanOk: true,
    ...over,
  })

const FIXTURES: Array<[string, Partial<WifiStatusInput>]> = [
  ['OK', {}],
  ['L1', { selectedIfname: 'wlan9' }],
  ['L2', { statusInfo: SCANNING }],
  ['L2, empty scan', { statusInfo: SCANNING, networksCount: 0 }],
  ['L3', { statusInfo: { ...CONNECTED, ip_address: null } }],
  ['L3, the page fixture', { statusInfo: NO_IP }],
  ['unknown', { statusInfo: null }],
  ['unknown, read error', { statusInfo: null, statusError: 'timeout of 15000ms exceeded' }],
]

/** The element carrying Element Plus's own classes; the transition stub may wrap it. */
const tag = (w: VueWrapper, selector: string) => {
  const outer = w.find(selector)
  expect(outer.exists(), `nothing matches ${selector}`).toBe(true)
  return outer.classes().includes('el-tag') ? outer : outer.find('.el-tag')
}
const tagType = (w: VueWrapper, selector: string) =>
  tag(w, selector)
    .classes()
    .filter((c) => /^el-tag--(success|info|warning|danger|primary)$/.test(c))

/** What the row's one line shows; null for a part it does not render. */
const rowLine = (w: VueWrapper) => {
  const text = (selector: string) => {
    const el = w.find(selector)
    return el.exists() ? el.text() : null
  }
  return {
    ssid: text('.wifi-summary-row-ssid'),
    ip: text('.wifi-summary-row-ip'),
    summary: text('.wifi-summary-row-summary'),
  }
}

const mountBoth = (status: WifiStatus) => ({
  row: mount(WiFiSummaryRow, {
    props: { status, expanded: false },
    global: { plugins: [ElementPlus] },
  }),
  card: mount(WiFiStatusCard, { props: { status }, global: { plugins: [ElementPlus] } }),
})

describe('WiFiSummaryRow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
  })

  it.each(FIXTURES)('%s: the same badge, colour and summary as the status card', (_name, over) => {
    const status = derive(over)
    const { row, card } = mountBoth(status)

    expect(tag(row, '.wifi-summary-row-badge').text()).toBe(tag(card, '.wifi-status-badge').text())
    const type = tagType(card, '.wifi-status-badge')
    expect(type).toHaveLength(1)
    expect(tagType(row, '.wifi-summary-row-badge')).toEqual(type)
    // The icon is coloured by the same type as the badge.
    expect(row.find('.wifi-summary-row').classes()).toContain(
      `is-${type[0]!.replace('el-tag--', '')}`,
    )

    // The SSID and IP the verdict carries; without an SSID, the card's summary.
    const values = status.summary.values
    const cardSummary = card.find('.wifi-status-summary').text()
    const line = rowLine(row)
    expect(line).toEqual(
      values.ssid
        ? { ssid: String(values.ssid), ip: values.ip ? String(values.ip) : null, summary: null }
        : { ssid: null, ip: null, summary: cardSummary },
    )
    // Whatever the row names, the card's summary names too.
    for (const named of [line.ssid, line.ip].filter((x) => x !== null)) {
      expect(cardSummary).toContain(named)
    }
  })

  it('says whether it is expanded, and asks to toggle when tapped', async () => {
    const w = mount(WiFiSummaryRow, {
      props: { status: derive(), expanded: false },
      global: { plugins: [ElementPlus] },
    })
    const button = w.find('button.wifi-summary-row')
    expect(button.attributes('aria-expanded')).toBe('false')
    await button.trigger('click')
    expect(w.emitted('toggle')).toHaveLength(1)
    await w.setProps({ expanded: true })
    expect(button.attributes('aria-expanded')).toBe('true')
  })

  it('renders in the active locale', () => {
    useUIStore().setLanguage('zh-TW')
    const { row } = mountBoth(derive({ statusInfo: SCANNING }))
    expect(row.text()).toContain('目前連線')
    expect(tag(row, '.wifi-summary-row-badge').text()).toBe('未連上 AP')
    expect(row.find('.wifi-summary-row-summary').text()).toBe('wlan0 沒有連上 AP')
  })
})
