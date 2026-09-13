import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ModbusConfigView from '@/views/config/ModbusConfigView.vue'
import { useUIStore } from '@/stores/ui'
import type { ModbusDevice } from '@/stores/modbus_config'
import { STUBS, DIRECTIVES, DeviceDialogStub, BackupDialogStub } from './configViewHarness'

// ==================== Characterization ====================
//
// Proves the Modbus view is wired to `useTalosRestart`'s per-save prompt on
// `main`. The prompt itself is characterized in
// src/composables/__tests__/useTalosRestart.test.ts; this file only needs one
// representative call site.

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

// Store doubles built from refs; the module factories close over them and
// the views read them through the real `storeToRefs`.
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
const ioState = { isImporting: ref(false) }
const ioActions = {
  exportConfig: vi.fn(),
  importConfig: vi.fn(async () => undefined),
}
const instanceActions = { fetchConfig: vi.fn(async () => undefined) }

vi.mock('@/stores/modbus_config', () => ({
  useConfigStore: () => ({ ...configState, ...configActions }),
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

const mountView = () =>
  mount(ModbusConfigView, {
    global: {
      stubs: { ...STUBS, DeviceDialog: DeviceDialogStub, BackupDialog: BackupDialogStub },
      directives: DIRECTIVES,
    },
  })

describe('ModbusConfigView on main', () => {
  const t = computed(() => useUIStore().t)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    confirm.mockResolvedValue(undefined)
    configState.busList.value = [{ name: 'bus1', port: '/dev/ttyUSB0', baudrate: 9600, timeout: 1 }]
    configState.devices.value = []
  })

  // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in commit 2
  it('saving a device raises the restart prompt', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="alert"]').exists()).toBe(false)

    wrapper.findComponent(DeviceDialogStub).vm.$emit('submit', device)
    await flushPromises()

    expect(configActions.createOrUpdateDevice).toHaveBeenCalledWith(device, 'web-user')
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(
      t.value.config.talos.restartMessage,
      t.value.config.talos.restartTitle,
      expect.objectContaining({ distinguishCancelAndClose: true }),
    )
  })
})
