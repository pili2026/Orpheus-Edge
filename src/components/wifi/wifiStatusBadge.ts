import type { WifiVerdict } from '@/utils/wifi_status'

/** The tag type a verdict's badge is shown in, so every view of one verdict has one colour. */
export function wifiBadgeType(verdict: WifiVerdict): 'success' | 'info' | 'danger' {
  switch (verdict) {
    case 'ok':
      return 'success' as const
    case 'unknown':
      return 'info' as const
    default:
      return 'danger' as const
  }
}
