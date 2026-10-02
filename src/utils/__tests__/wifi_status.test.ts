import { describe, it, expect } from 'vitest'
import { deriveWifiStatus, type WifiStatusInput } from '@/utils/wifi_status'
import type { WiFiInterfaceInfo, WiFiStatusInfo } from '@/services/wifi'

const WLAN0: WiFiInterfaceInfo = {
  ifname: 'wlan0',
  is_wireless: true,
  is_up: true,
  is_default: true,
  mac: '02:00:00:aa:bb:cc',
  driver: 'rtl8xxxu',
  phy: 'phy0',
}

/** Associated with an IP. `network_id` holds a value that appears nowhere else. */
const CONNECTED: WiFiStatusInfo = {
  interface: 'wlan0',
  ssid: 'imaoffice1',
  bssid: '11:22:33:44:55:66',
  freq: 2437,
  wpa_state: 'COMPLETED',
  ip_address: '192.168.6.100',
  network_id: 7731,
  key_mgmt: 'WPA2-PSK',
  is_connected: true,
}

/** Associated, no IP -- what Talos reports with `is_connected: false`. */
const NO_IP: WiFiStatusInfo = { ...CONNECTED, ip_address: null, is_connected: false }

/** Not associated. */
const SCANNING: WiFiStatusInfo = {
  interface: 'wlan0',
  ssid: null,
  bssid: null,
  freq: null,
  wpa_state: 'SCANNING',
  ip_address: null,
  network_id: null,
  key_mgmt: null,
  is_connected: false,
}

const input = (over: Partial<WifiStatusInput> = {}): WifiStatusInput => ({
  selectedIfname: 'wlan0',
  interfaces: [WLAN0],
  interfacesError: '',
  interfacesLoading: false,
  statusInfo: CONNECTED,
  statusError: '',
  networksCount: 4,
  lastScanOk: true,
  ...over,
})

const derive = (over: Partial<WifiStatusInput> = {}) => deriveWifiStatus(input(over))

describe('deriveWifiStatus: L1, the interface', () => {
  it('passes for the selected wireless interface, naming it as the default one', () => {
    expect(derive().layers.l1).toEqual({
      state: 'pass',
      detail: { key: 'l1PassDefault', values: { ifname: 'wlan0' } },
    })
  })

  it('passes without the default suffix for an interface that is not the default', () => {
    const wlan1 = { ...WLAN0, ifname: 'wlan1', is_default: false }
    expect(derive({ selectedIfname: 'wlan1', interfaces: [WLAN0, wlan1] }).layers.l1).toEqual({
      state: 'pass',
      detail: { key: 'l1Pass', values: { ifname: 'wlan1' } },
    })
  })

  it('does not gate on is_up', () => {
    expect(derive({ interfaces: [{ ...WLAN0, is_up: false }] }).layers.l1.state).toBe('pass')
  })

  it('fails with no selected interface', () => {
    expect(derive({ selectedIfname: '' }).layers.l1).toEqual({ state: 'fail', detail: null })
  })

  it('fails for an interface that is not in the list', () => {
    expect(derive({ selectedIfname: 'wlan9' }).layers.l1.state).toBe('fail')
  })

  it('fails for an empty list once loading has finished', () => {
    expect(derive({ interfaces: [] }).layers.l1.state).toBe('fail')
  })

  it('fails for an interface that is not wireless', () => {
    expect(derive({ interfaces: [{ ...WLAN0, is_wireless: false }] }).layers.l1.state).toBe('fail')
  })

  it('is unknown when the interface list could not be read', () => {
    expect(derive({ interfaces: [], interfacesError: 'boom' }).layers.l1).toEqual({
      state: 'unknown',
      detail: null,
    })
  })

  it('is unknown while the list is empty and loading', () => {
    expect(derive({ interfaces: [], interfacesLoading: true }).layers.l1.state).toBe('unknown')
  })

  it('checks unknown before fail: nothing selected and the list still loading', () => {
    expect(
      derive({ selectedIfname: '', interfaces: [], interfacesLoading: true }).layers.l1.state,
    ).toBe('unknown')
  })

  it('a list already loaded is read even while a reload runs', () => {
    expect(derive({ interfacesLoading: true }).layers.l1.state).toBe('pass')
  })
})

describe('deriveWifiStatus: L2, associated to an AP', () => {
  it('passes on COMPLETED with an SSID, naming the SSID and key management', () => {
    expect(derive().layers.l2).toEqual({
      state: 'pass',
      detail: { key: 'l2Pass', values: { ssid: 'imaoffice1', keyMgmt: 'WPA2-PSK' } },
    })
  })

  it('names the SSID alone when key management is not reported', () => {
    expect(derive({ statusInfo: { ...CONNECTED, key_mgmt: null } }).layers.l2.detail).toEqual({
      key: 'l2PassNoKeyMgmt',
      values: { ssid: 'imaoffice1' },
    })
  })

  it('fails on any other wpa_state, naming it', () => {
    expect(derive({ statusInfo: SCANNING }).layers.l2).toEqual({
      state: 'fail',
      detail: { key: 'l2Fail', values: { state: 'SCANNING' } },
    })
  })

  it('fails on COMPLETED with no SSID', () => {
    expect(derive({ statusInfo: { ...CONNECTED, ssid: null } }).layers.l2.state).toBe('fail')
  })

  it('fails on a missing wpa_state, shown as -', () => {
    expect(derive({ statusInfo: { ...SCANNING, wpa_state: null } }).layers.l2.detail).toEqual({
      key: 'l2Fail',
      values: { state: '-' },
    })
  })

  it('does not read is_connected: associated is a pass even when Talos says not connected', () => {
    expect(derive({ statusInfo: NO_IP }).layers.l2.state).toBe('pass')
  })

  it('does not read is_connected: not associated is a fail even when Talos says connected', () => {
    expect(derive({ statusInfo: { ...SCANNING, is_connected: true } }).layers.l2.state).toBe('fail')
  })

  it('is unknown with no status', () => {
    expect(derive({ statusInfo: null }).layers.l2).toEqual({ state: 'unknown', detail: null })
  })

  it('is unknown when the status read failed, whatever status is held', () => {
    expect(derive({ statusError: 'boom' }).layers.l2.state).toBe('unknown')
  })
})

describe('deriveWifiStatus: L3, an IP address', () => {
  it('passes with an IP, naming it', () => {
    expect(derive().layers.l3).toEqual({
      state: 'pass',
      detail: { key: 'l3Pass', values: { ip: '192.168.6.100' } },
    })
  })

  it('fails when L2 passed and there is no IP', () => {
    expect(derive({ statusInfo: NO_IP }).layers.l3).toEqual({ state: 'fail', detail: null })
  })

  it('is skipped while L2 fails, even with an IP reported', () => {
    expect(derive({ statusInfo: { ...SCANNING, ip_address: '10.0.0.5' } }).layers.l3).toEqual({
      state: 'skipped',
      detail: null,
    })
  })

  it('is skipped while L2 is unknown', () => {
    expect(derive({ statusInfo: null }).layers.l3.state).toBe('skipped')
    expect(derive({ statusError: 'boom' }).layers.l3.state).toBe('skipped')
  })
})

describe('deriveWifiStatus: the verdict', () => {
  it('is OK when every layer passes', () => {
    const r = derive()
    expect(r.verdict).toBe('ok')
    expect(r.summary).toEqual({
      key: 'ok',
      values: { ifname: 'wlan0', ssid: 'imaoffice1', ip: '192.168.6.100' },
    })
    expect(r.nextStep).toBeNull()
  })

  it('L1 fails first, ahead of an L2 failure', () => {
    const r = derive({ interfaces: [{ ...WLAN0, is_wireless: false }], statusInfo: SCANNING })
    expect(r.verdict).toBe('l1')
    expect(r.summary).toEqual({ key: 'l1', values: { ifname: 'wlan0' } })
    expect(r.nextStep).toEqual({ key: 'l1', values: {} })
  })

  it('L1 fails first, ahead of an L3 failure', () => {
    expect(derive({ selectedIfname: 'wlan9', statusInfo: NO_IP }).verdict).toBe('l1')
  })

  it('a failure wins over an unknown in an earlier layer', () => {
    expect(derive({ interfaces: [], interfacesError: 'boom', statusInfo: SCANNING }).verdict).toBe(
      'l2',
    )
  })

  it('a failure wins over an unknown in a later layer', () => {
    expect(derive({ selectedIfname: 'wlan9', statusInfo: null }).verdict).toBe('l1')
  })

  it('L2: names the interface, and the wpa_state in the next step', () => {
    const r = derive({ statusInfo: SCANNING })
    expect(r.verdict).toBe('l2')
    expect(r.summary).toEqual({ key: 'l2', values: { ifname: 'wlan0' } })
    expect(r.nextStep).toEqual({ key: 'l2', values: { state: 'SCANNING' } })
  })

  it('L3: associated without an IP, naming the SSID', () => {
    const r = derive({ statusInfo: NO_IP })
    expect(r.verdict).toBe('l3')
    expect(r.summary).toEqual({ key: 'l3', values: { ifname: 'wlan0', ssid: 'imaoffice1' } })
    expect(r.nextStep).toEqual({ key: 'l3', values: {} })
  })

  it('is unknown only when nothing fails', () => {
    const r = derive({ statusInfo: null })
    expect(r.verdict).toBe('unknown')
    expect(r.summary).toEqual({ key: 'unknown', values: {} })
  })

  it('unknown with no read error: loading', () => {
    expect(derive({ statusInfo: null }).nextStep).toEqual({ key: 'unknownLoading', values: {} })
  })

  it('unknown with only the interface error: names it', () => {
    const r = derive({ interfaces: [], interfacesError: 'iface-boom', statusInfo: null })
    expect(r.verdict).toBe('unknown')
    expect(r.nextStep).toEqual({ key: 'unknownError', values: { error: 'iface-boom' } })
  })

  it('unknown with only the status error: names it', () => {
    const r = derive({ statusInfo: null, statusError: 'status-boom' })
    expect(r.verdict).toBe('unknown')
    expect(r.nextStep).toEqual({ key: 'unknownError', values: { error: 'status-boom' } })
  })

  it('unknown with both errors: the interface error wins', () => {
    const r = derive({
      interfaces: [],
      interfacesError: 'iface-boom',
      statusInfo: null,
      statusError: 'status-boom',
    })
    expect(r.nextStep).toEqual({ key: 'unknownError', values: { error: 'iface-boom' } })
  })
})

describe('deriveWifiStatus: the scan hint', () => {
  it('counts the networks when L2 fails after a successful scan', () => {
    expect(derive({ statusInfo: SCANNING, networksCount: 3 }).scanHint).toEqual({
      key: 'some',
      values: { n: 3 },
    })
  })

  it('says none were seen for an empty successful scan', () => {
    expect(derive({ statusInfo: SCANNING, networksCount: 0 }).scanHint).toEqual({
      key: 'none',
      values: {},
    })
  })

  it('is absent after a failed scan', () => {
    expect(
      derive({ statusInfo: SCANNING, networksCount: 0, lastScanOk: false }).scanHint,
    ).toBeNull()
  })

  it('is absent before any scan', () => {
    expect(derive({ statusInfo: SCANNING, networksCount: 0, lastScanOk: null }).scanHint).toBeNull()
  })

  it('is absent when L2 passes', () => {
    expect(derive({ networksCount: 0 }).scanHint).toBeNull()
    expect(derive({ statusInfo: NO_IP, networksCount: 0 }).scanHint).toBeNull()
  })

  it('is absent when L2 is unknown', () => {
    expect(derive({ statusInfo: null, networksCount: 0 }).scanHint).toBeNull()
  })

  it('accompanies an L2 failure under an L1 verdict', () => {
    expect(derive({ selectedIfname: 'wlan9', statusInfo: SCANNING }).scanHint?.key).toBe('some')
  })

  it('never changes the verdict', () => {
    for (const lastScanOk of [true, false, null]) {
      for (const networksCount of [0, 5]) {
        expect(derive({ statusInfo: SCANNING, lastScanOk, networksCount }).verdict).toBe('l2')
        expect(derive({ lastScanOk, networksCount }).verdict).toBe('ok')
      }
    }
  })
})

describe('deriveWifiStatus: the details', () => {
  it('lists BSSID, band and channel, wpa_state, MAC, driver · phy and the interface state', () => {
    expect(derive().details).toEqual([
      { label: 'bssid', value: '11:22:33:44:55:66' },
      { label: 'band', key: 'band24', values: { channel: 6 } },
      { label: 'wpaState', value: 'COMPLETED' },
      { label: 'mac', value: '02:00:00:aa:bb:cc' },
      { label: 'driverPhy', value: 'rtl8xxxu · phy0' },
      { label: 'ifaceState', key: 'up', values: {} },
    ])
  })

  it('says the interface is down', () => {
    const rows = derive({ interfaces: [{ ...WLAN0, is_up: false }] }).details
    expect(rows.find((r) => r.label === 'ifaceState')).toEqual({
      label: 'ifaceState',
      key: 'down',
      values: {},
    })
  })

  it('leaves out the interface state when is_up is not reported', () => {
    const rows = derive({ interfaces: [{ ...WLAN0, is_up: null }] }).details
    expect(rows.map((r) => r.label)).not.toContain('ifaceState')
  })

  it('is empty with no status', () => {
    expect(derive({ statusInfo: null }).details).toEqual([])
  })

  it('carries no network_id, is_connected or is_wireless anywhere in the result', () => {
    const json = JSON.stringify(derive())
    expect(json).not.toContain('7731')
    expect(json).not.toContain('network_id')
    expect(json).not.toContain('is_connected')
    expect(json).not.toContain('is_wireless')
  })

  const band = (freq: number | null) =>
    derive({ statusInfo: { ...CONNECTED, freq } }).details.find((r) => r.label === 'band') ?? null

  it.each([
    [2412, 'band24', { channel: 1 }],
    [2472, 'band24', { channel: 13 }],
    [2484, 'band24', { channel: 14 }],
    [5180, 'band5', { channel: 36 }],
    [5895, 'band5', { channel: 179 }],
    [3000, 'freqOther', { freq: 3000 }],
  ])('frequency %i MHz -> %s %o', (freq, key, values) => {
    expect(band(freq)).toEqual({ label: 'band', key, values })
  })

  it('has no band line when the frequency is missing', () => {
    expect(band(null)).toBeNull()
  })
})
