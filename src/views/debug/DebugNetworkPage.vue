<template>
  <div class="debug-network-page">
    <div class="page-header">
      <div class="title">
        <div class="h1">{{ t.debugNetwork.title || 'Debug / Network' }}</div>
        <div class="sub">
          {{ t.debugNetwork.subtitle || 'On-site Wi-Fi diagnostics and connection tooling' }}
        </div>
      </div>

      <div class="toolbar">
        <el-select
          v-model="wifi.selectedIfname"
          size="default"
          class="ifname-select"
          :placeholder="t.debugNetwork.interface || 'Interface'"
          @change="onIfnameChanged"
        >
          <el-option
            v-for="i in wifi.interfaces"
            :key="i.ifname"
            :label="formatIfname(i)"
            :value="i.ifname"
          />
        </el-select>

        <el-button :loading="wifi.loading.refreshAll" @click="wifi.refreshAll()">
          {{ t.debugNetwork.refreshStatusAndScan }}
        </el-button>

        <el-switch
          v-model="wifi.autoRefreshEnabled"
          :active-text="t.debugNetwork.autoRefresh || 'Auto refresh'"
          @change="onAutoRefreshChanged"
        />
      </div>
    </div>

    <el-row :gutter="16">
      <!-- Left column: status & diagnosis -->
      <el-col :span="12">
        <!-- Wi-Fi status: one verdict, and the layer it stops at -->
        <WiFiStatusCard :status="wifiStatus" />

        <!-- Configured networks (read-only). Last card in this column of
             gateway state; the right-hand column stays the scan list and the
             connect form it feeds, with nothing between them. -->
        <ConfiguredWiFiNetworksPanel class="card" />
      </el-col>

      <!-- Right column: scan & connect -->
      <el-col :span="12">
        <!-- Available networks -->
        <el-card class="card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>{{ t.debugNetwork.availableNetworks || 'Available Networks' }}</span>
              <div class="header-meta">
                <span class="muted">
                  {{ t.debugNetwork.total || 'Total' }}: {{ wifi.scanTotalCount }}
                </span>
              </div>
            </div>
          </template>

          <el-alert
            v-if="wifi.scanError"
            :title="t.debugNetwork.scanError || 'Scan error'"
            type="error"
            show-icon
            :closable="false"
            class="mb-12"
          >
            <template #default>
              <div class="muted">{{ wifi.scanError }}</div>
            </template>
          </el-alert>

          <el-table
            :data="wifi.networks"
            size="small"
            height="360"
            @row-click="onNetworkRowClick"
            row-key="ssid"
          >
            <el-table-column prop="ssid" label="SSID" min-width="160" />
            <el-table-column label="Signal" width="90">
              <template #default="{ row }"> {{ row.signal_strength }}% </template>
            </el-table-column>
            <el-table-column prop="security" label="Security" width="120" />
            <el-table-column label="In Use" width="80">
              <template #default="{ row }">
                <el-tag v-if="row.in_use" type="success" size="small" effect="plain">Yes</el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="Valid" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.is_valid" type="success" size="small" effect="plain">OK</el-tag>
                <el-tooltip v-else :content="row.invalid_reason || 'Invalid'" placement="top">
                  <el-tag type="danger" size="small" effect="plain">Invalid</el-tag>
                </el-tooltip>
              </template>
            </el-table-column>
          </el-table>

          <div class="muted mt-8">
            {{ t.debugNetwork.currentSsid || 'Current SSID' }}:
            <b>{{ wifi.currentSsid || '-' }}</b>
          </div>
        </el-card>

        <!-- Connect panel -->
        <el-card class="card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>{{ t.debugNetwork.connect || 'Connect' }}</span>
              <el-tag v-if="selectedNetwork" type="info" size="small" effect="plain">
                {{ selectedNetwork.ssid }}
              </el-tag>
            </div>
          </template>

          <el-alert
            v-if="!selectedNetwork"
            :title="t.debugNetwork.selectNetworkHint || 'Select a network from the list to connect'"
            type="info"
            show-icon
            :closable="false"
            class="mb-12"
          />

          <WiFiConnectForm
            v-else
            v-model:connect-form="connectForm"
            v-model:advanced-open="advancedOpen"
            :selected-network="selectedNetwork"
            :requires-psk="requiresPsk"
            :loading="wifi.loading.connect"
            :connect-disabled="!wifi.selectedIfname"
            @connect="onConnectClick"
            @reset="resetConnectForm()"
          />
        </el-card>

        <!-- Connect result -->
        <WiFiConnectResult
          :result="wifi.lastConnectResult"
          :connect-result-tag="connectResultTag"
          :connect-result-reason="connectResultReason"
          :warning-text="connectWarningText"
          :poll-message="pollMessage"
          :poll-alert-type="pollAlertType"
        />
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, type VNode } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/composables/useI18n'
import { prefetchHostname, useAccessPath, type AccessPath } from '@/composables/useAccessPath'
import ConfiguredWiFiNetworksPanel from '@/components/wifi/ConfiguredWiFiNetworksPanel.vue'
import WiFiStatusCard from '@/components/wifi/WiFiStatusCard.vue'
import WiFiConnectForm from '@/components/wifi/WiFiConnectForm.vue'
import WiFiConnectResult from '@/components/wifi/WiFiConnectResult.vue'
import { format } from '@/components/wifi/deleteNetworkConfirmation'
import { useWiFiStore } from '@/stores/wifi'
import { deriveWifiStatus } from '@/utils/wifi_status'
import type {
  WiFiInterfaceInfo,
  WiFiNetwork,
  SecurityType,
  WiFiConnectRequest,
} from '@/services/wifi'

const { t } = useI18n()
const wifi = useWiFiStore()
storeToRefs(wifi) // keep for future if you want, but not required
const accessPath = useAccessPath()

/** True from the click until the confirmation closes, so a second click opens no second box. */
const connectConfirming = ref(false)

/**
 * False once the page is gone. A connect started here must not outlive it: the
 * box is awaited, and the operator may navigate away while it is open.
 */
let active = true
onUnmounted(() => {
  active = false
  // The auto-refresh interval lives in the store and would keep polling after the page has gone.
  wifi.setAutoRefresh(false)
})

const selectedNetwork = ref<WiFiNetwork | null>(null)
const advancedOpen = ref<string[]>([])
const connectForm = ref({
  psk: '' as string,
  save_config: true,
  priority: undefined as number | undefined,
  lock_bssid: false,
})

function formatIfname(i: WiFiInterfaceInfo): string {
  const tags: string[] = []
  if (i.is_default) tags.push('default')
  if (i.is_up === false) tags.push('down')
  if (!i.is_wireless) tags.push('not-wireless')
  return tags.length ? `${i.ifname} (${tags.join(', ')})` : i.ifname
}

function requiresPskForSecurity(security: SecurityType): boolean {
  const s = String(security || '').toLowerCase()
  return s !== 'open' && s !== 'none'
}

const requiresPsk = computed(() =>
  selectedNetwork.value ? requiresPskForSecurity(selectedNetwork.value.security) : false,
)

// Wi-Fi status
const wifiStatus = computed(() =>
  deriveWifiStatus({
    selectedIfname: wifi.selectedIfname,
    interfaces: wifi.interfaces,
    interfacesError: wifi.interfacesError,
    interfacesLoading: wifi.loading.interfaces || wifi.loading.init,
    statusInfo: wifi.statusInfo,
    statusError: wifi.statusError,
    networksCount: wifi.networks.length,
    lastScanOk: wifi.lastScanOk,
  }),
)

// ---------- poll message (store phase -> i18n string) ----------
const pollMessage = computed(() => {
  const p = wifi.pollState
  const ssid = p.targetSsid || ''
  if (!ssid) return ''

  switch (p.phase) {
    case 'polling':
      return (t.value.debugNetwork.pollPolling || 'Connecting to "{ssid}"...').replace(
        '{ssid}',
        ssid,
      )
    case 'connected':
      return (t.value.debugNetwork.pollConnected || 'Connected to "{ssid}"').replace('{ssid}', ssid)
    case 'connected_no_ip':
      return (t.value.debugNetwork.pollConnectedNoIp || 'Connected no IP for "{ssid}"').replace(
        '{ssid}',
        ssid,
      )
    case 'timeout':
      return (t.value.debugNetwork.pollTimeout || 'Timeout for "{ssid}"').replace('{ssid}', ssid)
    default:
      return ''
  }
})

const pollAlertType = computed(() => {
  switch (wifi.pollState.phase) {
    case 'connected':
      return 'success'
    case 'connected_no_ip':
    case 'timeout':
      return 'warning'
    case 'polling':
      return 'info'
    default:
      return 'info'
  }
})

// ---------- connect result ----------
const connectResultTag = computed(() => {
  const r = wifi.lastConnectResult
  if (!r) return null
  // No response is not a rejection: switching networks drops the operator's own
  // link when the page was opened over the gateway's Wi-Fi.
  if (wifi.lastConnectNoResponse) {
    return { type: 'info' as const, text: t.value.debugNetwork.connectResultUnknown }
  }
  return r.accepted
    ? { type: 'success' as const, text: 'ACCEPTED' }
    : { type: 'danger' as const, text: 'REJECTED' }
})

const connectResultReason = computed(() => {
  const r = wifi.lastConnectResult
  if (!r) return null
  if (wifi.lastConnectNoResponse) {
    return { type: 'info' as const, title: t.value.debugNetwork.connectResultNoResponse }
  }
  if (r.note) return { type: r.accepted ? ('success' as const) : ('error' as const), title: r.note }
  // Talos's 200 error body carries `note: null` and the reason in `message`.
  if (r.status === 'error' && r.message) return { type: 'error' as const, title: r.message }
  return null
})

/** Talos's warning codes in the operator's terms; any other code verbatim. */
function connectWarningText(code: string): string {
  switch (code) {
    case 'RESCUE_SSID_MISSING':
      return t.value.debugNetwork.connectWarningRescueMissing
    case 'RESCUE_SSID_CREDENTIAL_UNCHANGED':
      return t.value.debugNetwork.connectWarningRescueCredentialUnchanged
    default:
      return code
  }
}

// ---------- connect confirmation ----------
/** What happens to this page when the gateway switches; none for `other-ip`, which it does not affect. */
function connectAccessHint(path: AccessPath, ssid: string): string | null {
  const s = t.value.debugNetwork
  const url = path.url ?? s.connectHintUrlUnknown
  switch (path.kind) {
    case 'wifi-ip':
      return format(s.connectHintWifiIp, { ip: path.ip ?? '', ssid, url })
    case 'hostname':
      return format(s.connectHintHostname, { ssid, host: path.host })
    case 'ip-unknown':
      return format(s.connectHintIpUnknown, { ssid, url })
    default:
      return null
  }
}

/** Text children only, never an HTML string: an SSID is neighbour-supplied text. */
const confirmLine = (className: string, text: string): VNode =>
  h('p', { class: className, style: 'white-space: pre-wrap; margin: 0 0 8px' }, text)

function onNetworkRowClick(row: WiFiNetwork) {
  if (!row.is_valid) return
  selectedNetwork.value = row
  resetConnectForm(false)
}

function resetConnectForm(clearSelected = true) {
  connectForm.value.psk = ''
  connectForm.value.save_config = true
  connectForm.value.priority = undefined
  connectForm.value.lock_bssid = false
  advancedOpen.value = []
  if (clearSelected) selectedNetwork.value = null
}

async function onConnectClick() {
  if (!selectedNetwork.value) return
  if (!wifi.selectedIfname) return
  if (connectConfirming.value) return

  const n = selectedNetwork.value
  const needPsk = requiresPskForSecurity(n.security)
  if (needPsk && !connectForm.value.psk) {
    ElMessage.warning(t.value.wifi.passwordPlaceholder || 'Password required')
    return
  }

  // IMPORTANT: WiFiConnectRequest.psk is optional string, NOT null.
  const req: WiFiConnectRequest = {
    ssid: n.ssid,
    security: n.security,
    save_config: connectForm.value.save_config,
    ...(typeof connectForm.value.priority === 'number'
      ? { priority: connectForm.value.priority }
      : {}),
    ...(connectForm.value.lock_bssid && n.bssid ? { bssid: n.bssid } : {}),
    ...(needPsk ? { psk: connectForm.value.psk } : {}),
  }

  // Talos's connect disables every other saved network, the factory one
  // included, and may cut off the very link this page arrived on.
  connectConfirming.value = true
  try {
    const s = t.value.debugNetwork
    // Synchronous and request-free, so nothing stands between the click and the box.
    const hint = connectAccessHint(
      accessPath.describeSync(wifi.statusInfo?.ip_address ?? null),
      n.ssid,
    )
    try {
      // `autofocus: false`: by default focus lands on the confirm button, and an
      // Enter meant for something else would switch the gateway's network.
      await ElMessageBox.confirm(
        h('div', { class: 'connect-confirm-message' }, [
          confirmLine('connect-confirm-disables', s.connectConfirmDisablesOthers),
          ...(hint === null ? [] : [confirmLine('connect-confirm-hint', hint)]),
        ]),
        format(s.connectConfirmTitle, { ssid: n.ssid }),
        {
          autofocus: false,
          confirmButtonText: t.value.wifi.connect,
          cancelButtonText: t.value.common.cancel,
          type: 'warning',
          customClass: 'connect-confirm',
        },
      )
    } catch {
      // Cancel, Escape or a click outside: nothing was asked of the gateway.
      return
    }
    // Confirmed in a box that outlived its page: nothing is sent on its behalf.
    if (!active) return
  } finally {
    connectConfirming.value = false
  }

  await wifi.connect(req)
}

async function onIfnameChanged() {
  selectedNetwork.value = null
  resetConnectForm(false)
  await wifi.refreshAll()
}

function onAutoRefreshChanged() {
  wifi.setAutoRefresh(wifi.autoRefreshEnabled)
}

onMounted(async () => {
  // Fire-and-forget: fills the hostname cache so the connect confirmation need not wait for it.
  prefetchHostname()
  await wifi.init()
})
</script>

<style scoped>
.debug-network-page {
  padding: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 16px;
}

.title .h1 {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}
.title .sub {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ifname-select {
  width: 220px;
}

.card {
  margin-bottom: 16px;
  border-radius: 10px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.muted {
  color: #6b7280;
  font-size: 12px;
}

.mb-12 {
  margin-bottom: 12px;
}
.mt-8 {
  margin-top: 8px;
}
</style>
