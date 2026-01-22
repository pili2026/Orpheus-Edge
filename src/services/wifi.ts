import api from '@/services/api'

export type SecurityType = 'open' | 'wpa-psk' | 'wpa2-psk' | 'wpa3-sae' | 'wep' | 'unknown' | string

export interface WiFiInterfaceInfo {
  ifname: string
  is_wireless: boolean
  is_up?: boolean | null
  mac?: string | null
  driver?: string | null
  phy?: string | null
  is_default: boolean
}

export interface WiFiInterfacesResponse {
  interfaces: WiFiInterfaceInfo[]
  total_count: number
  recommended_ifname?: string | null
}

export interface WiFiStatusInfo {
  interface: string
  ssid?: string | null
  bssid?: string | null
  freq?: number | null
  wpa_state?: string | null
  ip_address?: string | null
  network_id?: number | null
  key_mgmt?: string | null
  is_connected: boolean
}

export interface WiFiStatusResponse {
  status_info: WiFiStatusInfo
}

export interface WiFiNetwork {
  ssid: string
  raw_ssid?: string | null
  signal_strength: number
  security: SecurityType
  in_use: boolean
  bssid?: string | null
  freq?: number | null
  is_valid: boolean
  invalid_reason?: string | null
}

export interface WiFiListResponse {
  interface?: string | null
  networks: WiFiNetwork[]
  total_count: number
  current_ssid?: string | null
}

export interface WiFiConnectRequest {
  ssid: string
  security: SecurityType
  psk?: string // 不要傳 null；沒有就省略
  bssid?: string
  priority?: number
  save_config?: boolean
}

export interface WiFiConnectResponse {
  interface?: string | null
  ssid: string
  accepted: boolean
  applied_network_id?: number | null
  applied_priority?: number | null
  applied_bssid?: string | null
  bssid_locked: boolean
  saved: boolean
  save_error?: string | null
  note?: string | null

  rescue_present: boolean
  warnings: string[]

  recommended_poll_interval_ms: number
  recommended_timeout_ms: number
}

const WIFI_SCAN_TIMEOUT_MS = 20000
const WIFI_STATUS_TIMEOUT_MS = 15000
const WIFI_CONNECT_TIMEOUT_MS = 45000

export const wifiApi = {
  async listInterfaces(): Promise<WiFiInterfacesResponse> {
    const { data } = await api.get('/wifi/interfaces', { timeout: WIFI_STATUS_TIMEOUT_MS })
    return data
  },

  async status(ifname?: string | null): Promise<WiFiStatusResponse> {
    const { data } = await api.get('/wifi/status', {
      params: ifname ? { ifname } : {},
      timeout: WIFI_STATUS_TIMEOUT_MS,
    })
    return data
  },

  async scan(ifname?: string | null, groupBySsid = true): Promise<WiFiListResponse> {
    const { data } = await api.get('/wifi/scan', {
      params: {
        ...(ifname ? { ifname } : {}),
        group_by_ssid: groupBySsid,
      },
      timeout: WIFI_SCAN_TIMEOUT_MS,
    })
    return data
  },

  async connect(req: WiFiConnectRequest, ifname?: string | null): Promise<WiFiConnectResponse> {
    const { data } = await api.post('/wifi/connect', req, {
      params: ifname ? { ifname } : {},
      timeout: WIFI_CONNECT_TIMEOUT_MS,
    })
    return data
  },
}
