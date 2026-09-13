import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import SystemConfigView from '@/views/config/SystemConfigView.vue'
import { useUIStore } from '@/stores/ui'
import { useRestartStore } from '@/stores/restart'
import {
  STUBS,
  DIRECTIVES,
  BackupDialogStub,
  buttonByText,
  headerRestartButton,
} from './configViewHarness'

// ==================== Restart banner wiring ====================
//
// Every config write in this view marks the `system` scope pending and raises
// no modal; the banner comes from the restart store.

const { confirm, message, axiosGet, axiosPost } = vi.hoisted(() => ({
  confirm: vi.fn(async (): Promise<unknown> => undefined),
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  axiosGet: vi.fn(async (): Promise<unknown> => ({ data: {} })),
  axiosPost: vi.fn(async (): Promise<unknown> => ({ data: { success: true } })),
}))

vi.mock('axios', () => ({ default: { get: axiosGet, post: axiosPost } }))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus')
  return { ...actual, ElMessage: message, ElMessageBox: { confirm } }
})

const routerPush = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }))

type SystemConfig = {
  monitor_interval_seconds: number
  control_interval_seconds: number | null
  alert_interval_seconds: number | null
  device_id_series: number
  reverse_ssh_port: number | null
}
const systemState = {
  currentConfig: ref<SystemConfig | null>(null),
  isLoading: ref(false),
}
const systemActions = {
  fetchConfig: vi.fn(async () => undefined),
  updateConfig: vi.fn(async () => undefined),
}
const ioState = { isImporting: ref(false) }
const ioActions = {
  exportConfig: vi.fn(),
  importConfig: vi.fn(async () => undefined),
}

vi.mock('@/stores/system_config', () => ({
  useSystemConfigStore: () => ({ ...systemState, ...systemActions }),
}))
vi.mock('@/stores/config_io', () => ({
  useConfigIOStore: () => ({ ...ioState, ...ioActions }),
}))

enableAutoUnmount(afterEach)

const mountView = () =>
  mount(SystemConfigView, {
    global: {
      stubs: { ...STUBS, BackupDialog: BackupDialogStub },
      directives: DIRECTIVES,
    },
  })
type Wrapper = ReturnType<typeof mountView>

const bannerVisible = (wrapper: Wrapper) => wrapper.find('[data-testid="alert"]').exists()

const letRestartSucceed = async () => {
  await vi.advanceTimersByTimeAsync(3000)
  await flushPromises()
  await vi.advanceTimersByTimeAsync(600)
  await flushPromises()
}

/** Dirty the form by changing the monitor interval, then press Save. */
const saveWithMonitorInterval = async (wrapper: Wrapper, value: number) => {
  const monitorInput = wrapper.findAll('input[type="number"]')[0]
  expect(monitorInput, 'monitor interval input not found').toBeTruthy()
  await monitorInput!.setValue(String(value))
  await flushPromises()
  const save = buttonByText(wrapper, useUIStore().t.config.common.save)
  expect(save.attributes('disabled')).toBeUndefined()
  await save.trigger('click')
  await flushPromises()
}

describe('SystemConfigView', () => {
  const t = computed(() => useUIStore().t)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    confirm.mockResolvedValue(undefined)
    axiosGet.mockResolvedValue({ data: {} })
    axiosPost.mockResolvedValue({ data: { success: true } })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    systemState.currentConfig.value = {
      monitor_interval_seconds: 10,
      control_interval_seconds: null,
      alert_interval_seconds: null,
      device_id_series: 0,
      reverse_ssh_port: 8600,
    }
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('config writes mark pending and raise no modal', () => {
    it('saving the system config keeps its success toast', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(bannerVisible(wrapper)).toBe(false)

      await saveWithMonitorInterval(wrapper, 5)

      expect(systemActions.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({ monitor_interval_seconds: 5 }),
      )
      expect(message.success).toHaveBeenCalledWith(t.value.systemConfig.saveSuccess)
      expect(confirm).not.toHaveBeenCalled()
      expect(useRestartStore().pendingScopes.has('system')).toBe(true)
      expect(bannerVisible(wrapper)).toBe(true)
      expect(wrapper.text()).toContain(t.value.config.talos.alertTitle)
    })

    it('importing a config', async () => {
      const wrapper = mountView()
      await flushPromises()

      await wrapper.get('[data-testid="upload-trigger"]').trigger('click')
      await flushPromises()

      expect(ioActions.importConfig).toHaveBeenCalledWith('system_config', expect.any(File))
      expect(message.success).toHaveBeenCalledWith(t.value.config.importSuccess)
      expect(confirm).not.toHaveBeenCalled()
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('restoring a backup', async () => {
      const wrapper = mountView()
      await flushPromises()

      wrapper.findComponent(BackupDialogStub).vm.$emit('restored')
      await flushPromises()

      expect(systemActions.fetchConfig).toHaveBeenCalledTimes(2) // mount + refresh
      expect(confirm).not.toHaveBeenCalled()
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('a failed save marks nothing', async () => {
      systemActions.updateConfig.mockRejectedValueOnce(new Error('boom'))
      const wrapper = mountView()
      await flushPromises()

      await saveWithMonitorInterval(wrapper, 5)

      expect(message.error).toHaveBeenCalledWith(t.value.systemConfig.saveFailed)
      expect(useRestartStore().hasPending).toBe(false)
      expect(bannerVisible(wrapper)).toBe(false)
    })
  })

  describe('banner', () => {
    it('is dismissable, retains pending state, and returns on the next save', async () => {
      const wrapper = mountView()
      await flushPromises()
      await saveWithMonitorInterval(wrapper, 5)
      expect(bannerVisible(wrapper)).toBe(true)

      await wrapper.get('[data-testid="alert-close"]').trigger('click')
      await flushPromises()
      expect(bannerVisible(wrapper)).toBe(false)
      expect(useRestartStore().pendingScopes.has('system')).toBe(true)

      await saveWithMonitorInterval(wrapper, 7)
      expect(bannerVisible(wrapper)).toBe(true)
    })
  })

  describe('restart', () => {
    it('the header button confirms, restarts, clears the banner on success and refreshes', async () => {
      const wrapper = mountView()
      await flushPromises()
      await saveWithMonitorInterval(wrapper, 5)
      systemActions.fetchConfig.mockClear()

      await headerRestartButton(wrapper, t.value.config.talos.restartService).trigger('click')
      await flushPromises()

      expect(confirm).toHaveBeenCalledWith(
        t.value.config.talos.confirmRestartMessage,
        t.value.config.talos.restartTitle,
        expect.anything(),
      )
      expect(axiosPost).toHaveBeenCalledWith('/api/provision/service/restart')
      expect(bannerVisible(wrapper)).toBe(true)

      await letRestartSucceed()

      expect(bannerVisible(wrapper)).toBe(false)
      expect(systemActions.fetchConfig).toHaveBeenCalledTimes(1) // onRestarted
    })

    it('a `success: false` reply leaves the banner standing', async () => {
      axiosPost.mockResolvedValueOnce({ data: { success: false } })
      const wrapper = mountView()
      await flushPromises()
      await saveWithMonitorInterval(wrapper, 5)

      await headerRestartButton(wrapper, t.value.config.talos.restartService).trigger('click')
      await flushPromises()

      expect(message.warning).toHaveBeenCalledWith(
        expect.objectContaining({ message: t.value.config.talos.restartWarning }),
      )
      expect(bannerVisible(wrapper)).toBe(true)
    })
  })
})
