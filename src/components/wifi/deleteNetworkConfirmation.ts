/**
 * The content of the confirmation shown before a configured network is deleted.
 *
 * Everything here is built as VNodes with text children, never as an HTML
 * string: an SSID is operator- or neighbour-supplied text and must reach the
 * screen as text, so the message box is never asked to parse markup.
 *
 * I4: nothing here reads `network_id`. The rows are described by what the
 * operator can see -- SSID, priority, enabled and current.
 */
import { h, type VNode } from 'vue'
import type { AccessPath } from '@/composables/useAccessPath'
import type { WiFiConfiguredNetwork } from '@/services/wifi'
import type { I18nMessages } from '@/types/i18n'

type Strings = I18nMessages['wifi']['configuredNetworks']

/** Fills `{name}` tokens in one pass, so a value that itself contains a token is left alone. */
export const format = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (token, name: string) =>
    name in values ? String(values[name]) : token,
  )

/** The SSID exactly as listed, or the placeholder for one that is exactly `""`. */
export const displaySsid = (ssid: string, s: Strings): string => (ssid === '' ? s.blankSsid : ssid)

export interface DeleteConfirmation {
  message: VNode
  confirmButtonText: string
  /** Danger styling for deleting the network in use; absent otherwise. */
  confirmButtonClass: string | undefined
}

/**
 * The sentence saying how the gateway gets back onto a network once the one it
 * is using is gone. Rescue rows are the factory-default rows in list order,
 * which is the order Talos's watchdog reads them in.
 *
 * - Some rescue row is enabled: wpa_supplicant can select it directly, so every
 *   enabled one is named.
 * - Rescue rows exist and none is enabled: the watchdog re-enables only the
 *   FIRST one, so that one is named and no other.
 * - No rescue row: nothing will bring the gateway back on its own.
 */
const recoverySentence = (rows: WiFiConfiguredNetwork[], s: Strings): string => {
  const rescue = rows.filter((row) => row.is_factory_default)
  const enabled = rescue.filter((row) => row.enabled)
  if (enabled.length > 0) {
    return format(s.deleteConfirmRecoveryRescueEnabled, {
      rescue: enabled.map((row) => displaySsid(row.ssid, s)).join(s.listSeparator),
    })
  }
  const first = rescue[0]
  if (first) {
    return format(s.deleteConfirmRecoveryRescueDisabled, { rescue: displaySsid(first.ssid, s) })
  }
  return s.deleteConfirmRecoveryNoRescue
}

/**
 * What deleting the current network does to this page, from how the page was
 * reached. None for `other-ip`: a page opened at another address keeps working.
 */
const accessHint = (access: AccessPath, s: Strings): string | null => {
  const url = access.url ?? s.deleteHintUrlUnknown
  switch (access.kind) {
    case 'wifi-ip':
      return format(s.deleteHintWifiIp, { ip: access.ip ?? '', url })
    case 'hostname':
      return format(s.deleteHintHostname, { host: access.host })
    case 'ip-unknown':
      return format(s.deleteHintIpUnknown, { url })
    default:
      return null
  }
}

/** `white-space: pre-wrap` so leading, trailing and repeated spaces in an SSID stay visible. */
const line = (className: string, text: string): VNode =>
  h('p', { class: className, style: 'white-space: pre-wrap; margin: 0 0 8px' }, text)

/**
 * @param target  the row about to be deleted, from the most recent successful load
 * @param rows    every row of that same load
 * @param deleteLabel  the ordinary confirm-button label
 * @param access  how the page was reached; read only when `target` is current
 */
export const buildDeleteConfirmation = (
  target: WiFiConfiguredNetwork,
  rows: WiFiConfiguredNetwork[],
  s: Strings,
  deleteLabel: string,
  access: AccessPath | null,
): DeleteConfirmation => {
  const ssid = displaySsid(target.ssid, s)
  const parts: VNode[] = []

  if (target.current) {
    parts.push(
      line('delete-confirm-current', format(s.deleteConfirmCurrentHeading, { ssid })),
      line('delete-confirm-recovery', recoverySentence(rows, s)),
    )
    const hint = access === null ? null : accessHint(access, s)
    if (hint !== null) parts.push(line('delete-confirm-page-warning', hint))
  } else {
    parts.push(line('delete-confirm-lead', format(s.deleteConfirmLead, { ssid })))
  }

  // Same-named rows differ only in what the operator can see, so the one being
  // deleted is told apart by exactly that.
  const sameName = rows.filter((row) => row.ssid === target.ssid).length
  if (sameName > 1) {
    const yesNo = (value: boolean) => (value ? s.yes : s.no)
    parts.push(
      line(
        'delete-confirm-duplicate',
        format(s.deleteConfirmDuplicate, {
          count: sameName,
          ssid,
          priority:
            target.priority === null || target.priority === undefined
              ? s.priorityUnknown
              : String(target.priority),
          enabled: yesNo(target.enabled),
          current: yesNo(target.current),
        }),
      ),
    )
  }

  parts.push(line('delete-confirm-scope', s.deleteConfirmScope))

  return {
    message: h('div', { class: 'delete-network-confirmation' }, parts),
    confirmButtonText: target.current ? s.deleteConfirmCurrentButton : deleteLabel,
    confirmButtonClass: target.current ? 'el-button--danger' : undefined,
  }
}
