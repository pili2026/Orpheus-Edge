import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import DeviceDetailView from '@/views/DeviceDetailView.vue'
import MonitorView from '@/views/MonitorView.vue'
import ProvisionView from '@/views/ProvisionView.vue'

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
      meta: { title: 'Dashboard' },
    },
    // Need Add Websocket per Device
    {
      path: '/device/:deviceId',
      name: 'DeviceDetail',
      component: DeviceDetailView,
      props: true,
      meta: {
        title: 'Device Detail',
      },
    },
    {
      path: '/monitor',
      name: 'monitor',
      component: MonitorView,
    },
    {
      path: '/parameter-tool',
      name: 'ParameterTool',
      component: () => import('@/views/ParameterTestingTool.vue'),
      meta: {
        title: 'Parameter Testing Tool',
      },
    },
    {
      path: '/debug/wifi',
      name: 'DebugNetwork',
      component: () => import('@/views/debug/DebugNetworkPage.vue'),
      meta: {
        title: 'Debug WiFi Network',
      },
    },
    {
      path: '/provision',
      name: 'provision',
      component: ProvisionView,
      meta: {
        requiresAuth: true,
        requiredRole: 'admin',
      },
    },
  ],
})

router.beforeEach((to, from, next) => {
  document.title = `${to.meta.title || 'Talos'} - Talos Monitoring`
  next()
})

export default router
