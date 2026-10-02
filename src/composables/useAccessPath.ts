/**
 * How the operator reached this page, so a confirmation can say what happens
 * to it when the gateway's Wi-Fi changes underneath.
 *
 * Every lookup here is an aid. Nothing throws to the caller, and a failed or
 * slow lookup only makes the answer less specific: a missing Wi-Fi IP gives
 * `ip-unknown`, a missing hostname gives no URL.
 *
 * The hostname comes only from a cache that `prefetchHostname()` fills ahead of
 * time. Nothing that describes the page ever waits for it, so a confirmation
 * opens at once and never reflects a lookup that resolved after the question
 * was asked.
 */
import { wifiApi } from '@/services/wifi'
import { provisionService } from '@/services/provision'

export type AccessKind = 'wifi-ip' | 'other-ip' | 'ip-unknown' | 'hostname'

export interface AccessPath {
  kind: AccessKind
  /** The Wi-Fi IP used for the comparison, if any. */
  ip: string | null
  /** `location.host` as opened. */
  host: string
  /** `${protocol}//${hostname}.local${port}`, or null when the hostname is not known. */
  url: string | null
}

/** The status lookup in `describe()` is capped so the hint never noticeably delays its confirmation. */
export const ACCESS_PATH_LOOKUP_TIMEOUT_MS = 3000

/** Talos's answer when /etc/hostname is missing. */
const UNKNOWN_HOSTNAME = 'unknown'

/** The first successful answer; a failure leaves it empty so a later prefetch may ask again. */
let cachedHostname: string | null = null
/** The prefetch in flight, so a second prefetch while one is pending starts no second request. */
let prefetchInFlight: Promise<void> | null = null

/**
 * Starts the hostname lookup if the cache is empty and none is in flight. When
 * it settles the in-flight entry is cleared; on a failure the cache stays empty.
 * Fire-and-forget: it never throws and never reports a failure.
 */
export const prefetchHostname = (): void => {
  try {
    if (cachedHostname !== null || prefetchInFlight !== null) return
    prefetchInFlight = provisionService.getCurrentConfig().then(
      (config) => {
        if (typeof config?.hostname === 'string') cachedHostname = config.hostname
        prefetchInFlight = null
      },
      () => {
        prefetchInFlight = null
      },
    )
  } catch {
    prefetchInFlight = null
  }
}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`lookup timed out after ${ms} ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })

/** Asks for status with no interface, so Talos resolves the gateway's default one. */
const wifiIpWithinCap = async (): Promise<string | null> => {
  try {
    const res = await withTimeout(wifiApi.status(), ACCESS_PATH_LOOKUP_TIMEOUT_MS)
    const ip = res?.status_info?.ip_address
    return typeof ip === 'string' && ip !== '' ? ip : null
  } catch {
    return null
  }
}

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/

/** The address part of an IP-literal host, brackets removed; null for a name. */
const ipLiteralOf = (hostname: string): string | null => {
  if (IPV4_LITERAL.test(hostname)) return hostname
  if (hostname.startsWith('[') && hostname.endsWith(']')) return hostname.slice(1, -1)
  return null
}

const accessUrl = (hostname: string | null): string | null => {
  if (hostname === null || hostname === '' || hostname === UNKNOWN_HOSTNAME) return null
  const name = hostname.endsWith('.local') ? hostname : `${hostname}.local`
  const { protocol, port } = window.location
  return `${protocol}//${name}${port ? ':' + port : ''}`
}

const classify = (pageIp: string | null, wifiIp: string | null): AccessKind => {
  if (pageIp === null) return 'hostname'
  if (wifiIp === null) return 'ip-unknown'
  return pageIp === wifiIp ? 'wifi-ip' : 'other-ip'
}

/**
 * Synchronous and request-free: classifies the page against `wifiIp` (`null`
 * or `''` when there is none) and takes the URL from the prefetched hostname.
 */
const describeSync = (wifiIp: string | null): AccessPath => {
  const ip = typeof wifiIp === 'string' && wifiIp !== '' ? wifiIp : null
  return {
    kind: classify(ipLiteralOf(window.location.hostname), ip),
    ip,
    host: window.location.host,
    url: accessUrl(cachedHostname),
  }
}

/**
 * For a caller that holds no Wi-Fi IP: fetches status with no interface, under
 * the cap, then classifies. Starts no hostname request.
 */
const describe = async (): Promise<AccessPath> => describeSync(await wifiIpWithinCap())

export function useAccessPath(): {
  describe(): Promise<AccessPath>
  describeSync(wifiIp: string | null): AccessPath
} {
  return { describe, describeSync }
}
