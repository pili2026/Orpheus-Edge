/**
 * How the operator reached this page, so a confirmation can say what happens
 * to it when the gateway's Wi-Fi changes underneath.
 *
 * Every lookup here is an aid. Nothing throws to the caller, and a failed or
 * slow lookup only makes the answer less specific: a missing Wi-Fi IP gives
 * `ip-unknown`, a missing hostname gives no URL.
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

/** Each lookup is capped so the hint never noticeably delays the confirmation it belongs to. */
export const ACCESS_PATH_LOOKUP_TIMEOUT_MS = 3000

/** Talos's answer when /etc/hostname is missing. */
const UNKNOWN_HOSTNAME = 'unknown'

/** The first successful answer; a failure leaves it empty so the next call asks again. */
let cachedHostname: string | null = null
/** Shared by concurrent callers, so a prefetch and a describe make one request. */
let hostnameInFlight: Promise<string> | null = null

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

const lookupHostname = (): Promise<string> => {
  if (cachedHostname !== null) return Promise.resolve(cachedHostname)
  if (!hostnameInFlight) {
    hostnameInFlight = provisionService
      .getCurrentConfig()
      .then((config) => {
        if (typeof config?.hostname !== 'string') throw new Error('no hostname in the response')
        cachedHostname = config.hostname
        return config.hostname
      })
      .finally(() => {
        hostnameInFlight = null
      })
  }
  return hostnameInFlight
}

/**
 * Starts the hostname lookup and fills the cache, so a later `describe` need not
 * wait for it. Fire-and-forget: it never throws and never reports a failure.
 */
export const prefetchHostname = (): void => {
  try {
    lookupHostname().catch(() => {})
  } catch {
    // Nothing to report: the next describe() asks again.
  }
}

const hostnameWithinCap = async (): Promise<string | null> => {
  try {
    return await withTimeout(lookupHostname(), ACCESS_PATH_LOOKUP_TIMEOUT_MS)
  } catch {
    return null
  }
}

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
 * @param wifiIp  the Wi-Fi IP when the caller already has one; `null` or `''`
 *   when it knows there is none. Omitted, the status is fetched with no interface.
 */
const describe = async (wifiIp?: string | null): Promise<AccessPath> => {
  const host = window.location.host
  try {
    const knownIp: Promise<string | null> =
      wifiIp === undefined
        ? wifiIpWithinCap()
        : Promise.resolve(typeof wifiIp === 'string' && wifiIp !== '' ? wifiIp : null)
    const [ip, hostname] = await Promise.all([knownIp, hostnameWithinCap()])
    return {
      kind: classify(ipLiteralOf(window.location.hostname), ip),
      ip,
      host,
      url: accessUrl(hostname),
    }
  } catch {
    return {
      kind: classify(ipLiteralOf(window.location.hostname), null),
      ip: null,
      host,
      url: null,
    }
  }
}

export function useAccessPath(): { describe(wifiIp?: string | null): Promise<AccessPath> } {
  return { describe }
}
