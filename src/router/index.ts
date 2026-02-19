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
const ConstraintConfigView = () => import('@/views/config/ConstraintConfigView.vue')

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
          path: 'modbus',
          name: 'config-modbus',
          component: ModbusConfigView,
          meta: {
            title: 'Modbus Configuration',
          },
        },
        {
          path: 'alert',
          name: 'config-alert',
          component: AlertConfigView,
          meta: {
            title: 'Alert Configuration',
          },
        },
        {
          path: 'control',
          name: 'config-control',
          component: ControlConfigView,
          meta: {
            title: 'Control Configuration',
          },
        },
        {
          path: 'constraint',
          name: 'config-constraint',
          component: ConstraintConfigView,
          meta: {
            title: 'Constraint Configuration',
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

export default router
