import type { WiFiInterfaceInfo, WiFiStatusInfo } from '@/services/wifi'

/**
 * One Wi-Fi verdict for the debug page, worked out layer by layer: the
 * interface (L1), the association to an AP (L2), then the IP address (L3).
 *
 * Pure: it reads only its input, never the store, the DOM or the clock. It
 * returns codes and values, not text; the card turns them into strings in the
 * active locale. Talos's `is_connected` is deliberately not read -- it is false
 * for a gateway that is associated but has no IP, which is the very case this
 * verdict must name -- so L2 and L3 come from `wpa_state`, `ssid` and
 * `ip_address`.
 */

export type LayerState = 'pass' | 'fail' | 'unknown' | 'skipped'

export type WifiVerdict = 'ok' | 'l1' | 'l2' | 'l3' | 'unknown'

/** A message by key, with the values for its `{name}` tokens. */
export type WifiText<K extends string> = {
  key: K
  values: Record<string, string | number>
}

export type LayerDetailKey =
  | 'l1Pass'
  | 'l1PassDefault'
  | 'l2Pass'
  | 'l2PassNoKeyMgmt'
  | 'l2Fail'
  | 'l3Pass'

export type LayerResult = {
  state: LayerState
  /** The line under the layer; null where there is nothing to add. */
  detail: WifiText<LayerDetailKey> | null
}

export type NextStepKey = 'l1' | 'l2' | 'l3' | 'unknownError' | 'unknownLoading'

export type ScanHintKey = 'some' | 'none'

export type DetailLabel = 'bssid' | 'band' | 'wpaState' | 'mac' | 'driverPhy' | 'ifaceState'

export type DetailValueKey = 'band24' | 'band5' | 'freqOther' | 'up' | 'down'

/** A details row: either a value shown as reported, or one worded by key. */
export type WifiStatusDetail =
  | { label: DetailLabel; value: string }
  | ({ label: DetailLabel } & WifiText<DetailValueKey>)

export type WifiStatus = {
  verdict: WifiVerdict
  layers: { l1: LayerResult; l2: LayerResult; l3: LayerResult }
  summary: WifiText<WifiVerdict>
  /** Null when everything passes. */
  nextStep: WifiText<NextStepKey> | null
  /** What the last scan saw; only when L2 fails and that scan succeeded. */
  scanHint: WifiText<ScanHintKey> | null
  details: WifiStatusDetail[]
}

export type WifiStatusInput = {
  selectedIfname: string
  interfaces: WiFiInterfaceInfo[]
  interfacesError: string
  interfacesLoading: boolean
  statusInfo: WiFiStatusInfo | null
  statusError: string
  /** Rows in the last scan list (grouped by SSID). */
  networksCount: number
  /** null before any scan; otherwise whether the last one succeeded. */
  lastScanOk: boolean | null
}

const text = <K extends string>(
  key: K,
  values: Record<string, string | number> = {},
): WifiText<K> => ({ key, values })

function interfaceLayer(input: WifiStatusInput, iface: WiFiInterfaceInfo | null): LayerResult {
  if (input.interfacesError || (input.interfaces.length === 0 && input.interfacesLoading)) {
    return { state: 'unknown', detail: null }
  }
  if (!input.selectedIfname || !iface || !iface.is_wireless) {
    return { state: 'fail', detail: null }
  }
  return {
    state: 'pass',
    detail: text(iface.is_default ? 'l1PassDefault' : 'l1Pass', { ifname: iface.ifname }),
  }
}

function associationLayer(input: WifiStatusInput): LayerResult {
  const s = input.statusInfo
  if (!s || input.statusError) return { state: 'unknown', detail: null }
  if (s.wpa_state === 'COMPLETED' && s.ssid) {
    return {
      state: 'pass',
      detail: s.key_mgmt
        ? text('l2Pass', { ssid: s.ssid, keyMgmt: s.key_mgmt })
        : text('l2PassNoKeyMgmt', { ssid: s.ssid }),
    }
  }
  return { state: 'fail', detail: text('l2Fail', { state: s.wpa_state || '-' }) }
}

function ipLayer(input: WifiStatusInput, l2: LayerResult): LayerResult {
  if (l2.state !== 'pass') return { state: 'skipped', detail: null }
  const ip = input.statusInfo?.ip_address
  if (ip) return { state: 'pass', detail: text('l3Pass', { ip }) }
  return { state: 'fail', detail: null }
}

/** The band and channel for a frequency in MHz; the frequency itself outside the known ranges. */
function describeFrequency(freq: number): WifiText<DetailValueKey> {
  if (freq >= 2412 && freq <= 2472) return text('band24', { channel: (freq - 2407) / 5 })
  if (freq === 2484) return text('band24', { channel: 14 })
  if (freq >= 5000 && freq <= 5895) return text('band5', { channel: (freq - 5000) / 5 })
  return text('freqOther', { freq })
}

function detailsFor(input: WifiStatusInput, iface: WiFiInterfaceInfo | null): WifiStatusDetail[] {
  const s = input.statusInfo
  if (!s) return []

  const rows: WifiStatusDetail[] = []
  if (s.bssid) rows.push({ label: 'bssid', value: s.bssid })
  if (typeof s.freq === 'number') rows.push({ label: 'band', ...describeFrequency(s.freq) })
  if (s.wpa_state) rows.push({ label: 'wpaState', value: s.wpa_state })
  if (iface?.mac) rows.push({ label: 'mac', value: iface.mac })
  if (iface?.driver || iface?.phy) {
    rows.push({ label: 'driverPhy', value: `${iface.driver || '-'} · ${iface.phy || '-'}` })
  }
  if (typeof iface?.is_up === 'boolean') {
    rows.push({ label: 'ifaceState', ...text(iface.is_up ? 'up' : 'down') })
  }
  return rows
}

export function deriveWifiStatus(input: WifiStatusInput): WifiStatus {
  const iface = input.interfaces.find((x) => x.ifname === input.selectedIfname) ?? null
  const s = input.statusInfo
  const ifname = input.selectedIfname

  const l1 = interfaceLayer(input, iface)
  const l2 = associationLayer(input)
  const l3 = ipLayer(input, l2)

  // The first failing layer names the fault; a layer that cannot be read only
  // leaves the verdict open when nothing has failed.
  const verdict: WifiVerdict =
    l1.state === 'fail'
      ? 'l1'
      : l2.state === 'fail'
        ? 'l2'
        : l3.state === 'fail'
          ? 'l3'
          : [l1, l2, l3].some((l) => l.state === 'unknown')
            ? 'unknown'
            : 'ok'

  let summary: WifiText<WifiVerdict>
  let nextStep: WifiText<NextStepKey> | null
  switch (verdict) {
    case 'ok':
      summary = text('ok', { ifname, ssid: s?.ssid ?? '', ip: s?.ip_address ?? '' })
      nextStep = null
      break
    case 'l1':
      summary = text('l1', { ifname })
      nextStep = text('l1')
      break
    case 'l2':
      summary = text('l2', { ifname })
      nextStep = text('l2', { state: s?.wpa_state || '-' })
      break
    case 'l3':
      summary = text('l3', { ifname, ssid: s?.ssid ?? '' })
      nextStep = text('l3')
      break
    default: {
      summary = text('unknown')
      // The first read error in layer order, so the operator sees the cause.
      const error = input.interfacesError || input.statusError
      nextStep = error ? text('unknownError', { error }) : text('unknownLoading')
    }
  }

  // The scan only explains an L2 failure, and only when it ran; it never moves the verdict.
  const scanHint =
    l2.state === 'fail' && input.lastScanOk === true
      ? input.networksCount === 0
        ? text('none')
        : text('some', { n: input.networksCount })
      : null

  return {
    verdict,
    layers: { l1, l2, l3 },
    summary,
    nextStep,
    scanHint,
    details: detailsFor(input, iface),
  }
}
