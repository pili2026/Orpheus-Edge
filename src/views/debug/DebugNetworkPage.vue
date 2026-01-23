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
          {{ t.common.refresh || 'Refresh' }}
        </el-button>

        <el-button :loading="wifi.loading.scan" @click="wifi.scan(true)">
          {{ t.common.scan || 'Scan' }}
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
        <!-- Interface Health -->
        <el-card class="card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>{{ t.debugNetwork.interfaceHealth || 'Interface Health' }}</span>
              <el-tag :type="interfaceHealthTag.type" effect="plain" size="small">
                {{ interfaceHealthTag.text }}
              </el-tag>
            </div>
          </template>

          <el-alert
            v-if="interfaceHealthAlert"
            :title="interfaceHealthAlert.title"
            :type="interfaceHealthAlert.type"
            show-icon
            :closable="false"
            class="mb-12"
          >
            <template #default>
              <div class="alert-body">
                <div class="muted">{{ interfaceHealthAlert.detail }}</div>
                <ul v-if="interfaceHealthAlert.nextSteps?.length" class="steps">
                  <li v-for="(s, idx) in interfaceHealthAlert.nextSteps" :key="idx">{{ s }}</li>
                </ul>
              </div>
            </template>
          </el-alert>

          <el-descriptions :column="2" border size="small" v-if="selectedInterface">
            <el-descriptions-item label="ifname">{{
              selectedInterface.ifname
            }}</el-descriptions-item>
            <el-descriptions-item label="is_wireless">{{
              selectedInterface.is_wireless
            }}</el-descriptions-item>
            <el-descriptions-item label="is_up">{{
              selectedInterface.is_up ?? '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="is_default">{{
              selectedInterface.is_default
            }}</el-descriptions-item>
            <el-descriptions-item label="mac">{{
              selectedInterface.mac ?? '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="driver">{{
              selectedInterface.driver ?? '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="phy">{{
              selectedInterface.phy ?? '-'
            }}</el-descriptions-item>
          </el-descriptions>

          <el-empty v-else :description="t.debugNetwork.noInterface || 'No interface selected'" />
        </el-card>

        <!-- Wi-Fi Link Status -->
        <el-card class="card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>{{ t.debugNetwork.wifiLinkStatus || 'Wi-Fi Link Status' }}</span>
              <el-tag :type="wifiLinkTag.type" effect="plain" size="small">
                {{ wifiLinkTag.text }}
              </el-tag>
            </div>
          </template>

          <el-alert
            v-if="wifiLinkAlert"
            :title="wifiLinkAlert.title"
            :type="wifiLinkAlert.type"
            show-icon
            :closable="false"
            class="mb-12"
          >
            <template #default>
              <div class="alert-body">
                <div class="muted">{{ wifiLinkAlert.detail }}</div>
                <ul v-if="wifiLinkAlert.nextSteps?.length" class="steps">
                  <li v-for="(s, idx) in wifiLinkAlert.nextSteps" :key="idx">{{ s }}</li>
                </ul>
              </div>
            </template>
          </el-alert>

          <el-descriptions :column="2" border size="small" v-if="wifi.statusInfo">
            <el-descriptions-item label="interface">{{
              wifi.statusInfo.interface
            }}</el-descriptions-item>
            <el-descriptions-item label="is_connected">{{
              wifi.statusInfo.is_connected
            }}</el-descriptions-item>

            <el-descriptions-item label="ssid">{{
              wifi.statusInfo.ssid ?? '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="ip_address">{{
              wifi.statusInfo.ip_address ?? '-'
            }}</el-descriptions-item>

            <el-descriptions-item label="wpa_state">{{
              wifi.statusInfo.wpa_state ?? '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="key_mgmt">{{
              wifi.statusInfo.key_mgmt ?? '-'
            }}</el-descriptions-item>

            <el-descriptions-item label="bssid">{{
              wifi.statusInfo.bssid ?? '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="freq">{{
              wifi.statusInfo.freq ?? '-'
            }}</el-descriptions-item>

            <el-descriptions-item label="network_id">{{
              wifi.statusInfo.network_id ?? '-'
            }}</el-descriptions-item>
          </el-descriptions>

          <el-empty v-else :description="t.debugNetwork.noStatus || 'No status data'" />
        </el-card>

        <!-- IP / DHCP -->
        <el-card class="card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>{{ t.debugNetwork.ipDhcp || 'IP / DHCP' }}</span>
              <el-tag :type="ipTag.type" effect="plain" size="small">
                {{ ipTag.text }}
              </el-tag>
            </div>
          </template>

          <el-alert
            v-if="ipAlert"
            :title="ipAlert.title"
            :type="ipAlert.type"
            show-icon
            :closable="false"
          >
            <template #default>
              <div class="alert-body">
                <div class="muted">{{ ipAlert.detail }}</div>
                <ul v-if="ipAlert.nextSteps?.length" class="steps">
                  <li v-for="(s, idx) in ipAlert.nextSteps" :key="idx">{{ s }}</li>
                </ul>
              </div>
            </template>
          </el-alert>
        </el-card>

        <!-- Derived Diagnosis (overall) -->
        <el-card class="card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>{{ t.debugNetwork.diagnosis || 'Derived Diagnosis' }}</span>
              <el-tag :type="diagnosisTag.type" effect="plain" size="small">
                {{ diagnosisTag.text }}
              </el-tag>
            </div>
          </template>

          <el-alert
            :title="diagnosis.title"
            :type="diagnosis.alertType"
            show-icon
            :closable="false"
          >
            <template #default>
              <div class="alert-body">
                <div class="muted">{{ diagnosis.summary }}</div>
                <div v-if="diagnosis.nextSteps.length" class="mt-8">
                  <div class="muted">{{ t.debugNetwork.nextSteps || 'Next steps' }}</div>
                  <ol class="steps">
                    <li v-for="(s, idx) in diagnosis.nextSteps" :key="idx">{{ s }}</li>
                  </ol>
                </div>
              </div>
            </template>
          </el-alert>
        </el-card>
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

          <el-form v-else label-width="120px" size="default" @submit.prevent>
            <el-form-item label="SSID">
              <el-input :model-value="selectedNetwork.ssid" readonly />
            </el-form-item>

            <el-form-item label="Security">
              <el-input :model-value="String(selectedNetwork.security)" readonly />
            </el-form-item>

            <el-form-item v-if="requiresPsk" :label="t.wifi.password || 'Password'">
              <el-input
                v-model="connectForm.psk"
                type="password"
                show-password
                clearable
                :placeholder="t.wifi.passwordPlaceholder || 'Enter password'"
              />
            </el-form-item>

            <el-form-item :label="t.debugNetwork.saveConfig || 'Save config'">
              <el-switch v-model="connectForm.save_config" />
            </el-form-item>

            <el-collapse v-model="advancedOpen" class="mb-12">
              <el-collapse-item :title="t.debugNetwork.advanced || 'Advanced'" name="adv">
                <el-form-item label="Priority (0-100)">
                  <el-input-number v-model="connectForm.priority" :min="0" :max="100" :step="1" />
                </el-form-item>

                <el-form-item label="Lock BSSID">
                  <el-switch v-model="connectForm.lock_bssid" />
                  <div class="muted ml-8" v-if="connectForm.lock_bssid">
                    {{ selectedNetwork.bssid ?? 'BSSID not available (group_by_ssid may hide it)' }}
                  </div>
                </el-form-item>
              </el-collapse-item>
            </el-collapse>

            <el-form-item>
              <el-button
                type="primary"
                :loading="wifi.loading.connect"
                :disabled="!wifi.selectedIfname"
                @click="onConnectClick"
              >
                {{ t.wifi.connect || 'Connect' }}
              </el-button>

              <el-button :disabled="wifi.loading.connect" @click="resetConnectForm">
                {{ t.common.reset || 'Reset' }}
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- Connect result -->
        <el-card class="card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>{{ t.debugNetwork.connectResult || 'Connect Result' }}</span>
              <el-tag
                v-if="wifi.lastConnectResult"
                :type="wifi.lastConnectResult.accepted ? 'success' : 'danger'"
                effect="plain"
                size="small"
              >
                {{ wifi.lastConnectResult.accepted ? 'ACCEPTED' : 'REJECTED' }}
              </el-tag>
            </div>
          </template>

          <el-empty
            v-if="!wifi.lastConnectResult"
            :description="t.debugNetwork.noConnectResult || 'No connect attempt yet'"
          />

          <template v-else>
            <el-alert
              v-if="wifi.lastConnectResult.note"
              :title="wifi.lastConnectResult.note"
              :type="wifi.lastConnectResult.accepted ? 'success' : 'error'"
              show-icon
              :closable="false"
              class="mb-12"
            />

            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="interface">{{
                wifi.lastConnectResult.interface ?? '-'
              }}</el-descriptions-item>
              <el-descriptions-item label="ssid">{{
                wifi.lastConnectResult.ssid
              }}</el-descriptions-item>

              <el-descriptions-item label="saved">{{
                wifi.lastConnectResult.saved
              }}</el-descriptions-item>
              <el-descriptions-item label="save_error">{{
                wifi.lastConnectResult.save_error ?? '-'
              }}</el-descriptions-item>

              <el-descriptions-item label="applied_network_id">{{
                wifi.lastConnectResult.applied_network_id ?? '-'
              }}</el-descriptions-item>
              <el-descriptions-item label="applied_priority">{{
                wifi.lastConnectResult.applied_priority ?? '-'
              }}</el-descriptions-item>

              <el-descriptions-item label="bssid_locked">{{
                wifi.lastConnectResult.bssid_locked
              }}</el-descriptions-item>
              <el-descriptions-item label="applied_bssid">{{
                wifi.lastConnectResult.applied_bssid ?? '-'
              }}</el-descriptions-item>

              <el-descriptions-item label="poll_interval_ms">{{
                wifi.lastConnectResult.recommended_poll_interval_ms
              }}</el-descriptions-item>
              <el-descriptions-item label="timeout_ms">{{
                wifi.lastConnectResult.recommended_timeout_ms
              }}</el-descriptions-item>
            </el-descriptions>

            <el-alert
              v-if="wifi.lastConnectResult.warnings?.length"
              :title="t.common.warning || 'Warnings'"
              type="warning"
              show-icon
              :closable="false"
              class="mt-12"
            >
              <template #default>
                <ul class="steps">
                  <li v-for="(w, idx) in wifi.lastConnectResult.warnings" :key="idx">{{ w }}</li>
                </ul>
              </template>
            </el-alert>

            <el-alert
              v-if="pollMessage"
              :title="pollMessage"
              :type="pollAlertType"
              show-icon
              :closable="false"
              class="mt-12"
            />
          </template>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/composables/useI18n'
import { useWiFiStore } from '@/stores/wifi'
import { deriveDiagnosis, type DiagnosisResult } from '@/utils/wifi_diagnosis'
import type {
  WiFiInterfaceInfo,
  WiFiNetwork,
  SecurityType,
  WiFiConnectRequest,
} from '@/services/wifi'

const { t } = useI18n()
const wifi = useWiFiStore()
storeToRefs(wifi) // keep for future if you want, but not required

const selectedNetwork = ref<WiFiNetwork | null>(null)
const advancedOpen = ref<string[]>([])
const connectForm = ref({
  psk: '' as string,
  save_config: true,
  priority: undefined as number | undefined,
  lock_bssid: false,
})

const selectedInterface = computed(
  () => wifi.interfaces.find((x) => x.ifname === wifi.selectedIfname) || null,
)

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

// Derived diagnosis
const diagnosis = computed<DiagnosisResult>(() =>
  deriveDiagnosis({
    interfaces: wifi.interfaces,
    selectedIfname: wifi.selectedIfname,
    statusInfo: wifi.statusInfo,
    scanNetworks: wifi.networks,
    scanTotalCount: wifi.scanTotalCount,
  }),
)

const diagnosisTag = computed(() => {
  const s = diagnosis.value.severity
  if (s === 'ok') return { type: 'success' as const, text: 'OK' }
  if (s === 'warning') return { type: 'warning' as const, text: 'WARNING' }
  return { type: 'danger' as const, text: 'CRITICAL' }
})

const interfaceHealthTag = computed(() => {
  const i = selectedInterface.value
  if (!i) return { type: 'info' as const, text: 'N/A' }
  if (!i.is_wireless) return { type: 'danger' as const, text: 'NOT WIFI' }
  if (i.is_up === false) return { type: 'warning' as const, text: 'DOWN' }
  return { type: 'success' as const, text: 'HEALTHY' }
})

const wifiLinkTag = computed(() => {
  const s = wifi.statusInfo
  if (!s) return { type: 'info' as const, text: 'N/A' }
  if (s.is_connected) return { type: 'success' as const, text: 'CONNECTED' }
  return { type: 'danger' as const, text: 'DISCONNECTED' }
})

const ipTag = computed(() => {
  const s = wifi.statusInfo
  if (!s) return { type: 'info' as const, text: 'N/A' }
  if (s.ip_address) return { type: 'success' as const, text: 'DHCP OK' }
  if (s.ssid && s.wpa_state === 'COMPLETED') return { type: 'warning' as const, text: 'NO IP' }
  return { type: 'info' as const, text: 'UNKNOWN' }
})

// Alerts (lightweight mapping from diagnosis blocks)
const interfaceHealthAlert = computed(() => diagnosis.value.blocks.interfaceHealthAlert ?? null)
const wifiLinkAlert = computed(() => diagnosis.value.blocks.wifiLinkAlert ?? null)
const ipAlert = computed(() => diagnosis.value.blocks.ipAlert ?? null)

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
.mt-12 {
  margin-top: 12px;
}
.ml-8 {
  margin-left: 8px;
}

.steps {
  margin: 8px 0 0 18px;
  padding: 0;
}

.alert-body {
  line-height: 1.4;
}
</style>
