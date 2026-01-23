<template>
  <div class="wifi-selector">
    <el-dropdown trigger="click" @command="handleCommand" @visible-change="onDropdownVisibleChange">
      <el-button circle :loading="loadingInit || loadingStatus">
        <span class="wifi-icon">{{ wifiIcon }}</span>
      </el-button>

      <template #dropdown>
        <el-dropdown-menu>
          <!-- Header -->
          <el-dropdown-item disabled>
            <div class="dropdown-header">
              <span class="title">{{ t.wifi.title }}</span>
              <div class="actions">
                <!-- Status refresh only -->
                <el-button
                  text
                  size="small"
                  :icon="Refresh"
                  :loading="loadingStatus"
                  :title="t.common.refresh"
                  @click.stop="refreshStatus"
                />
              </div>
            </div>
          </el-dropdown-item>

          <el-dropdown-divider />

          <!-- Interface selector -->
          <el-dropdown-item disabled>
            <div class="row">
              <span class="label">{{ t.debugNetwork.interface }}</span>
              <el-select
                v-model="selectedIfnameLocal"
                size="small"
                style="width: 170px"
                :disabled="loadingInterfaces || loadingInit"
                @change="onInterfaceChange"
              >
                <el-option
                  v-for="it in wifi.interfaces"
                  :key="it.ifname"
                  :label="interfaceLabel(it)"
                  :value="it.ifname"
                />
              </el-select>
            </div>
          </el-dropdown-item>

          <el-dropdown-divider />

          <!-- Current status -->
          <el-dropdown-item disabled>
            <div class="current-status">
              <span class="wifi-icon">📶</span>
              <span class="ssid">{{ currentSsidDisplay }}</span>
              <el-tag size="small" effect="plain" :type="statusTagType" class="status-tag">
                {{ statusTagText }}
              </el-tag>
            </div>

            <div class="current-sub" v-if="wifi.statusInfo">
              <span class="muted">{{ wifi.statusInfo.wpa_state || '-' }}</span>
              <span class="muted">{{ wifi.statusInfo.ip_address || '-' }}</span>
            </div>
          </el-dropdown-item>

          <el-dropdown-divider />

          <!-- Errors -->
          <el-dropdown-item v-if="anyError" disabled>
            <el-alert
              :title="t.common.warning"
              :description="errorSummary"
              type="warning"
              effect="light"
              :closable="false"
              show-icon
              class="error-alert"
            />
          </el-dropdown-item>

          <el-dropdown-divider v-if="anyError" />

          <!-- Quick links -->
          <el-dropdown-item :command="goDebugWifiCmd">
            <div class="row link-row">
              <span>{{ t.debugNetwork.title }}</span>
              <span class="muted">↗</span>
            </div>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'

import { useI18n } from '@/composables/useI18n'
import { useWiFiStore } from '@/stores/wifi'
import type { WiFiInterfaceInfo } from '@/services/wifi'

const { t } = useI18n()
const router = useRouter()
const wifi = useWiFiStore()

// local select buffer (avoid directly mutating store while dropdown opens)
const selectedIfnameLocal = ref('')

const loadingInit = computed(() => wifi.loading.init)
const loadingInterfaces = computed(() => wifi.loading.interfaces)
const loadingStatus = computed(() => wifi.loading.status)

const wifiIcon = computed(() => {
  const s = wifi.statusInfo
  return s?.is_connected ? '📶' : '📡'
})

const currentSsidDisplay = computed(() => {
  const s = wifi.statusInfo
  return s?.ssid || wifi.currentSsid || '-'
})

const statusTagType = computed(() => {
  const s = wifi.statusInfo
  if (!s) return 'info'
  return s.is_connected ? 'success' : 'danger'
})

const statusTagText = computed(() => {
  const s = wifi.statusInfo
  if (!s) return '-'
  return s.is_connected ? t.value.nav.connected : t.value.nav.disconnected
})

const anyError = computed(() => !!wifi.interfacesError || !!wifi.statusError)

const errorSummary = computed(() => {
  const parts: string[] = []
  if (wifi.interfacesError) parts.push(`interfaces: ${wifi.interfacesError}`)
  if (wifi.statusError) parts.push(`status: ${wifi.statusError}`)
  return parts.join(' | ')
})

// ---------- helpers ----------
function interfaceLabel(it: WiFiInterfaceInfo): string {
  const flags: string[] = []
  if (it.is_default) flags.push('default')
  if (it.is_up === false) flags.push('down')
  if (!it.is_wireless) flags.push('non-wifi')
  return `${it.ifname}${flags.length ? ` (${flags.join(', ')})` : ''}`
}

// ---------- actions ----------
async function refreshStatus() {
  try {
    await wifi.refreshStatus()
  } catch (e) {
    ElMessage.warning(t.value.common.warning)
    console.error('[WiFiSelector] refreshStatus failed:', e)
  }
}

function onInterfaceChange() {
  // keep explicit
  wifi.setSelectedIfname(selectedIfnameLocal.value)
  void refreshStatus()
}

function onDropdownVisibleChange(visible: boolean) {
  if (!visible) return
  // open dropdown -> refresh status only
  if (!wifi.loading.status) void refreshStatus()
}

type Cmd = { type: 'go'; path: string }
const goDebugWifiCmd = JSON.stringify({ type: 'go', path: '/debug/wifi' } satisfies Cmd)

function parseCmd(command: string): Cmd | null {
  try {
    const o = JSON.parse(command)
    if (o?.type === 'go' && typeof o?.path === 'string') return o as Cmd
    return null
  } catch {
    return null
  }
}

function handleCommand(command: string) {
  const cmd = parseCmd(command)
  if (!cmd) return
  if (cmd.type === 'go') router.push(cmd.path)
}

// sync local selector with store
watch(
  () => wifi.selectedIfname,
  (v) => {
    if (!v) return
    selectedIfnameLocal.value = v
  },
  { immediate: true },
)

onMounted(async () => {
  await wifi.init()
  // init only; do NOT scan and do NOT connect here (Strategy A)
  void refreshStatus()
})
</script>

<style scoped>
.wifi-selector .wifi-icon {
  font-size: 20px;
}
.dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-width: 260px;
  width: 100%;
}
.dropdown-header .title {
  font-weight: 600;
}
.dropdown-header .actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 260px;
}
.row .label {
  font-weight: 600;
  color: var(--el-text-color-regular);
}
.link-row {
  min-width: 260px;
}
.current-status {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 260px;
}
.current-status .ssid {
  flex: 1;
  font-size: 14px;
}
.status-tag {
  margin-left: auto;
}
.current-sub {
  display: flex;
  gap: 12px;
  margin-left: 24px;
  margin-top: 4px;
}
.muted {
  color: var(--el-text-color-secondary);
}
.error-alert {
  width: 100%;
  min-width: 260px;
}
.wifi-selector :deep(.el-button) {
  border: none;
  background: transparent;
}
.wifi-selector :deep(.el-button:hover) {
  background-color: var(--el-color-primary-light-9);
}
</style>
