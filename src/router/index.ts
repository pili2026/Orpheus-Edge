import { createRouter, createWebHistory } from 'vue-router'

// ===== Views =====
const DashboardView = () => import('@/views/DashboardView.vue')
const MonitorView = () => import('@/views/MonitorView.vue')
const ParameterToolView = () => import('@/views/ParameterTestingToolView.vue')
const DebugWiFiView = () => import('@/views/debug/DebugNetworkPage.vue')
const ProvisionView = () => import('@/views/ProvisionView.vue')

// ===== Config Views =====
const ModbusConfigView = () => import('@/views/config/ModbusConfigView.vue')
const AlertConfigView = () => import('@/views/config/AlertConfigView.vue')
const ControlConfigView = () => import('@/views/config/ControlConfigView.vue')
const SystemConfigView = () => import('@/views/config/SystemConfigView.vue')
const InstanceConfigView = () => import('@/views/config/InstanceConfigView.vue')
const DeviceConfigView = () => import('@/views/config/DeviceConfigView.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardView,
      meta: {
        title: 'Dashboard',
      },
    },
    {
      path: '/monitor',
      name: 'monitor',
      component: MonitorView,
      meta: {
        title: 'Single Device Monitor',
      },
    },
    {
      path: '/parameter-tool',
      name: 'parameterTool',
      component: ParameterToolView,
      meta: {
        title: 'Parameter Testing',
      },
    },

    // ===== Nested Config Routes =====
    {
      path: '/config',
      name: 'config',
      redirect: '/config/modbus', // Redirect to modbus by default
      children: [
        {
          path: 'system',
          name: 'config-system',
          component: SystemConfigView,
          meta: {
            title: 'System Configuration',
          },
        },
        {
          path: 'modbus',
          name: 'config-modbus',
          component: ModbusConfigView,
          meta: {
            title: 'Modbus Configuration',
          },
        },
        {
          path: 'instance',
          name: 'InstanceConfig',
          component: InstanceConfigView,
          meta: {
            title: 'Device Instance Configuration',
          },
        },
        {
          path: 'device',
          name: 'config-device',
          component: DeviceConfigView,
          meta: { title: '設備配置' },
        },
        {
          path: 'alert',
          name: 'config-alert',
          component: AlertConfigView,
          meta: {
            title: 'Alert Configuration',
            requiresDevices: true,
          },
        },
        {
          path: 'control',
          name: 'config-control',
          component: ControlConfigView,
          meta: {
            title: 'Control Configuration',
            requiresDevices: true,
          },
        },
      ],
    },

    {
      path: '/debug/wifi',
      name: 'debugWifi',
      component: DebugWiFiView,
      meta: {
        title: 'WiFi Debug',
      },
    },
    {
      path: '/provision',
      name: 'provision',
      component: ProvisionView,
      meta: {
        title: 'System Provisioning',
      },
    },
  ],
})

// ===== Navigation Guard =====
// Protect Control/Alert pages: require at least one configured Modbus device
router.beforeEach(async (to, _from, next) => {
  if (!to.meta.requiresDevices) {
    next()
    return
  }

  // Lazy-import to avoid circular init issues
  const { useConfigDeviceStore } = await import('@/stores/configDevice')
  const configDeviceStore = useConfigDeviceStore()

  try {
    await configDeviceStore.loadDevices()
  } catch {
    // On load failure, let the page handle the error state
  }

  if (!configDeviceStore.hasDevices) {
    next({ name: 'config-device', query: { redirect: to.fullPath, reason: 'no-devices' } })
  } else {
    next()
  }
})

export default router
