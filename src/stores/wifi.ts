import { defineStore } from 'pinia'
import {
  wifiApi,
  type WiFiConnectRequest,
  type WiFiConnectResponse,
  type WiFiInterfaceInfo,
  type WiFiNetwork,
  type WiFiStatusInfo,
} from '@/services/wifi'

type LoadingState = {
  init: boolean
  refreshAll: boolean
  interfaces: boolean
  status: boolean
  scan: boolean
  connect: boolean
}

export type PollPhase = 'idle' | 'polling' | 'connected' | 'connected_no_ip' | 'timeout'

type PollState = {
  active: boolean
  phase: PollPhase
  targetSsid: string | null
  startedAt: number
  pollIntervalMs: number
  timeoutMs: number
  timerId: number | null
}

function safeErrorMessage(e: any): string {
  return e?.response?.data?.detail || e?.message || String(e)
}

export const useWiFiStore = defineStore('wifi', {
  state: () => ({
    selectedIfname: '' as string,

    interfaces: [] as WiFiInterfaceInfo[],
    statusInfo: null as WiFiStatusInfo | null,
    networks: [] as WiFiNetwork[],
    scanTotalCount: 0,
    currentSsid: null as string | null,

    lastConnectResult: null as WiFiConnectResponse | null,

    scanError: '' as string,
    statusError: '' as string,
    interfacesError: '' as string,

    loading: {
      init: false,
      refreshAll: false,
      interfaces: false,
      status: false,
      scan: false,
      connect: false,
    } as LoadingState,

    // auto refresh (status only; keep light)
    autoRefreshEnabled: false,
    autoRefreshIntervalMs: 5000,
    autoRefreshTimerId: null as number | null,

    pollState: {
      active: false,
      phase: 'idle' as PollPhase,
      targetSsid: null,
      startedAt: 0,
      pollIntervalMs: 1000,
      timeoutMs: 30000,
      timerId: null,
    } as PollState,
  }),

  actions: {
    setSelectedIfname(ifname: string) {
      this.selectedIfname = ifname || ''
      this.stopConnectPoll()
      // reset view state to avoid stale info on adapter switch
      this.statusInfo = null
      this.currentSsid = null
      this.networks = []
      this.scanTotalCount = 0
      this.scanError = ''
      this.statusError = ''
    },

    async init() {
      if (this.loading.init) return
      this.loading.init = true
      try {
        await this.loadInterfaces()
        if (!this.selectedIfname) {
          this.selectedIfname =
            this.interfaces.find((x) => x.is_default)?.ifname || this.interfaces[0]?.ifname || ''
        }
        await this.refreshAll()
      } finally {
        this.loading.init = false
      }
    },

    async loadInterfaces() {
      this.loading.interfaces = true
      this.interfacesError = ''
      try {
        const res = await wifiApi.listInterfaces()
        this.interfaces = res.interfaces || []
        if (!this.selectedIfname && res.recommended_ifname) {
          this.selectedIfname = res.recommended_ifname
        }
      } catch (e) {
        this.interfacesError = safeErrorMessage(e)
        this.interfaces = []
      } finally {
        this.loading.interfaces = false
      }
    },

    async refreshStatus() {
      if (!this.selectedIfname) return
      this.loading.status = true
      this.statusError = ''
      try {
        const res = await wifiApi.status(this.selectedIfname)
        this.statusInfo = res.status_info ?? null
      } catch (e) {
        this.statusError = safeErrorMessage(e)
        this.statusInfo = null
      } finally {
        this.loading.status = false
      }
    },

    async scan(groupBySsid = true) {
      if (!this.selectedIfname) return
      this.loading.scan = true
      this.scanError = ''
      try {
        const res = await wifiApi.scan(this.selectedIfname, groupBySsid)
        this.networks = res.networks || []
        this.scanTotalCount = res.total_count ?? this.networks.length
        this.currentSsid = res.current_ssid ?? null
      } catch (e) {
        this.scanError = safeErrorMessage(e)
        this.networks = []
        this.scanTotalCount = 0
      } finally {
        this.loading.scan = false
      }
    },

    async refreshAll() {
      if (!this.selectedIfname) return
      this.loading.refreshAll = true
      try {
        await Promise.all([this.refreshStatus(), this.scan(true)])
      } finally {
        this.loading.refreshAll = false
      }
    },

    async connect(req: WiFiConnectRequest): Promise<WiFiConnectResponse | null> {
      if (!this.selectedIfname) return null
      this.loading.connect = true
      try {
        const res = await wifiApi.connect(req, this.selectedIfname)
        this.lastConnectResult = res

        if (res?.accepted) {
          this.startConnectPoll(
            res.ssid,
            res.recommended_poll_interval_ms,
            res.recommended_timeout_ms,
          )
        } else {
          this.stopConnectPoll()
          await this.refreshStatus()
        }
        return res
      } catch (e) {
        const msg = safeErrorMessage(e)
        this.lastConnectResult = {
          ssid: req.ssid,
          accepted: false,
          bssid_locked: false,
          saved: false,
          rescue_present: true,
          warnings: [],
          recommended_poll_interval_ms: 1000,
          recommended_timeout_ms: 30000,
          note: msg,
        }
        this.stopConnectPoll()
        return null
      } finally {
        this.loading.connect = false
      }
    },

    startConnectPoll(targetSsid: string, pollIntervalMs?: number, timeoutMs?: number) {
      this.stopConnectPoll()

      const pollMs = Number(pollIntervalMs || 1000)
      const toMs = Number(timeoutMs || 30000)

      this.pollState.active = true
      this.pollState.phase = 'polling'
      this.pollState.targetSsid = targetSsid
      this.pollState.startedAt = Date.now()
      this.pollState.pollIntervalMs = pollMs
      this.pollState.timeoutMs = toMs

      const tick = async () => {
        if (!this.pollState.active) return

        await this.refreshStatus()

        const s = this.statusInfo
        const ssidOk = !!s?.ssid && s.ssid === targetSsid
        const ipOk = !!s?.ip_address

        if (ssidOk && ipOk) {
          this.pollState.phase = 'connected'
          this.stopConnectPoll({ keepPhase: true })
          await this.scan(true)
          return
        }

        const elapsed = Date.now() - this.pollState.startedAt
        if (elapsed >= this.pollState.timeoutMs) {
          this.pollState.phase = ssidOk && !ipOk ? 'connected_no_ip' : 'timeout'
          this.stopConnectPoll({ keepPhase: true })
          await this.scan(true)
          return
        }

        this.pollState.timerId = window.setTimeout(tick, this.pollState.pollIntervalMs)
      }

      this.pollState.timerId = window.setTimeout(tick, this.pollState.pollIntervalMs)
    },

    stopConnectPoll(opts?: { keepPhase?: boolean }) {
      if (this.pollState.timerId) window.clearTimeout(this.pollState.timerId)
      this.pollState.timerId = null
      this.pollState.active = false
      this.pollState.targetSsid = null
      if (!opts?.keepPhase) this.pollState.phase = 'idle'
    },

    setAutoRefresh(enabled: boolean) {
      this.autoRefreshEnabled = enabled

      if (this.autoRefreshTimerId) {
        window.clearInterval(this.autoRefreshTimerId)
        this.autoRefreshTimerId = null
      }

      if (!enabled) return

      this.autoRefreshTimerId = window.setInterval(() => {
        if (this.loading.status || this.loading.connect) return
        void this.refreshStatus()
      }, this.autoRefreshIntervalMs)
    },
  },
})
