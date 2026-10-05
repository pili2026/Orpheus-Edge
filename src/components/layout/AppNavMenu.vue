<template>
  <el-menu
    :default-active="activeRoute"
    :default-openeds="collapsed ? [] : ['config-submenu']"
    router
    class="sidebar-menu"
    :class="{ collapsed }"
    :collapse="collapsed"
    @select="(index: string) => emit('select', index)"
  >
    <!-- Monitoring Group -->
    <div v-show="!collapsed" class="menu-group-title">
      {{ t.nav.monitoringGroup || '監控' }}
    </div>
    <el-menu-item index="/dashboard">
      <el-icon><Monitor /></el-icon>
      <template #title
        ><span>{{ t.nav.deviceMonitoring }}</span></template
      >
    </el-menu-item>

    <el-menu-item index="/monitor">
      <el-icon><DataLine /></el-icon>
      <template #title
        ><span>{{ t.nav.singleDeviceMonitor }}</span></template
      >
    </el-menu-item>

    <!-- Tools Group -->
    <div v-show="!collapsed" class="menu-group-title">{{ t.nav.toolsGroup || '工具' }}</div>
    <el-menu-item index="/parameter-tool">
      <el-icon><Tools /></el-icon>
      <template #title
        ><span>{{ t.nav.parameterTesting }}</span></template
      >
    </el-menu-item>

    <!-- System Group -->
    <div v-show="!collapsed" class="menu-group-title">{{ t.nav.systemGroup || '系統' }}</div>
    <el-menu-item index="/debug/wifi">
      <el-icon><Connection /></el-icon>
      <template #title
        ><span>{{ t.nav.wifiInfo }}</span></template
      >
    </el-menu-item>

    <el-menu-item index="/provision">
      <el-icon><DocumentCopy /></el-icon>
      <template #title
        ><span>{{ t.nav.provision }}</span></template
      >
    </el-menu-item>

    <!-- Configuration Group -->
    <div v-show="!collapsed" class="menu-group-title">{{ t.nav.configGroup || '配置' }}</div>
    <el-sub-menu index="config-submenu">
      <template #title>
        <el-icon><Setting /></el-icon>
        <span>{{ t.nav.configuration }}</span>
      </template>

      <el-menu-item index="/config/system">
        <el-icon><Setting /></el-icon>
        <template #title>
          <span>{{ t.nav.systemConfig }}</span>
        </template>
      </el-menu-item>

      <el-menu-item index="/config/modbus">
        <el-icon><EditPen /></el-icon>
        <template #title
          ><span>{{ t.nav.modbusConfig }}</span></template
        >
      </el-menu-item>
      <el-menu-item index="/config/instance">
        <el-icon><Lock /></el-icon>
        <template #title>
          <span>{{ t.nav.instanceConfig }}</span>
        </template>
      </el-menu-item>
      <el-menu-item
        index="/config/time_control"
        class="disabled-item"
        @click.prevent="handleDisabledClick(t.nav.timeControlConfig)"
      >
        <el-icon><Operation /></el-icon>
        <template #title>
          <span class="disabled-text">
            {{ t.nav.timeControlConfig }}
            <el-icon class="lock-icon"><Lock /></el-icon>
          </span>
        </template>
      </el-menu-item>
      <el-menu-item
        index="/config/control"
        class="disabled-item"
        @click.prevent="handleDisabledClick(t.nav.controlConfig)"
      >
        <el-icon><Operation /></el-icon>
        <template #title>
          <span class="disabled-text">
            {{ t.nav.controlConfig }}
            <el-icon class="lock-icon"><Lock /></el-icon>
          </span>
        </template>
      </el-menu-item>
      <el-menu-item
        index="/config/alert"
        class="disabled-item"
        @click.prevent="handleDisabledClick(t.nav.alertConfig)"
      >
        <el-icon><Bell /></el-icon>
        <template #title>
          <span class="disabled-text">
            {{ t.nav.alertConfig }}
            <el-icon class="lock-icon"><Lock /></el-icon>
          </span>
        </template>
      </el-menu-item>
    </el-sub-menu>
  </el-menu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import {
  Monitor,
  DataLine,
  Tools,
  Operation,
  Setting,
  EditPen,
  Bell,
  Lock,
  DocumentCopy,
  Connection,
} from '@element-plus/icons-vue'
import { useUIStore } from '@/stores/ui'

defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ select: [index: string] }>()

const route = useRoute()
const { t } = storeToRefs(useUIStore())

const handleDisabledClick = (itemName: string) => {
  ElMessage.info({
    message: `${itemName} 功能即將推出，敬請期待 🔒`,
    duration: 3000,
  })
}

const activeRoute = computed(() => {
  if (route.path.startsWith('/debug')) return '/debug/wifi'
  if (route.path.startsWith('/config')) return route.path
  return route.path
})
</script>

<style scoped>
/* Menu */
.sidebar-menu {
  flex: 1;
  border-right: none;
  background: #ffffff;
  padding: 8px 0;
}

.menu-group-title {
  padding: 16px 20px 8px;
  font-size: 12px;
  color: #9ca3af;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-top: 8px;
}

.menu-group-title:first-child {
  margin-top: 0;
}

.sidebar-menu :deep(.el-menu-item) {
  color: #4b5563;
  transition: all 0.2s;
  border-left: 3px solid transparent;
  padding-left: 17px !important;
  background: #ffffff;
}

.sidebar-menu :deep(.el-menu-item:hover) {
  background: #f9fafb;
  color: #111827;
}

.sidebar-menu :deep(.el-menu-item.is-active:not(.disabled-item)) {
  background: #eff6ff;
  color: #2563eb;
  border-left-color: #2563eb;
  font-weight: 500;
}

.sidebar-menu :deep(.el-menu-item.disabled-item) {
  color: #d1d5db !important;
  cursor: not-allowed;
  background: #fafafa;
}

.sidebar-menu :deep(.el-menu-item.disabled-item:hover) {
  background: #f5f5f5 !important;
  color: #d1d5db !important;
}

.sidebar-menu :deep(.el-menu-item.disabled-item .el-icon) {
  color: #d1d5db !important;
}

.disabled-text {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.lock-icon {
  font-size: 12px !important;
  margin-left: 8px;
  opacity: 0.6;
}

.sidebar-menu :deep(.el-sub-menu__title) {
  color: #4b5563;
  transition: all 0.2s;
  border-left: 3px solid transparent;
  padding-left: 17px !important;
  background: #ffffff;
}

.sidebar-menu :deep(.el-sub-menu__title:hover) {
  background: #f9fafb;
  color: #111827;
}

.sidebar-menu :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
  color: #2563eb;
  font-weight: 500;
}

.sidebar-menu :deep(.el-sub-menu .el-menu-item) {
  padding-left: 50px !important;
  min-width: auto;
  background: #f9fafb;
}

.sidebar-menu :deep(.el-sub-menu .el-menu-item:hover) {
  background: #f3f4f6;
}

.sidebar-menu :deep(.el-icon) {
  color: inherit;
  margin-right: 10px;
  font-size: 16px;
}

.sidebar-menu.collapsed :deep(.el-sub-menu .el-menu-item) {
  padding-left: 20px !important;
}
</style>
