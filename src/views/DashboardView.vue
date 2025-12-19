<!-- src/views/DashboardView.vue -->
<template>
  <div class="dashboard-container">
    <!-- Header -->
    <div class="dashboard-header">
      <div class="stats">
        <el-statistic title="Total Devices" :value="totalDevices" />
        <el-statistic title="Online" :value="onlineCount">
          <template #suffix>
            <el-icon color="#67C23A"><CircleCheck /></el-icon>
          </template>
        </el-statistic>
        <el-statistic title="Offline" :value="offlineCount">
          <template #suffix>
            <el-icon color="#F56C6C"><CircleClose /></el-icon>
          </template>
        </el-statistic>
      </div>

      <div class="controls">
        <!-- Refresh button -->
        <el-button type="primary" :icon="Refresh" :loading="isRefreshing" @click="handleRefresh">
          Refresh
        </el-button>

        <!-- Layout mode switcher -->
        <el-segmented v-model="layoutMode" :options="layoutOptions" />

        <!-- Drag mode toggle -->
        <el-switch
          v-if="layoutMode !== 'auto'"
          v-model="enableDrag"
          active-text="Drag Mode"
          inactive-text="View Mode"
          @change="handleDragModeChange"
        />

        <!-- Reset button -->
        <el-button v-if="enableDrag" type="primary" :icon="RefreshLeft" @click="resetLayout">
          Reset Layout
        </el-button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isConnecting" class="loading-container">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      <p>Connecting to device monitoring service...</p>
    </div>

    <!-- Error -->
    <el-alert
      v-if="connectionError"
      title="Connection Failed"
      type="error"
      :description="connectionError"
      show-icon
      :closable="false"
      style="margin-top: 16px"
    />

    <!-- Debug Info -->
    <el-card v-if="!isConnecting && !connectionError" style="margin-bottom: 16px">
      <template #header>Debug Info</template>
      <div>
        <p>Layout Mode: {{ layoutMode }}</p>
        <p>Display Devices: {{ displayDevices.length }}</p>
        <p>Grid Layout Items: {{ gridLayout.length }}</p>
        <p>Enable Drag: {{ enableDrag }}</p>
      </div>
    </el-card>

    <!-- Auto Grid Layout (CSS Grid) -->
    <div
      v-if="!isConnecting && !connectionError && layoutMode === 'auto' && displayDevices.length > 0"
      class="device-grid"
    >
      <div
        v-for="device in displayDevices"
        :key="device.deviceId"
        class="device-card-wrapper"
        @click="handleDeviceClick(device.deviceId)"
      >
        <DeviceCard :device="device" :clickable="true" />
      </div>
    </div>

    <!-- List Layout (Draggable) -->
    <VueDraggable
      v-if="!isConnecting && !connectionError && layoutMode === 'list' && displayDevices.length > 0"
      v-model="displayDevices"
      :animation="200"
      :disabled="!enableDrag"
      class="device-grid"
      handle=".drag-handle"
      @end="handleDragEnd"
    >
      <div
        v-for="device in displayDevices"
        :key="device.deviceId"
        class="device-card-wrapper"
        :class="{ 'drag-enabled': enableDrag }"
      >
        <!-- Drag handle -->
        <div v-if="enableDrag" class="drag-handle">
          <el-icon><Rank /></el-icon>
        </div>

        <DeviceCard
          :device="device"
          :clickable="!enableDrag"
          @click="handleDeviceClick(device.deviceId)"
        />
      </div>
    </VueDraggable>

    <!-- Grid Layout (vue-grid-layout) -->
    <div v-if="!isConnecting && !connectionError && layoutMode === 'grid'">
      <p v-if="gridLayout.length === 0" style="padding: 20px; text-align: center; color: #999">
        Initializing grid layout...
      </p>

      <grid-layout
        v-if="gridLayout.length > 0"
        v-model:layout="gridLayout"
        :col-num="12"
        :row-height="30"
        :is-draggable="enableDrag"
        :is-resizable="enableDrag"
        :vertical-compact="true"
        :use-css-transforms="true"
        :margin="[16, 16]"
        class="grid-container"
        @layout-updated="handleLayoutUpdate"
      >
        <grid-item
          v-for="item in gridLayout"
          :key="item.i"
          :x="item.x"
          :y="item.y"
          :w="item.w"
          :h="item.h"
          :i="item.i"
          :static="!enableDrag"
        >
          <div v-if="!getDeviceById(item.i)" style="padding: 20px; background: #f5f5f5">
            Device {{ item.i }} not found
          </div>
          <DeviceCard
            v-else
            :device="getDeviceById(item.i)"
            :clickable="!enableDrag"
            @click="handleDeviceClick(item.i)"
          />
        </grid-item>
      </grid-layout>
    </div>

    <!-- Empty state -->
    <el-empty
      v-if="!isConnecting && !connectionError && displayDevices.length === 0"
      description="No devices"
      style="margin-top: 40px"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { VueDraggable } from 'vue-draggable-plus'
import { GridLayout, GridItem } from 'vue-grid-layout'
import {
  CircleCheck,
  CircleClose,
  Rank,
  Loading,
  Refresh,
  RefreshLeft,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import DeviceCard from '@/components/DeviceCard.vue'
import { useDashboard } from '@/composables/useDashboard'

const router = useRouter()

// Layout mode options
const layoutMode = ref<'auto' | 'list' | 'grid'>('auto')
const layoutOptions = [
  { label: 'Auto', value: 'auto' },
  { label: 'List', value: 'list' },
  { label: 'Grid', value: 'grid' },
]

// State
const enableDrag = ref(false)
const displayDevices = ref<any[]>([])
const gridLayout = ref<any[]>([])
const isRefreshing = ref(false)
const lastRefreshTime = ref(0)

const { devices, isConnecting, connectionError, totalDevices, onlineCount, offlineCount } =
  useDashboard()

// ========================================
// Lifecycle Hooks
// ========================================

onMounted(() => {
  console.log('[Dashboard] Component mounted')

  // Load saved layout mode
  const savedMode = localStorage.getItem('talos_layout_mode')
  if (savedMode && ['auto', 'list', 'grid'].includes(savedMode)) {
    layoutMode.value = savedMode as 'auto' | 'list' | 'grid'
    console.log('[Dashboard] Loaded saved layout mode:', savedMode)
  }

  // Immediately load existing devices
  if (devices.value.length > 0) {
    console.log('[Dashboard] Loading existing devices on mount:', devices.value.length)
    loadDeviceOrder(devices.value)
    loadGridLayout(devices.value)
  } else {
    console.log('[Dashboard] No devices on mount, will load when devices arrive')
  }
})

// ========================================
// Watchers
// ========================================

watch(
  devices,
  (newDevices, oldDevices) => {
    console.log('[Dashboard] Devices watch triggered')
    console.log('[Dashboard] Old devices:', oldDevices?.length || 0)
    console.log('[Dashboard] New devices:', newDevices?.length || 0)
    console.log('[Dashboard] Current displayDevices:', displayDevices.value.length)
    console.log('[Dashboard] Current gridLayout:', gridLayout.value.length)

    if (displayDevices.value.length === 0 && newDevices.length > 0) {
      console.log('[Dashboard] Initial device load triggered')
      loadDeviceOrder(newDevices)
      loadGridLayout(newDevices)
    } else if (newDevices.length > 0) {
      console.log('[Dashboard] Updating existing devices')
      updateDeviceData(newDevices)
      updateGridLayout(newDevices)
    } else {
      console.log('[Dashboard] No action taken - no devices')
    }
  },
  { deep: true, immediate: true },
)

watch(layoutMode, (newMode) => {
  console.log('[Dashboard] Layout mode changed:', newMode)
  localStorage.setItem('talos_layout_mode', newMode)

  if (newMode === 'auto') {
    enableDrag.value = false
  }

  // Ensure grid layout is initialized when switching to grid mode
  if (newMode === 'grid' && gridLayout.value.length === 0 && devices.value.length > 0) {
    console.log('[Dashboard] Grid mode activated, initializing layout')
    loadGridLayout(devices.value)
  }
})

// ========================================
// List Layout Functions
// ========================================

const loadDeviceOrder = (newDevices: any[]) => {
  const saved = localStorage.getItem('talos_device_order')

  if (saved) {
    try {
      const order: string[] = JSON.parse(saved)
      const ordered = [...newDevices].sort((a, b) => {
        const indexA = order.indexOf(a.deviceId)
        const indexB = order.indexOf(b.deviceId)
        if (indexA === -1) return 1
        if (indexB === -1) return -1
        return indexA - indexB
      })
      displayDevices.value = ordered
      console.log('[Dashboard] Loaded device order:', ordered.length)
    } catch (e) {
      console.error('[Dashboard] Failed to load device order:', e)
      displayDevices.value = [...newDevices]
    }
  } else {
    displayDevices.value = [...newDevices]
    console.log('[Dashboard] No saved order, using default')
  }
}

const updateDeviceData = (newDevices: any[]) => {
  displayDevices.value = displayDevices.value.map((orderedDevice) => {
    const updated = newDevices.find((d) => d.deviceId === orderedDevice.deviceId)
    return updated || orderedDevice
  })

  newDevices.forEach((newDevice) => {
    if (!displayDevices.value.find((d) => d.deviceId === newDevice.deviceId)) {
      displayDevices.value.push(newDevice)
      console.log('[Dashboard] Added new device:', newDevice.deviceId)
    }
  })
}

const saveDeviceOrder = () => {
  const order = displayDevices.value.map((d) => d.deviceId)
  localStorage.setItem('talos_device_order', JSON.stringify(order))
  ElMessage.success('Device order saved')
}

const handleDragEnd = () => {
  saveDeviceOrder()
}

// ========================================
// Grid Layout Functions
// ========================================

const loadGridLayout = (newDevices: any[]) => {
  console.log('[Dashboard] loadGridLayout called, devices:', newDevices.length)

  const saved = localStorage.getItem('talos_grid_layout')

  if (saved) {
    try {
      const savedLayout = JSON.parse(saved)
      console.log('[Dashboard] Found saved grid layout:', savedLayout.length)

      gridLayout.value = newDevices.map((device, index) => {
        const existing = savedLayout.find((item: any) => item.i === device.deviceId)
        if (existing) {
          return existing
        }
        return generateGridItem(device.deviceId, index)
      })
    } catch (e) {
      console.error('[Dashboard] Failed to parse grid layout:', e)
      gridLayout.value = generateDefaultLayout(newDevices)
    }
  } else {
    console.log('[Dashboard] No saved grid layout, generating default')
    gridLayout.value = generateDefaultLayout(newDevices)
  }

  console.log('[Dashboard] Grid layout loaded:', gridLayout.value)
}

const generateDefaultLayout = (devices: any[]) => {
  const layout = devices.map((device, index) => generateGridItem(device.deviceId, index))
  console.log('[Dashboard] Generated default layout:', layout)
  return layout
}

const generateGridItem = (deviceId: string, index: number) => {
  const col = (index % 3) * 4
  const row = Math.floor(index / 3) * 8
  return {
    i: deviceId,
    x: col,
    y: row,
    w: 4,
    h: 8,
  }
}

const updateGridLayout = (newDevices: any[]) => {
  newDevices.forEach((device) => {
    if (!gridLayout.value.find((item) => item.i === device.deviceId)) {
      const index = gridLayout.value.length
      gridLayout.value.push(generateGridItem(device.deviceId, index))
      console.log('[Dashboard] Added device to grid:', device.deviceId)
    }
  })

  gridLayout.value = gridLayout.value.filter((item) =>
    newDevices.find((d) => d.deviceId === item.i),
  )
}

const handleLayoutUpdate = (newLayout: any[]) => {
  console.log('[Dashboard] Layout updated, saving...')
  localStorage.setItem('talos_grid_layout', JSON.stringify(newLayout))
}

const getDeviceById = (deviceId: string) => {
  const device = devices.value.find((d) => d.deviceId === deviceId)
  if (!device) {
    console.warn('[Dashboard] Device not found:', deviceId)
  }
  return device
}

// ========================================
// Common Functions
// ========================================

const handleDragModeChange = (enabled: boolean) => {
  if (enabled) {
    ElMessage.info('Drag mode enabled')
  } else {
    if (layoutMode.value === 'list') {
      saveDeviceOrder()
    } else if (layoutMode.value === 'grid') {
      localStorage.setItem('talos_grid_layout', JSON.stringify(gridLayout.value))
      ElMessage.success('Grid layout saved')
    }
  }
}

const resetLayout = () => {
  if (layoutMode.value === 'list') {
    localStorage.removeItem('talos_device_order')
    displayDevices.value = [...devices.value]
    ElMessage.success('List order reset')
  } else if (layoutMode.value === 'grid') {
    localStorage.removeItem('talos_grid_layout')
    gridLayout.value = generateDefaultLayout(devices.value)
    ElMessage.success('Grid layout reset')
  }
}

const handleDeviceClick = (deviceId: string) => {
  if (!enableDrag.value) {
    router.push(`/device/${deviceId}`)
  }
}

const handleRefresh = async () => {
  const now = Date.now()
  const COOLDOWN = 5000

  if (now - lastRefreshTime.value < COOLDOWN) {
    const remaining = Math.ceil((COOLDOWN - (now - lastRefreshTime.value)) / 1000)
    ElMessage.warning(`Please wait ${remaining} seconds before refreshing`)
    return
  }

  isRefreshing.value = true
  lastRefreshTime.value = now

  try {
    await axios.post('/api/devices/refresh')
    ElMessage.success('Device data refreshed')
  } catch (error: any) {
    console.error('[Dashboard] Refresh failed:', error)

    // Check if it's 404 (API not implemented yet)
    if (error.response?.status === 404) {
      ElMessage.warning('Refresh API not implemented yet')
    } else {
      ElMessage.error('Refresh failed')
    }
  } finally {
    setTimeout(() => {
      isRefreshing.value = false
    }, 500)
  }
}
</script>

<style scoped>
/* ... 樣式保持不變 ... */
.dashboard-container {
  padding: 20px;
  max-width: 1600px;
  margin: 0 auto;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 20px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

.stats {
  display: flex;
  gap: 60px;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #909399;
}

.loading-container p {
  margin-top: 16px;
  font-size: 14px;
}

.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  padding: 16px 0;
}

.device-card-wrapper {
  position: relative;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  border-radius: 8px;
}

.device-card-wrapper:not(.drag-enabled):hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.device-card-wrapper.drag-enabled {
  cursor: move;
}

.drag-handle {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  cursor: move;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 6px;
  padding: 6px 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #606266;
  transition: all 0.2s;
}

.drag-handle:hover {
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  color: #409eff;
}

.device-card-wrapper.sortable-chosen {
  opacity: 0.6;
}

.device-card-wrapper.sortable-ghost {
  opacity: 0.3;
  background: #f5f7fa;
  border: 2px dashed #409eff;
}

.grid-container {
  padding: 16px 0;
  background: transparent;
  min-height: 400px;
}

.grid-container :deep(.vue-grid-item) {
  background: transparent;
  border-radius: 8px;
  transition: all 0.3s;
}

.grid-container :deep(.vue-grid-item:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.grid-container :deep(.vue-grid-item.vue-grid-placeholder) {
  background: rgba(64, 158, 255, 0.2);
  border: 2px dashed #409eff;
  border-radius: 8px;
}

.grid-container :deep(.vue-grid-item > .vue-resizable-handle) {
  background: #409eff;
  opacity: 0.3;
}

.grid-container :deep(.vue-grid-item > .vue-resizable-handle:hover) {
  opacity: 1;
}
</style>
