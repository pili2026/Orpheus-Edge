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

export interface WiFiConfiguredNetwork {
  /**
   * wpa_supplicant's position for this entry within THIS snapshot only. It is
   * not an identifier: deleting an entry leaves a hole and a restart compacts
   * the table, so the same network comes back under a different number. Never
   * key anything durable on it, and never hold one across a fetch.
   */
  network_id: number
  ssid: string
  /** `null` when wpa_supplicant could not report it. */
  priority: number | null
  enabled: boolean
  current: boolean
  is_factory_default: boolean
  /** On the wire; never rendered. */
  psk_state: 'known' | 'unknown' | 'ambiguous'
}

export interface WiFiConfiguredNetworksResponse {
  /**
   * The only reliable success signal on a 200 from this endpoint. Talos reports
   * some listing failures as HTTP 200 carrying a non-success value here, an
   * empty `networks` and a `total_count` of 0 -- byte-identical to a gateway
   * that genuinely stores nothing. Emptiness cannot tell the two apart.
   */
  status: string
  /** The operator-facing reason on a non-success body; `null` on a success one. */
  message?: string | null
  interface: string | null
  networks: WiFiConfiguredNetwork[]
  total_count: number
  /** On the wire; never rendered. */
  psk_store_available: boolean
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

/**
 * The five security values the save endpoint accepts, exactly as it spells them.
 * Unlike `SecurityType` this is closed: Talos refuses WEP, WPA3 and UNKNOWN on
 * save with a 400, and any other spelling with a 422.
 */
export type WiFiSaveSecurity = 'OPEN' | 'WPA' | 'WPA2' | 'WPA/WPA2' | 'WPA2/WPA3'

export interface WiFiSaveNetworkRequest {
  ssid: string
  security: WiFiSaveSecurity
  /** Omitted, never `null`, for `OPEN`. */
  psk?: string
}

export interface WiFiSaveNetworkResponse {
  // `timestamp` is on the wire and deliberately not typed, because nothing reads it.
  status: string
  message: string | null
  interface: string | null
  ssid: string
  /** On the wire only. I4: never acted on and never held. */
  network_id: number | null
  applied_priority: number | null
  /** `true` for a new entry, `false` when an existing entry for the SSID was updated. */
  created: boolean
  saved: boolean
  save_error: string | null
  left_disabled: boolean
  note: string | null
}

const WIFI_SCAN_TIMEOUT_MS = 20000
const WIFI_STATUS_TIMEOUT_MS = 15000
const WIFI_CONNECT_TIMEOUT_MS = 45000
const WIFI_SAVE_TIMEOUT_MS = 45000

/**
 * Throws unless the body reports success, so a failure Talos declared with a
 * 200 status line reaches callers the same way an HTTP failure does.
 *
 * Exported because `saveNetwork` is its second caller: POST /wifi/networks also
 * reports a configure failure as a 200 carrying `status: "error"`. It was private
 * while one method spoke this convention, and the reason for that still holds --
 * a check every caller had to remember is the check that was missing to begin
 * with -- so it is still called from inside the client methods, never from a
 * component, and both endpoints share this one copy rather than two that could
 * drift apart.
 *
 * An absent `status` is a failure too. A body that does not say it succeeded has
 * not said it succeeded, and the only shape that reaches this line without one
 * is a response this client does not recognise.
 */
export const assertBodyStatusSucceeded = (
  data: { status: string; message?: string | null },
  endpointLabel: string,
): void => {
  if (data.status === 'success') return

  // The server's own wording when there is any, since it names the cause. The
  // fallback quotes the status verbatim rather than inventing a reason for it.
  const reported = typeof data.message === 'string' && data.message !== '' ? data.message : null
  throw new Error(reported ?? `${endpointLabel} returned status "${String(data.status)}"`)
}

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

  async listConfiguredNetworks(ifname?: string | null): Promise<WiFiConfiguredNetworksResponse> {
    const { data } = await api.get('/wifi/networks', {
      params: ifname ? { ifname } : {},
      timeout: WIFI_STATUS_TIMEOUT_MS,
    })
    assertBodyStatusSucceeded(data, 'GET /wifi/networks')
    return data
  },

  /**
   * Stores a network without connecting to it. The request carries no interface:
   * Talos resolves the gateway's default one, as it does for the listing.
   * Rejections -- an HTTP status or a timeout -- propagate untouched, so a caller
   * still has `error.response.data`.
   */
  async saveNetwork(req: WiFiSaveNetworkRequest): Promise<WiFiSaveNetworkResponse> {
    const { data } = await api.post('/wifi/networks', req, { timeout: WIFI_SAVE_TIMEOUT_MS })
    assertBodyStatusSucceeded(data, 'POST /wifi/networks')
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
