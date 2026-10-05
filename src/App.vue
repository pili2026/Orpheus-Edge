<template>
  <div id="app" class="app-layout">
    <!-- Sidebar -->
    <el-aside :width="sidebarWidth" class="app-sidebar" :class="{ collapsed: isCollapsed }">
      <!-- Logo section — always visible, excluding the hamburger button -->
      <div class="sidebar-logo" @click="router.push('/')">
        <img src="@/assets/eversource-logo.png" alt="EVERSOURCE" class="logo-image" />
        <transition name="fade">
          <div v-show="!isCollapsed" class="logo-text">
            <div class="company-name-zh">永源智能</div>
            <div class="company-name-en">EVERSOURCE</div>
          </div>
        </transition>
      </div>

      <!-- Hamburger button — positioned above the menu -->
      <div class="menu-toggle-section">
        <button
          class="toggle-btn"
          @click="toggleSidebar"
          :title="isCollapsed ? t.nav.expandMenu : t.nav.collapseMenu"
        >
          <el-icon :size="20">
            <component :is="isCollapsed ? Expand : Fold" />
          </el-icon>
          <transition name="fade">
            <span v-show="!isCollapsed" class="toggle-text">{{ t.nav.toggleMenu }}</span>
          </transition>
        </button>
      </div>

      <!-- Navigation Menu -->
      <AppNavMenu :collapsed="isCollapsed" />

      <!-- Sidebar Footer -->
      <transition name="fade">
        <div v-show="!isCollapsed" class="sidebar-footer">
          <div class="version-info">v1.0.0</div>
        </div>
      </transition>
    </el-aside>

    <!-- Main Container -->
    <el-container class="main-container">
      <el-header height="60px" class="app-header">
        <div class="header-left">
          <h1 class="page-title">{{ getPageTitle() }}</h1>
        </div>

        <div class="header-right">
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
      </el-header>

      <el-main class="app-content">
        <router-view />
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { CircleCheck, CircleClose, Expand, Fold } from '@element-plus/icons-vue'
import LanguageSwitcher from '@/components/common/LanguageSwitcher.vue'
import WiFiSelector from '@/components/common/WiFiSelector.vue'
import AppNavMenu from '@/components/layout/AppNavMenu.vue'
import { useWebSocketStore } from '@/stores/websocket'
import { useUIStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const uiStore = useUIStore()
const { t } = storeToRefs(uiStore)
const websocketStore = useWebSocketStore()
const { isConnected } = storeToRefs(websocketStore)

const isCollapsed = ref(false)
const sidebarWidth = computed(() => (isCollapsed.value ? '64px' : '220px'))

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value
}

const needsWebSocket = computed(() => {
  return (
    route.path === '/dashboard' ||
    route.path.startsWith('/monitor') ||
    route.path.startsWith('/device/')
  )
})

const getPageTitle = () => {
  if (route.path.startsWith('/device/')) return t.value.nav.deviceDetail

  const routeTitleMap: Record<string, string> = {
    '/dashboard': t.value.nav.deviceMonitoring,
    '/monitor': t.value.nav.singleDeviceMonitor,
    '/parameter-tool': t.value.nav.parameterTesting,
    '/config/modbus': t.value.nav.modbusConfig,
    '/config/alert': t.value.nav.alertConfig,
    '/config/control': t.value.nav.controlConfig,
    '/config/instance': t.value.nav.instanceConfig,
    '/debug/wifi': t.value.nav.wifiInfo,
    '/provision': t.value.nav.provision,
  }
  return routeTitleMap[route.path] || t.value.nav.configuration
}

const wasConnectedByUs = ref(false)

watch(
  needsWebSocket,
  (needs, wasNeeded) => {
    if (needs && !isConnected.value) {
      websocketStore.connect()
      wasConnectedByUs.value = true
    } else if (!needs && wasNeeded && isConnected.value && wasConnectedByUs.value) {
      websocketStore.disconnect()
      wasConnectedByUs.value = false
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (wasConnectedByUs.value && isConnected.value) {
    websocketStore.disconnect()
  }
})
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.app-sidebar {
  background: #ffffff;
  color: #1f2937;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.06);
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.3s ease;
  border-right: 1px solid #e5e7eb;
}

/* Logo section — excluding the hamburger button */
.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px;
  cursor: pointer;
  transition: background 0.2s;
  user-select: none;
  border-bottom: 1px solid #e5e7eb;
  min-height: 72px;
  background: #f9fafb;
  justify-content: center;
}

.sidebar-logo:hover {
  background: #f3f4f6;
}

.logo-image {
  height: 36px;
  width: auto;
  flex-shrink: 0;
}

.logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.company-name-zh {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.company-name-en {
  font-size: 10px;
  font-weight: 500;
  color: #6b7280;
  letter-spacing: 0.5px;
}

.app-sidebar.collapsed .sidebar-logo {
  padding: 20px 14px;
}

/* Hamburger button area — positioned independently above the menu */
.menu-toggle-section {
  padding: 12px 16px 8px;
  border-bottom: 1px solid #e5e7eb;
}

.toggle-btn {
  width: 100%;
  height: 36px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #6b7280;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
  font-size: 13px;
  font-weight: 500;
}

.toggle-btn:hover {
  background: #f9fafb;
  color: #111827;
  border-color: #9ca3af;
}

.toggle-text {
  white-space: nowrap;
}

.app-sidebar.collapsed .toggle-btn {
  width: 36px;
  padding: 0;
  margin: 0 auto;
}

.sidebar-footer {
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  text-align: center;
  background: #f9fafb;
}

.version-info {
  font-size: 11px;
  color: #9ca3af;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.header-left {
  display: flex;
  align-items: center;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
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
  background: #f5f7fa;
  overflow-y: auto;
}

.app-sidebar::-webkit-scrollbar {
  width: 6px;
}

.app-sidebar::-webkit-scrollbar-track {
  background: #f9fafb;
}

.app-sidebar::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.app-sidebar::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>
