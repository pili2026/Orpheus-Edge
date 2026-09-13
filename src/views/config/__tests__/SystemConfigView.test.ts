import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import SystemConfigView from '@/views/config/SystemConfigView.vue'
import { useUIStore } from '@/stores/ui'
import { STUBS, DIRECTIVES, BackupDialogStub, buttonByText } from './configViewHarness'

// ==================== Characterization ====================
//
// Proves the System view is wired to `useTalosRestart`'s per-save prompt on
// `main`. One representative call site; the prompt itself is characterized in
// src/composables/__tests__/useTalosRestart.test.ts.

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

/** Dirty the form by changing the monitor interval, then press Save. */
const saveWithMonitorInterval = async (wrapper: ReturnType<typeof mountView>, value: number) => {
  const monitorInput = wrapper.findAll('input[type="number"]')[0]
  expect(monitorInput, 'monitor interval input not found').toBeTruthy()
  await monitorInput!.setValue(String(value))
  await flushPromises()
  const save = buttonByText(wrapper, useUIStore().t.config.common.save)
  expect(save.attributes('disabled')).toBeUndefined()
  await save.trigger('click')
  await flushPromises()
}

describe('SystemConfigView on main', () => {
  const t = computed(() => useUIStore().t)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    confirm.mockResolvedValue(undefined)
    systemState.currentConfig.value = {
      monitor_interval_seconds: 10,
      control_interval_seconds: null,
      alert_interval_seconds: null,
      device_id_series: 0,
      reverse_ssh_port: 8600,
    }
  })

  // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in commit 2
  it('saving the system config raises the restart prompt', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="alert"]').exists()).toBe(false)

    await saveWithMonitorInterval(wrapper, 5)

    expect(systemActions.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ monitor_interval_seconds: 5 }),
    )
    expect(message.success).toHaveBeenCalledWith(t.value.systemConfig.saveSuccess)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(
      t.value.config.talos.restartMessage,
      t.value.config.talos.restartTitle,
      expect.objectContaining({ distinguishCancelAndClose: true }),
    )
  })
})
