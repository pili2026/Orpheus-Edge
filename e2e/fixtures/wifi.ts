import type { Page } from '@playwright/test'
import type {
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
