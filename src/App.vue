<template>
  <div id="app">
    <!-- Header Navigation -->
    <div class="app-header">
      <div class="header-left">
        <div class="logo" @click="router.push('/')">
          <img src="@/assets/eversource-logo.png" alt="EVERSOURCE" class="logo-image" />
          <div class="logo-text">
            <div class="company-name-zh">永源智能</div>
            <div class="company-name-en">EVERSOURCE</div>
          </div>
        </div>
      </div>

      <div class="header-center">
        <el-menu
          :default-active="activeRoute"
          mode="horizontal"
          :ellipsis="false"
          router
          class="header-menu"
        >
          <el-menu-item index="/dashboard">
            <el-icon><Monitor /></el-icon>
            <span>{{ t.nav.deviceMonitoring }}</span>
          </el-menu-item>

          <el-menu-item index="/parameter-tool">
            <el-icon><Tools /></el-icon>
            <span>{{ t.nav.parameterTesting }}</span>
          </el-menu-item>

          <el-menu-item index="/debug">
            <el-icon><Setting /></el-icon>
            <span>{{ t.nav.debugTools }}</span>
          </el-menu-item>
        </el-menu>
      </div>

      <div class="header-right">
        <!-- Only show connection status on routes that need WebSocket -->
        <el-tag
          v-if="needsWebSocket"
          :type="isConnected ? 'success' : 'danger'"
          size="small"
          effect="plain"
          class="connection-status"
        >
          <el-icon class="status-icon">
            <component :is="isConnected ? CircleCheck : CircleClose" />
          </el-icon>
          {{ isConnected ? t.nav.connected : t.nav.disconnected }}
        </el-tag>

        <WiFiSelector />
        <LanguageSwitcher />
      </div>
    </div>

    <div class="app-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Monitor, Setting, Tools, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import LanguageSwitcher from '@/components/common/LanguageSwitcher.vue'
import WiFiSelector from '@/components/common/WiFiSelector.vue'
import { useWebSocketStore } from '@/stores/websocket'
import { useUIStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const uiStore = useUIStore()
const { t } = storeToRefs(uiStore)
const websocketStore = useWebSocketStore()

const { isConnected } = storeToRefs(websocketStore)

const activeRoute = computed(() => route.path)

// Define routes that need WebSocket
const ROUTES_NEEDING_WEBSOCKET = ['/dashboard', '/debug']

// Check if current route needs WebSocket
const needsWebSocket = computed(() => {
  return ROUTES_NEEDING_WEBSOCKET.includes(route.path)
})

// Track if we connected the WebSocket
const wasConnectedByUs = ref(false)

// Watch route changes and manage WebSocket connection
watch(
  needsWebSocket,
  (needs, wasNeeded) => {
    console.log('[App] Route changed:', {
      path: route.path,
      needsWebSocket: needs,
      wasNeeded: wasNeeded,
      isConnected: isConnected.value,
    })

    if (needs && !isConnected.value) {
      // Route needs WebSocket and not connected
      console.log('[App] 🔌 Connecting WebSocket for route:', route.path)
      websocketStore.connect()
      wasConnectedByUs.value = true
    } else if (!needs && wasNeeded && isConnected.value && wasConnectedByUs.value) {
      // Leaving a route that needed WebSocket, and we connected it
      console.log('[App] 🔌 Disconnecting WebSocket for route:', route.path)
      websocketStore.disconnect()
      wasConnectedByUs.value = false
    } else if (!needs) {
      console.log('[App] ℹ️  Route does not need WebSocket:', route.path)
    }
  },
  { immediate: true },
)

// Clean up on unmount
onUnmounted(() => {
  if (wasConnectedByUs.value && isConnected.value) {
    console.log('[App] App unmounting, disconnecting WebSocket')
    websocketStore.disconnect()
  }
})
</script>

<style scoped>
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  height: 64px;
}

.header-left {
  display: flex;
  align-items: center;
  min-width: 200px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: opacity 0.3s;
  user-select: none;
}

.logo:hover {
  opacity: 0.8;
}

.logo-image {
  height: 36px;
  width: auto;
}

.logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.company-name-zh {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.company-name-en {
  font-size: 11px;
  font-weight: 500;
  color: #6b7280;
  letter-spacing: 0.5px;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 0 40px;
}

.header-menu {
  border-bottom: none;
  background: transparent;
}

.header-menu :deep(.el-menu-item) {
  font-size: 14px;
  height: 64px;
  line-height: 64px;
  border-bottom: 2px solid transparent;
  padding: 0 20px;
}

.header-menu :deep(.el-menu-item:hover) {
  background: rgba(64, 158, 255, 0.05);
}

.header-menu :deep(.el-menu-item.is-active) {
  border-bottom-color: #409eff;
  color: #409eff;
  background: rgba(64, 158, 255, 0.05);
}

.header-menu :deep(.el-icon) {
  margin-right: 6px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.connection-status {
  padding: 4px 12px;
}

.status-icon {
  margin-right: 4px;
  vertical-align: middle;
}

.app-content {
  padding: 0;
  height: calc(100vh - 64px);
  overflow-y: auto;
  background: #f5f7fa;
}
</style>
