import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import DeviceDetailView from '@/views/DeviceDetailView.vue'
import MonitorView from '@/views/MonitorView.vue'

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
      path: '/debug',
      name: 'debug',
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
  ],
})

router.beforeEach((to, from, next) => {
  document.title = `${to.meta.title || 'Talos'} - Talos Monitoring`
  next()
})

export default router
