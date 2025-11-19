<template>
  <div class="wifi-selector">
    <el-dropdown trigger="click" @command="handleCommand">
      <el-button circle :loading="wifiLoading">
        <span class="icon">{{ currentWifiIcon }}</span>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <div class="dropdown-header">
            <span>{{ t.wifi.title }}</span>
            <el-button
              :icon="Refresh"
              size="small"
              circle
              text
              @click.stop="loadWifiNetworks(true)"
            />
          </div>
          <el-divider style="margin: 4px 0" />
          <template v-if="availableWifiNetworks.length > 0">
            <el-dropdown-item
              v-for="wifi in availableWifiNetworks"
              :key="wifi.ssid"
              :command="wifi.ssid"
              :class="{ active: selectedWifi === wifi.ssid }"
            >
              <span class="wifi-ssid">{{ wifi.ssid }}</span>
              <span v-if="wifi.signal_strength" class="wifi-signal">
                <el-icon><Notification /></el-icon>
                {{ wifi.signal_strength }}%
              </span>
              <span v-if="selectedWifi === wifi.ssid" class="check-mark">✓</span>
            </el-dropdown-item>
          </template>
          <template v-else>
            <div class="empty-state">
              <span>{{ t.wifi.noNetworks }}</span>
            </div>
          </template>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Notification } from '@element-plus/icons-vue'
import { useI18n } from '@/composables/useI18n'
import api from '@/services/api'

// ==================== Composables ====================
const { t } = useI18n()

// ==================== 資料 ====================
interface WifiNetwork {
  ssid: string
  signal_strength?: number
  is_connected?: boolean
}

const availableWifiNetworks = ref<WifiNetwork[]>([])
const wifiLoading = ref(false)
const selectedWifi = ref<string>('')

// ==================== Computed ====================
const currentWifiIcon = computed(() => {
  if (selectedWifi.value) {
    return '📶' // 已連線 WiFi
  }
  return '📡' // 未連線
})

// ==================== 方法 ====================
const loadWifiNetworks = async (forceReload = false) => {
  // 如果已經載入過且不是強制重載，就跳過
  if (availableWifiNetworks.value.length > 0 && !forceReload) return

  wifiLoading.value = true
  try {
    const response = await api.get('/wifi/networks')
    availableWifiNetworks.value = response.data.networks || response.data || []

    // 自動選擇已連線的 WiFi
    const connectedWifi = availableWifiNetworks.value.find((wifi) => wifi.is_connected)
    if (connectedWifi) {
      selectedWifi.value = connectedWifi.ssid
    }

    console.log('[WiFiSelector] Loaded WiFi networks:', availableWifiNetworks.value)

    if (forceReload) {
      ElMessage.success(t.value.wifi.refreshSuccess)
    }
  } catch (error) {
    const err = error as Error
    console.error('[WiFiSelector] Failed to load WiFi networks:', err)
    // WiFi 功能是選用的，如果 API 不存在就不顯示錯誤
    if (!err.message.includes('404') && !err.message.includes('Network Error')) {
      ElMessage.warning(`${t.value.wifi.loadFailed}: ${err.message}`)
    }
  } finally {
    wifiLoading.value = false
  }
}

const handleCommand = async (ssid: string) => {
  if (ssid === selectedWifi.value) return

  try {
    // 呼叫連線 API
    await api.post('/wifi/connect', { ssid })
    selectedWifi.value = ssid
    ElMessage.success(`${t.value.wifi.connectSuccess}: ${ssid}`)
  } catch (error) {
    const err = error as Error
    console.error('[WiFiSelector] Failed to connect to WiFi:', err)
    ElMessage.error(`${t.value.wifi.connectFailed}: ${err.message}`)
  }
}

// ==================== 生命週期 ====================
onMounted(() => {
  loadWifiNetworks()
})
</script>

<style scoped lang="scss">
.wifi-selector .icon {
  font-size: 20px;
}

.wifi-selector :deep(.el-button) {
  border: none;
  background: transparent;
}

.wifi-selector :deep(.el-button:hover) {
  background-color: var(--el-color-primary-light-9);
}

.dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.wifi-selector :deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  min-width: 200px;
  gap: 8px;
}

.wifi-ssid {
  flex: 1;
  font-size: 14px;
}

.wifi-signal {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.check-mark {
  margin-left: auto;
  color: var(--el-color-primary);
  font-weight: bold;
  font-size: 16px;
}

.wifi-selector :deep(.el-dropdown-menu__item.active) {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.wifi-selector :deep(.el-dropdown-menu__item:hover) {
  background-color: var(--el-color-primary-light-8);
}

.empty-state {
  padding: 16px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
