import type { Page } from '@playwright/test'
import type {
  WiFiConfiguredNetworksResponse,
  WiFiConnectResponse,
  WiFiInterfacesResponse,
  WiFiListResponse,
  WiFiStatusResponse,
} from '../../src/services/wifi'

// Wi-Fi endpoints the header WiFiSelector reads, for e2e runs without a Talos backend.
// Register them after the blanket 503 stub: Playwright tries the newest route first.

/** The longest SSID there is (32 bytes), in wide capitals with no break opportunity. */
export const LONG_SSID = 'WAREHOUSEMEZZANINEWESTWINGAP0001'

/** A wpa_cli failure as Talos reports it in `detail`: long, with long tokens. */
export const STATUS_ERROR_DETAIL =
  'wpa_cli -i wlan0 status failed: Failed to connect to non-global ctrl_ifname: wlan0  error: No such file or directory'

export const interfacesResponse: WiFiInterfacesResponse = {
  interfaces: [
    {
      ifname: 'wlan0',
      is_wireless: true,
      is_up: true,
      mac: 'e4:5f:01:aa:bb:cc',
      driver: 'brcmfmac',
      phy: 'phy0',
      is_default: true,
    },
  ],
  total_count: 1,
  recommended_ifname: 'wlan0',
}

export const connectedStatusResponse: WiFiStatusResponse = {
  status_info: {
    interface: 'wlan0',
    ssid: LONG_SSID,
    bssid: 'e4:b0:63:f2:57:20',
    freq: 2437,
    wpa_state: 'COMPLETED',
    ip_address: '192.168.100.123',
    network_id: 0,
    key_mgmt: 'WPA2-PSK',
    is_connected: true,
  },
}

/** A full-length IPv6 address, 39 characters: the longest address the summary row shows. */
export const IPV6_ADDRESS = '2001:0db8:85a3:0000:0000:8a2e:0370:7334'

/** connectedStatusResponse, with IPV6_ADDRESS. */
export const ipv6StatusResponse: WiFiStatusResponse = {
  status_info: { ...connectedStatusResponse.status_info, ip_address: IPV6_ADDRESS },
}

/** The client rejects a scan body whose `status` is not "success". */
export const scanResponse: WiFiListResponse & { status: 'success' } = {
  status: 'success',
  interface: 'wlan0',
  networks: [],
  total_count: 0,
  current_ssid: LONG_SSID,
}

/**
 * Interfaces and scan answer normally. GET /wifi/status reports the connection
 * ('connected') or fails with a 500 carrying STATUS_ERROR_DETAIL ('status-error').
 * With the status failing the scan names no current SSID either, so the open menu is
 * narrow until the error arrives and then widens: the case that must re-place it.
 */
export async function serveWifi(page: Page, status: 'connected' | 'status-error') {
  await page.route(
    (url) => url.pathname === '/api/wifi/interfaces',
    (route) => route.fulfill({ json: interfacesResponse }),
  )
  await page.route(
    (url) => url.pathname === '/api/wifi/scan',
    (route) =>
      route.fulfill({
        json: status === 'connected' ? scanResponse : { ...scanResponse, current_ssid: null },
      }),
  )
  await page.route(
    (url) => url.pathname === '/api/wifi/status',
    (route) =>
      status === 'connected'
        ? route.fulfill({ json: connectedStatusResponse })
        : route.fulfill({ status: 500, json: { detail: STATUS_ERROR_DETAIL } }),
  )
}

// ==================== The /debug/wifi page ====================

/** Why the invalid row below cannot be used: long, so it must wrap on a phone. */
export const INVALID_REASON =
  'SSID is not valid UTF-8 and cannot be written to wpa_supplicant through wpa_cli; connect from the gateway console instead'

/**
 * A scan for the debug page: the 32-character SSID in use, a saved network (it is
 * also in configuredNetworksResponse), an open network, and an invalid one. The scan
 * carries no "saved" flag of its own; saved shows in the configured networks.
 */
export const pageScanResponse: WiFiListResponse & { status: 'success' } = {
  status: 'success',
  interface: 'wlan0',
  networks: [
    {
      ssid: LONG_SSID,
      signal_strength: 82,
      security: 'wpa2-psk',
      in_use: true,
      bssid: 'e4:b0:63:f2:57:20',
      freq: 2437,
      is_valid: true,
    },
    {
      ssid: 'imaoffice1',
      signal_strength: 64,
      security: 'wpa2-psk',
      in_use: false,
      bssid: null,
      freq: 5180,
      is_valid: true,
    },
    {
      ssid: 'Cafe-Guest',
      signal_strength: 41,
      security: 'open',
      in_use: false,
      bssid: null,
      freq: 2412,
      is_valid: true,
    },
    {
      ssid: '\\xe5\\x80\\x89\\xe5\\xba\\xab-AP',
      raw_ssid: 'e58089e5baab2d4150',
      signal_strength: 37,
      security: 'wpa2-psk',
      in_use: false,
      bssid: null,
      freq: 2462,
      is_valid: false,
      invalid_reason: INVALID_REASON,
    },
  ],
  total_count: 4,
  current_ssid: LONG_SSID,
}

/** What GET /wifi/networks lists: the rescue network, the one in use, and a saved one. */
export const configuredNetworksResponse: WiFiConfiguredNetworksResponse = {
  status: 'success',
  message: null,
  interface: 'wlan0',
  networks: [
    {
      network_id: 0,
      ssid: 'TALOS-RESCUE',
      priority: 100,
      enabled: true,
      current: false,
      is_factory_default: true,
      psk_state: 'known',
    },
    {
      network_id: 1,
      ssid: LONG_SSID,
      priority: 10,
      enabled: true,
      current: true,
      is_factory_default: false,
      psk_state: 'known',
    },
    {
      network_id: 2,
      ssid: 'imaoffice1',
      priority: 5,
      enabled: true,
      current: false,
      is_factory_default: false,
      psk_state: 'known',
    },
  ],
  total_count: 3,
  psk_store_available: true,
}

/** Everything /debug/wifi reads, connected to LONG_SSID. */
export async function serveWifiPage(page: Page) {
  await page.route(
    (url) => url.pathname === '/api/wifi/interfaces',
    (route) => route.fulfill({ json: interfacesResponse }),
  )
  await page.route(
    (url) => url.pathname === '/api/wifi/status',
    (route) => route.fulfill({ json: connectedStatusResponse }),
  )
  await page.route(
    (url) => url.pathname === '/api/wifi/scan',
    (route) => route.fulfill({ json: pageScanResponse }),
  )
  await page.route(
    (url) => url.pathname === '/api/wifi/networks',
    (route) => route.fulfill({ json: configuredNetworksResponse }),
  )
}

/** POST /wifi/connect to LONG_SSID, refused: a definite rejection, with Talos's reason. */
export const connectRejectedResponse: WiFiConnectResponse = {
  interface: 'wlan0',
  ssid: LONG_SSID,
  accepted: false,
  bssid_locked: false,
  saved: false,
  save_error: null,
  rescue_present: true,
  warnings: [],
  recommended_poll_interval_ms: 1000,
  recommended_timeout_ms: 30000,
  note: `wpa_supplicant rejected the configuration for "${LONG_SSID}": 4-way handshake failed, check the passphrase`,
}

/**
 * POST /wifi/connect to LONG_SSID, accepted. The poll interval is longer than any test,
 * so the page stays in its "Connecting…" poll state, with the poll alert showing.
 */
export const connectAcceptedResponse: WiFiConnectResponse = {
  interface: 'wlan0',
  ssid: LONG_SSID,
  accepted: true,
  applied_network_id: 1,
  applied_priority: 10,
  applied_bssid: null,
  bssid_locked: false,
  saved: true,
  save_error: null,
  rescue_present: true,
  warnings: [],
  recommended_poll_interval_ms: 600000,
  recommended_timeout_ms: 1200000,
  note: null,
}
