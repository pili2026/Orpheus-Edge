<template>
  <div class="sidebar-container" :class="{ collapsed: isCollapsed }">
    <div class="logo-section">
      <div class="logo-content">
        <img src="@/assets/logo.png" alt="永源智能" class="logo-img" />
        <transition name="fade">
          <div v-show="!isCollapsed" class="logo-text">
            <div class="company-name-zh">永源智能</div>
            <div class="company-name-en">EVERSOURCE</div>
          </div>
        </transition>
      </div>

      <button class="toggle-btn" @click="toggleSidebar" :title="isCollapsed ? '展開' : '收合'">
        <el-icon :size="20">
          <component :is="isCollapsed ? Expand : Fold" />
        </el-icon>
      </button>
    </div>

    <nav class="nav-menu">
      <div class="nav-group">
        <div v-show="!isCollapsed" class="group-title">MONITORING</div>

        <router-link
          v-for="item in monitoringItems"
          :key="item.path"
          :to="item.path"
          :class="['nav-item', { disabled: !item.enabled }]"
          @click.prevent="handleNavClick(item)"
        >
          <el-icon :size="20" class="nav-icon">
            <component :is="item.icon" />
          </el-icon>
          <transition name="fade">
            <span v-show="!isCollapsed" class="nav-text">{{ item.label }}</span>
          </transition>

          <el-tooltip v-if="isCollapsed" :content="item.label" placement="right" :show-after="300">
            <div class="tooltip-trigger"></div>
          </el-tooltip>
        </router-link>
      </div>

      <div class="nav-group">
        <div v-show="!isCollapsed" class="group-title">TOOLS</div>

        <router-link
          v-for="item in toolsItems"
          :key="item.path"
          :to="item.path"
          :class="['nav-item', { disabled: !item.enabled }]"
          @click.prevent="handleNavClick(item)"
        >
          <el-icon :size="20" class="nav-icon">
            <component :is="item.icon" />
          </el-icon>
          <transition name="fade">
            <span v-show="!isCollapsed" class="nav-text">{{ item.label }}</span>
          </transition>

          <el-tooltip v-if="isCollapsed" :content="item.label" placement="right" :show-after="300">
            <div class="tooltip-trigger"></div>
          </el-tooltip>
        </router-link>
      </div>

      <div class="nav-group">
        <div v-show="!isCollapsed" class="group-title">CONFIGURATION</div>

        <router-link
          v-for="item in configItems"
          :key="item.path"
          :to="item.path"
          :class="[
            'nav-item',
            { disabled: !item.enabled, active: item.enabled && isActive(item.path) },
          ]"
          @click.prevent="handleNavClick(item)"
        >
          <el-icon :size="20" class="nav-icon">
            <component :is="item.icon" />
          </el-icon>
          <transition name="fade">
            <span v-show="!isCollapsed" class="nav-text">{{ item.label }}</span>
          </transition>

          <el-tooltip v-if="isCollapsed" :content="item.label" placement="right" :show-after="300">
            <div class="tooltip-trigger"></div>
          </el-tooltip>
        </router-link>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Monitor,
  VideoCamera,
  Setting,
  Bell,
  Operation,
  Edit,
  Expand,
  Fold,
} from '@element-plus/icons-vue'

interface NavItem {
  path: string
  label: string
  icon: any
  enabled: boolean
}

const route = useRoute()
const router = useRouter()

const isCollapsed = ref(false)

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value
}

const monitoringItems: NavItem[] = [
  {
    path: '/monitoring/device',
    label: 'Device Monitoring',
    icon: Monitor,
    enabled: true,
  },
  {
    path: '/monitoring/single',
    label: 'Single Device Monitor',
    icon: VideoCamera,
    enabled: true,
  },
]

const toolsItems: NavItem[] = [
  {
    path: '/tools/parameter-testing',
    label: 'Parameter Testing',
    icon: Setting,
    enabled: true,
  },
]

const configItems: NavItem[] = [
  {
    path: '/config/modbus',
    label: 'Modbus',
    icon: Edit,
    enabled: true,
  },
  {
    path: '/config/alerts',
    label: 'Alerts',
    icon: Bell,
    enabled: false,
  },
  {
    path: '/config/control',
    label: 'Control',
    icon: Operation,
    enabled: false,
  },
]

const isActive = (path: string) => {
  return route.path.startsWith(path)
}

const handleNavClick = (item: NavItem) => {
  if (!item.enabled) {
    ElMessage.info({
      message: '此功能即將推出，敬請期待',
      duration: 3000,
    })
    return
  }

  router.push(item.path)
}
</script>

<style scoped>
.sidebar-container {
  width: 280px;
  height: 100vh;
  background: linear-gradient(180deg, #1a2332 0%, #0f1419 100%);
  color: #e5e7eb;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  position: relative;
  overflow: hidden;
}

.sidebar-container.collapsed {
  width: 64px;
}

.logo-section {
  padding: 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 80px;
  background: rgba(0, 0, 0, 0.2);
}

.logo-content {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.logo-img {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 8px;
}

.logo-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.company-name-zh {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
}

.company-name-en {
  font-size: 11px;
  font-weight: 500;
  color: #9ca3af;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  white-space: nowrap;
}

.toggle-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.sidebar-container.collapsed .logo-content {
  justify-content: center;
}

.sidebar-container.collapsed .toggle-btn {
  position: absolute;
  right: 16px;
  top: 24px;
}

.nav-menu {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 0;
}

.nav-menu::-webkit-scrollbar {
  width: 4px;
}

.nav-menu::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.nav-group {
  margin-bottom: 24px;
}

.group-title {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 8px 20px;
  margin-bottom: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  color: #9ca3af;
  text-decoration: none;
  transition: all 0.2s;
  position: relative;
  cursor: pointer;
  border-left: 3px solid transparent;
}

.nav-item:not(.disabled):hover {
  background: rgba(59, 130, 246, 0.1);
  color: #60a5fa;
  border-left-color: #3b82f6;
}

.nav-item.active {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
  border-left-color: #3b82f6;
}

.nav-item.disabled {
  color: #4b5563;
  cursor: not-allowed;
  opacity: 0.5;
}

.nav-item.disabled:hover {
  background: rgba(75, 85, 99, 0.1);
  color: #6b7280;
  border-left-color: transparent;
}

.nav-icon {
  flex-shrink: 0;
}

.nav-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 500;
}

.sidebar-container.collapsed .nav-item {
  padding: 12px;
  justify-content: center;
  gap: 0;
}

.sidebar-container.collapsed .group-title {
  display: none;
}

.tooltip-trigger {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
