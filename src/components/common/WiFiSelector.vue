<template>
  <div class="wifi-selector">
    <el-dropdown trigger="click" @command="handleCommand">
      <el-button circle :loading="scanning">
        <span class="wifi-icon">{{ wifiIcon }}</span>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <!-- Scan button -->
          <el-dropdown-item disabled>
            <div
              style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                width: 100%;
              "
            >
              <span style="font-weight: 600">{{ t.wifi.title }}</span>
              <el-button
                text
                :icon="Refresh"
                size="small"
                :loading="scanning"
                @click.stop="scanWiFiNetworks"
              />
            </div>
          </el-dropdown-item>
          <el-dropdown-divider />

          <!-- Currently connected WiFi -->
          <el-dropdown-item v-if="currentWiFi" disabled>
            <div class="wifi-item current">
              <span class="wifi-icon">📶</span>
              <span class="wifi-name">{{ currentWiFi }}</span>
              <span class="check-mark">✓</span>
            </div>
          </el-dropdown-item>
          <el-dropdown-divider v-if="currentWiFi" />

          <!-- WiFi network list -->
          <template v-if="wifiNetworks.length > 0">
            <el-dropdown-item
              v-for="network in wifiNetworks"
              :key="network.ssid"
              :command="network.ssid"
              :disabled="network.ssid === currentWiFi"
            >
              <div class="wifi-item">
                <span class="wifi-icon">{{ getSignalIcon(network.signal) }}</span>
                <span class="wifi-name">{{ network.ssid }}</span>
                <span v-if="network.secured" class="lock-icon">🔒</span>
                <span v-if="network.ssid === currentWiFi" class="check-mark">✓</span>
              </div>
            </el-dropdown-item>
          </template>
          <el-dropdown-item v-else disabled>
            <span style="color: var(--el-text-color-secondary)">{{ t.wifi.noNetworks }}</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- WiFi connection dialog -->
    <el-dialog
      v-model="showPasswordDialog"
      :title="t.wifi.connectTo + ' ' + selectedNetwork"
      width="400px"
    >
      <el-form @submit.prevent="connectToWiFi">
        <el-form-item :label="t.wifi.password">
          <el-input
            v-model="wifiPassword"
            type="password"
            :placeholder="t.wifi.passwordPlaceholder"
            show-password
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPasswordDialog = false">{{ t.common.cancel }}</el-button>
        <el-button type="primary" :loading="connecting" @click="connectToWiFi">
          {{ t.wifi.connect }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useI18n } from '@/composables/useI18n'
import api from '@/services/api'

// ==================== Interface definitions ====================
interface WiFiNetwork {
  ssid: string
  signal: number // 0-100
  secured: boolean
}

// ==================== Composables ====================
const { t } = useI18n()

// ==================== State ====================
const wifiNetworks = ref<WiFiNetwork[]>([])
const currentWiFi = ref<string>('')
const scanning = ref(false)
const connecting = ref(false)
const showPasswordDialog = ref(false)
const selectedNetwork = ref<string>('')
const wifiPassword = ref<string>('')

// ==================== Computed ====================
const wifiIcon = computed(() => {
  if (!currentWiFi.value) return '📡'
  return '📶'
})

// ==================== Methods ====================
function getSignalIcon(signal: number): string {
  if (signal >= 75) return '📶'
  if (signal >= 50) return '📶'
  if (signal >= 25) return '📶'
  return '📶'
}

async function scanWiFiNetworks() {
  scanning.value = true
  try {
    // Call backend API to scan WiFi networks
    const response = await api.get('/wifi/scan')
    wifiNetworks.value = response.data.networks || []
    console.log('[WiFiSelector] Scanned networks:', wifiNetworks.value)
  } catch (error) {
    const err = error as Error
    console.error('[WiFiSelector] Failed to scan WiFi networks:', err)
    ElMessage.warning(t.value.wifi.scanFailed)
  } finally {
    scanning.value = false
  }
}

async function getCurrentWiFi() {
  try {
    // Call backend API to get current WiFi
    const response = await api.get('/wifi/current')
    currentWiFi.value = response.data.ssid || ''
    console.log('[WiFiSelector] Current WiFi:', currentWiFi.value)
  } catch (error) {
    const err = error as Error
    console.error('[WiFiSelector] Failed to get current WiFi:', err)
    // Do not show error message to the user because this is not a critical feature
  }
}

function handleCommand(command: string) {
  if (command === currentWiFi.value) {
    return
  }
  selectedNetwork.value = command
  const network = wifiNetworks.value.find((n) => n.ssid === command)
  if (network?.secured) {
    // If password is required, show password dialog
    showPasswordDialog.value = true
    wifiPassword.value = ''
  } else {
    // If password is not required, connect directly
    connectToWiFi()
  }
}

async function connectToWiFi() {
  if (!selectedNetwork.value) return
  connecting.value = true
  try {
    // Call backend API to connect to WiFi
    await api.post('/wifi/connect', {
      ssid: selectedNetwork.value,
      password: wifiPassword.value || undefined,
    })
    ElMessage.success(t.value.wifi.connectSuccess)
    currentWiFi.value = selectedNetwork.value
    showPasswordDialog.value = false
    wifiPassword.value = ''
    // Refresh current WiFi status
    setTimeout(() => {
      getCurrentWiFi()
    }, 2000)
  } catch (error) {
    const err = error as Error
    console.error('[WiFiSelector] Failed to connect to WiFi:', err)
    ElMessage.error(t.value.wifi.connectFailed + ': ' + err.message)
  } finally {
    connecting.value = false
  }
}

// ==================== Lifecycle ====================
onMounted(() => {
  // Get current WiFi
  getCurrentWiFi()
  // Automatically scan WiFi networks
  scanWiFiNetworks()
})
</script>

<style scoped>
.wifi-selector .wifi-icon {
  font-size: 20px;
}
.wifi-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 200px;
}
.wifi-item.current {
  color: var(--el-color-primary);
  font-weight: 600;
}
.wifi-item .wifi-icon {
  font-size: 16px;
}
.wifi-item .wifi-name {
  flex: 1;
  font-size: 14px;
}
.wifi-item .lock-icon {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.wifi-item .check-mark {
  margin-left: auto;
  color: var(--el-color-primary);
  font-weight: bold;
  font-size: 16px;
}
.wifi-selector :deep(.el-dropdown-menu__item) {
  padding: 8px 16px;
}
.wifi-selector :deep(.el-dropdown-menu__item:hover) {
  background-color: var(--el-color-primary-light-9);
}
.wifi-selector :deep(.el-dropdown-menu__item.is-disabled) {
  opacity: 1;
}
/* Button styles */
.wifi-selector :deep(.el-button) {
  border: none;
  background: transparent;
}
.wifi-selector :deep(.el-button:hover) {
  background-color: var(--el-color-primary-light-9);
}
</style>
