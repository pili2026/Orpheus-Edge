import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

import WiFiStatusCard from '@/components/wifi/WiFiStatusCard.vue'
import { useUIStore } from '@/stores/ui'
import { deriveWifiStatus, type WifiStatusInput } from '@/utils/wifi_status'
import type { WiFiInterfaceInfo, WiFiStatusInfo } from '@/services/wifi'
import en from '@/locales/en'

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

const mountWith = (over: Partial<WifiStatusInput> = {}, detailsColumns?: 1 | 2) =>
  mount(WiFiStatusCard, {
    props: {
      ...(detailsColumns ? { detailsColumns } : {}),
      status: deriveWifiStatus({
        selectedIfname: 'wlan0',
        interfaces: [WLAN0],
        interfacesError: '',
        interfacesLoading: false,
        statusInfo: CONNECTED,
        statusError: '',
        networksCount: 3,
        lastScanOk: true,
        ...over,
      }),
    },
    global: { plugins: [ElementPlus] },
  })

/** The element carrying Element Plus's own classes; the transition stub may wrap it. */
const badge = (w: VueWrapper) => {
  const outer = w.find('.wifi-status-badge')
  expect(outer.exists(), 'no badge').toBe(true)
  return outer.classes().includes('el-tag') ? outer : outer.find('.el-tag')
}

const layers = (w: VueWrapper) =>
  w.findAll('.wifi-status-layer').map((l) => ({
    state: l.attributes('data-state'),
    name: l.find('.wifi-status-layer-name').text(),
    detail: l.find('.wifi-status-layer-detail').exists()
      ? l.find('.wifi-status-layer-detail').text()
      : null,
    label: l.find('.wifi-status-layer-icon').attributes('aria-label'),
  }))

describe('WiFiStatusCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
  })

  it('has the card class on its root, and the title', () => {
    const w = mountWith()
    expect(w.classes()).toContain('card')
    expect(w.find('.card-header').text()).toContain(en.debugNetwork.wifiStatus.title)
  })

  it('OK: success badge, three passing layers, no next step, the details', () => {
    const w = mountWith()
    expect(badge(w).text()).toBe('OK')
    expect(badge(w).classes()).toContain('el-tag--success')
    expect(w.find('.wifi-status-summary').text()).toBe(
      'wlan0 is connected to “imaoffice1”, IP 192.168.6.100',
    )
    expect(layers(w)).toEqual([
      {
        state: 'pass',
        name: 'Interface',
        detail: 'wlan0 · default interface',
        label: 'Pass',
      },
      {
        state: 'pass',
        name: 'Connected to AP',
        detail: 'imaoffice1 · WPA2-PSK',
        label: 'Pass',
      },
      { state: 'pass', name: 'IP address obtained', detail: '192.168.6.100', label: 'Pass' },
    ])
    expect(w.find('.wifi-status-next').exists()).toBe(false)
    expect(w.find('.wifi-status-scan-hint').exists()).toBe(false)

    const details = w.find('.wifi-status-details').text()
    for (const shown of [
      'BSSID',
      '11:22:33:44:55:66',
      'Band / channel',
      '2.4 GHz · channel 6',
      'wpa_state',
      'COMPLETED',
      '02:00:00:aa:bb:cc',
      'rtl8xxxu · phy0',
      'Interface state',
      'Up',
    ]) {
      expect(details).toContain(shown)
    }
  })

  it.each([
    ['L1', { selectedIfname: 'wlan9' }, 'Interface fault'],
    ['L2', { statusInfo: SCANNING }, 'Not connected to AP'],
    ['L3', { statusInfo: { ...CONNECTED, ip_address: null } }, 'No IP'],
  ] as const)('%s: danger badge', (_label, over, text) => {
    const w = mountWith(over)
    expect(badge(w).text()).toBe(text)
    expect(badge(w).classes()).toContain('el-tag--danger')
  })

  it('unknown: neutral badge and the loading next step', () => {
    const w = mountWith({ statusInfo: null })
    expect(badge(w).text()).toBe('Status unknown')
    expect(badge(w).classes()).toContain('el-tag--info')
    expect(badge(w).classes()).not.toContain('el-tag--danger')
    expect(w.find('.wifi-status-next').text()).toBe('Loading…')
    expect(layers(w).map((l) => l.state)).toEqual(['pass', 'unknown', 'skipped'])
    expect(layers(w).map((l) => l.label)).toEqual(['Pass', 'Unknown', 'Skipped'])
    expect(w.find('.wifi-status-details').exists()).toBe(false)
  })

  it('unknown with a read error names it', () => {
    const w = mountWith({ statusInfo: null, statusError: 'timeout of 15000ms exceeded' })
    expect(w.find('.wifi-status-next').text()).toBe(
      'Cannot read the Wi-Fi status: timeout of 15000ms exceeded',
    )
  })

  it('L2: wpa_state on the layer and in the next step, with the scan hint', () => {
    const w = mountWith({ statusInfo: SCANNING })
    expect(layers(w)[1]).toEqual({
      state: 'fail',
      name: 'Connected to AP',
      detail: 'wpa_state: SCANNING',
      label: 'Fail',
    })
    expect(w.find('.wifi-status-next').text()).toBe(
      'The gateway is not connected to any AP (wpa_state: SCANNING). Check that the site network is saved and in range',
    )
    expect(w.find('.wifi-status-scan-hint').text()).toBe('3 Wi-Fi networks nearby')
  })

  it('L2 after an empty successful scan', () => {
    const w = mountWith({ statusInfo: SCANNING, networksCount: 0 })
    expect(w.find('.wifi-status-scan-hint').text()).toBe('No Wi-Fi networks detected nearby')
  })

  it('renders in the active locale', () => {
    useUIStore().setLanguage('zh-TW')
    const w = mountWith({ statusInfo: SCANNING, networksCount: 0 })
    expect(w.find('.card-header').text()).toContain('Wi-Fi 狀態')
    expect(badge(w).text()).toBe('未連上 AP')
    expect(w.find('.wifi-status-summary').text()).toBe('wlan0 沒有連上 AP')
    expect(w.find('.wifi-status-next').text()).toBe(
      'gateway 沒有連上任何 AP（wpa_state: SCANNING）。請確認現場網路已存入且在範圍內',
    )
    expect(w.find('.wifi-status-scan-hint').text()).toBe('附近沒有偵測到任何 Wi-Fi 網路')
    expect(layers(w).map((l) => [l.name, l.detail])).toEqual([
      ['介面', 'wlan0 · 預設介面'],
      ['已連上 AP', 'wpa_state: SCANNING'],
      ['已取得 IP', null],
    ])
  })

  it('lays the details out two to a row by default, and one to a row when asked', () => {
    /** Label and value cells in each row of the bordered details table. */
    const cellsPerRow = (w: VueWrapper) =>
      w.findAll('.wifi-status-details tr').map((tr) => tr.findAll('th, td').length)

    expect(cellsPerRow(mountWith())).toEqual([4, 4, 4])
    const one = mountWith({}, 1)
    expect(cellsPerRow(one)).toEqual([2, 2, 2, 2, 2, 2])
    // The same six rows, only laid out differently.
    for (const shown of ['11:22:33:44:55:66', '2.4 GHz · channel 6', 'rtl8xxxu · phy0', 'Up']) {
      expect(one.find('.wifi-status-details').text()).toContain(shown)
    }
  })
})
