import type { WiFiInterfaceInfo, WiFiNetwork, WiFiStatusInfo } from '@/services/wifi'

export type Severity = 'ok' | 'warning' | 'critical'
export type AlertType = 'success' | 'info' | 'warning' | 'error'

export type BlockAlert = {
  type: AlertType
  title: string
  detail: string
  nextSteps?: string[]
}

export type DiagnosisResult = {
  severity: Severity
  alertType: AlertType
  title: string
  summary: string
  nextSteps: string[]
  blocks: {
    interfaceHealthAlert?: BlockAlert
    wifiLinkAlert?: BlockAlert
    ipAlert?: BlockAlert
  }
}

export type DiagnosisInput = {
  interfaces: WiFiInterfaceInfo[]
  selectedIfname: string
  statusInfo: WiFiStatusInfo | null
  scanNetworks: WiFiNetwork[]
  scanTotalCount: number
}

function toAlertType(sev: Severity): AlertType {
  if (sev === 'ok') return 'success'
  if (sev === 'warning') return 'warning'
  return 'error'
}

export function deriveDiagnosis(input: DiagnosisInput): DiagnosisResult {
  const blocks: DiagnosisResult['blocks'] = {}
  const nextSteps: string[] = []

  const iface = input.interfaces.find((x) => x.ifname === input.selectedIfname) || null
  const s = input.statusInfo
  const hasScan = (input.scanTotalCount ?? 0) > 0 || (input.scanNetworks?.length ?? 0) > 0

  // 1) Interface layer
  if (!input.selectedIfname) {
    const sev: Severity = 'critical'
    return {
      severity: sev,
      alertType: toAlertType(sev),
      title: 'No interface selected',
      summary: 'Select a Wi-Fi interface before running diagnostics.',
      nextSteps: [
        'Select wlan0/wlan1 from the interface selector.',
        'If no interface is available, check hardware/driver.',
      ],
      blocks,
    }
  }

  if (!iface) {
    blocks.interfaceHealthAlert = {
      type: 'error',
      title: 'Interface not found',
      detail: `Selected interface "${input.selectedIfname}" is not present.`,
      nextSteps: ['Refresh interfaces.', 'Check if the adapter is unplugged or driver not loaded.'],
    }
    const sev: Severity = 'critical'
    return {
      severity: sev,
      alertType: toAlertType(sev),
      title: 'Wi-Fi adapter not detected',
      summary: `Interface "${input.selectedIfname}" is not available. This is likely a hardware/driver issue.`,
      nextSteps: blocks.interfaceHealthAlert.nextSteps || [],
      blocks,
    }
  }

  if (!iface.is_wireless) {
    blocks.interfaceHealthAlert = {
      type: 'error',
      title: 'Not a wireless interface',
      detail: `"${iface.ifname}" does not appear to be a Wi-Fi interface (wireless path missing).`,
      nextSteps: [
        'Verify the Wi-Fi adapter is correct and supported.',
        'Replug USB Wi-Fi dongle or use a different adapter.',
        'Check driver/module on the device (system-side).',
      ],
    }
    const sev: Severity = 'critical'
    return {
      severity: sev,
      alertType: toAlertType(sev),
      title: 'Wi-Fi adapter/driver issue',
      summary: 'The selected interface is not recognized as wireless.',
      nextSteps: blocks.interfaceHealthAlert.nextSteps || [],
      blocks,
    }
  }

  if (iface.is_up === false) {
    blocks.interfaceHealthAlert = {
      type: 'warning',
      title: 'Interface is down',
      detail: `"${iface.ifname}" is DOWN. Wi-Fi operations may fail.`,
      nextSteps: [
        'Bring interface UP on OS (or reboot).',
        'Check rfkill / power saving settings.',
        'If using USB dongle, replug and re-scan interfaces.',
      ],
    }
    // not immediately fatal: still continue
    nextSteps.push(...(blocks.interfaceHealthAlert.nextSteps || []))
  } else {
    blocks.interfaceHealthAlert = {
      type: 'success',
      title: 'Interface looks healthy',
      detail: `"${iface.ifname}" is wireless and up.`,
    }
  }

  // 2) Scan visibility hint
  if (!hasScan) {
    // If you can’t see any APs, most likely location/signal/driver.
    blocks.wifiLinkAlert = {
      type: 'warning',
      title: 'No access points visible',
      detail:
        'Wi-Fi scan returned no networks. This often indicates weak signal, antenna issue, or driver problems.',
      nextSteps: [
        'Move closer to the AP or remove obstructions.',
        'Try scanning again.',
        'If still empty, verify adapter/antenna/driver on the device.',
      ],
    }
  }

  // 3) Wi-Fi link (wpa)
  if (!s) {
    blocks.wifiLinkAlert = blocks.wifiLinkAlert || {
      type: 'warning',
      title: 'No Wi-Fi status data',
      detail: 'Unable to read wpa status. Wi-Fi service may not be running.',
      nextSteps: ['Refresh status.', 'Check wpa_supplicant service on the device.'],
    }

    const sev: Severity = hasScan ? 'warning' : 'critical'
    return {
      severity: sev,
      alertType: toAlertType(sev),
      title: 'Wi-Fi status unavailable',
      summary: 'Cannot determine association state without status info.',
      nextSteps: blocks.wifiLinkAlert.nextSteps || [],
      blocks,
    }
  }

  const wpaState = (s.wpa_state || '').toUpperCase()
  const ssid = s.ssid || null
  const ip = s.ip_address || null

  if (wpaState !== 'COMPLETED' || !ssid) {
    blocks.wifiLinkAlert = blocks.wifiLinkAlert || {
      type: 'warning',
      title: 'Not associated',
      detail: `wpa_state=${s.wpa_state ?? '-'}, ssid=${ssid ?? '-'}. Device is not fully associated to an AP.`,
      nextSteps: [
        'Select the correct SSID from scan results and connect again.',
        'Verify password/security type (WPA2/WPA3 compatibility).',
        'Try a mobile hotspot to isolate AP-side issues.',
      ],
    }

    const sev: Severity = hasScan ? 'warning' : 'critical'
    return {
      severity: sev,
      alertType: toAlertType(sev),
      title: 'Wi-Fi not connected',
      summary: 'The device is not fully associated to a Wi-Fi network.',
      nextSteps: blocks.wifiLinkAlert.nextSteps || [],
      blocks,
    }
  }

  // 4) DHCP/IP
  if (!ip) {
    blocks.ipAlert = {
      type: 'warning',
      title: 'No IP address (DHCP issue)',
      detail: `Associated to "${ssid}" but IP is not assigned.`,
      nextSteps: [
        'Check DHCP settings on the AP/router.',
        'Try a different SSID (mobile hotspot) to confirm.',
        'Re-connect and observe if IP is assigned within 10–30 seconds.',
      ],
    }

    const sev: Severity = 'warning'
    return {
      severity: sev,
      alertType: toAlertType(sev),
      title: 'Wi-Fi connected but no IP',
      summary: `Wi-Fi link is up (SSID="${ssid}") but DHCP/IP assignment failed.`,
      nextSteps: blocks.ipAlert.nextSteps || [],
      blocks: {
        ...blocks,
        wifiLinkAlert: {
          type: 'success',
          title: 'Associated to AP',
          detail: `wpa_state=COMPLETED, ssid="${ssid}".`,
        },
      },
    }
  }

  // 5) OK
  blocks.wifiLinkAlert = {
    type: 'success',
    title: 'Wi-Fi connected',
    detail: `SSID="${ssid}", IP="${ip}".`,
  }
  blocks.ipAlert = {
    type: 'success',
    title: 'DHCP/IP OK',
    detail: `IP assigned: ${ip}`,
  }

  const sev: Severity = 'ok'
  return {
    severity: sev,
    alertType: toAlertType(sev),
    title: 'Wi-Fi connected and IP assigned',
    summary: `Connected to "${ssid}" with IP ${ip}.`,
    nextSteps: [],
    blocks,
  }
}
