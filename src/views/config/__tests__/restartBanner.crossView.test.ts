import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ModbusConfigView from '@/views/config/ModbusConfigView.vue'
import SystemConfigView from '@/views/config/SystemConfigView.vue'
import { useUIStore } from '@/stores/ui'
import { useRestartStore } from '@/stores/restart'
import type { ModbusDevice } from '@/stores/modbus_config'
import {
  STUBS,
  DIRECTIVES,
  DeviceDialogStub,
  BackupDialogStub,
  headerRestartButton,
} from './configViewHarness'

// ==================== Cross-view banner ====================
//
// Pending state and the dismissed flag live in one store, so what one config
// view marks or dismisses, every other config view sees.

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
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const configState = {
  config: ref<unknown>(null),
  metadata: ref<unknown>(null),
  devices: ref<ModbusDevice[]>([]),
  busList: ref<Array<{ name: string; port: string; baudrate: number; timeout: number }>>([]),
  isLoading: ref(false),
  error: ref<string | null>(null),
}
const configActions = {
  fetchConfig: vi.fn(async () => undefined),
  createOrUpdateBus: vi.fn(async () => undefined),
  deleteBus: vi.fn(async () => undefined),
  createOrUpdateDevice: vi.fn(async () => undefined),
  deleteDevice: vi.fn(async () => undefined),
  getDeviceDisplayName: (d: ModbusDevice) => d.model,
}
const systemState = {
  currentConfig: ref<unknown>({
    monitor_interval_seconds: 10,
    control_interval_seconds: null,
    alert_interval_seconds: null,
    device_id_series: 0,
    reverse_ssh_port: 8600,
  }),
  isLoading: ref(false),
}
const systemActions = {
  fetchConfig: vi.fn(async () => undefined),
  updateConfig: vi.fn(async () => undefined),
}
const ioState = { isImporting: ref(false) }
const ioActions = { exportConfig: vi.fn(), importConfig: vi.fn(async () => undefined) }
const instanceActions = { fetchConfig: vi.fn(async () => undefined) }

vi.mock('@/stores/modbus_config', () => ({
  useConfigStore: () => ({ ...configState, ...configActions }),
}))
vi.mock('@/stores/system_config', () => ({
  useSystemConfigStore: () => ({ ...systemState, ...systemActions }),
}))
vi.mock('@/stores/config_io', () => ({
  useConfigIOStore: () => ({ ...ioState, ...ioActions }),
}))
vi.mock('@/stores/instance_config', () => ({
  useInstanceConfigStore: () => instanceActions,
}))

enableAutoUnmount(afterEach)

const device: ModbusDevice = {
  model: 'SDM120',
  type: 'power_meter',
  model_file: 'sdm120.yaml',
  slave_id: 3,
  bus: 'bus1',
  modes: {},
}

const stubs = { ...STUBS, DeviceDialog: DeviceDialogStub, BackupDialog: BackupDialogStub }
const mountModbus = () => mount(ModbusConfigView, { global: { stubs, directives: DIRECTIVES } })
const mountSystem = () => mount(SystemConfigView, { global: { stubs, directives: DIRECTIVES } })

const bannerVisible = (wrapper: { find: (s: string) => { exists: () => boolean } }) =>
  wrapper.find('[data-testid="alert"]').exists()

const saveDeviceIn = async (modbus: ReturnType<typeof mountModbus>) => {
  modbus.findComponent(DeviceDialogStub).vm.$emit('submit', device)
  await flushPromises()
}

const letRestartSucceed = async () => {
  await vi.advanceTimersByTimeAsync(3000)
  await flushPromises()
  await vi.advanceTimersByTimeAsync(600)
  await flushPromises()
}

describe('restart banner across config views', () => {
  const t = computed(() => useUIStore().t)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    confirm.mockResolvedValue(undefined)
    axiosGet.mockResolvedValue({ data: {} })
    axiosPost.mockResolvedValue({ data: { success: true } })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a scope marked in one view shows the banner in another', async () => {
    const modbus = mountModbus()
    await flushPromises()
    await saveDeviceIn(modbus)
    modbus.unmount()

    const system = mountSystem()
    await flushPromises()
    expect(bannerVisible(system)).toBe(true)
    expect(system.text()).toContain(t.value.config.talos.alertTitle)
  })

  it('dismissing in one view hides it in another; a later mark restores it in both', async () => {
    const modbus = mountModbus()
    const system = mountSystem()
    await flushPromises()
    await saveDeviceIn(modbus)
    expect(bannerVisible(modbus)).toBe(true)
    expect(bannerVisible(system)).toBe(true)

    await system.get('[data-testid="alert-close"]').trigger('click')
    await flushPromises()
    expect(bannerVisible(system)).toBe(false)
    expect(bannerVisible(modbus)).toBe(false)
    expect(useRestartStore().hasPending).toBe(true)

    await saveDeviceIn(modbus)
    expect(bannerVisible(modbus)).toBe(true)
    expect(bannerVisible(system)).toBe(true)
  })

  it('a restart started from another view clears a scope marked here: the snapshot is global', async () => {
    const modbus = mountModbus()
    const system = mountSystem()
    await flushPromises()
    await saveDeviceIn(modbus)

    await headerRestartButton(system, t.value.config.talos.restartService).trigger('click')
    await flushPromises()
    expect(axiosPost).toHaveBeenCalledTimes(1)
    await letRestartSucceed()

    expect(useRestartStore().hasPending).toBe(false)
    expect(bannerVisible(modbus)).toBe(false)
    expect(bannerVisible(system)).toBe(false)
    expect(systemActions.fetchConfig).toHaveBeenCalled() // the restarting view's onRestarted
  })
})
