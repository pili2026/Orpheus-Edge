import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ModbusConfigView from '@/views/config/ModbusConfigView.vue'
import { useUIStore } from '@/stores/ui'
import { useRestartStore } from '@/stores/restart'
import type { ModbusDevice } from '@/stores/modbus_config'
import {
  STUBS,
  DIRECTIVES,
  DeviceDialogStub,
  BackupDialogStub,
  ElDialogStub,
  buttonByText,
  headerRestartButton,
} from './configViewHarness'

// ==================== Restart banner wiring ====================
//
// Every config write in this view marks the `modbus` scope pending and raises
// no modal; the banner comes from the restart store. The restart flow itself
// is covered in src/composables/__tests__/useTalosRestart.test.ts.

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
// the view reads them through the real `storeToRefs`.
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
type Wrapper = ReturnType<typeof mountView>

const bannerVisible = (wrapper: Wrapper) => wrapper.find('[data-testid="alert"]').exists()

// Default composable timings: first poll after 3 s, then a 600 ms settle.
const letRestartSucceed = async () => {
  await vi.advanceTimersByTimeAsync(3000)
  await flushPromises()
  await vi.advanceTimersByTimeAsync(600)
  await flushPromises()
}

const submitDevice = async (wrapper: Wrapper) => {
  wrapper.findComponent(DeviceDialogStub).vm.$emit('submit', device)
  await flushPromises()
}

describe('ModbusConfigView', () => {
  const t = computed(() => useUIStore().t)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    confirm.mockResolvedValue(undefined)
    axiosGet.mockResolvedValue({ data: {} })
    axiosPost.mockResolvedValue({ data: { success: true } })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    configState.busList.value = [{ name: 'bus1', port: '/dev/ttyUSB0', baudrate: 9600, timeout: 1 }]
    configState.devices.value = [device]
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('config writes mark pending and raise no modal', () => {
    it('saving a device', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(bannerVisible(wrapper)).toBe(false)

      await submitDevice(wrapper)

      expect(configActions.createOrUpdateDevice).toHaveBeenCalledWith(device, 'web-user')
      expect(confirm).not.toHaveBeenCalled()
      expect(useRestartStore().pendingScopes.has('modbus')).toBe(true)
      expect(bannerVisible(wrapper)).toBe(true)
      expect(wrapper.text()).toContain(t.value.config.talos.alertTitle)
    })

    it('deleting a device', async () => {
      const wrapper = mountView()
      await flushPromises()

      // one popconfirm per bus row, then one per device row
      const confirms = wrapper.findAll('[data-testid="popconfirm-confirm"]')
      expect(confirms).toHaveLength(2)
      await confirms[1]!.trigger('click')
      await flushPromises()

      expect(configActions.deleteDevice).toHaveBeenCalledWith('SDM120', 3, 'web-user')
      expect(instanceActions.fetchConfig).toHaveBeenCalled()
      expect(confirm).not.toHaveBeenCalled()
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('saving a bus', async () => {
      const wrapper = mountView()
      await flushPromises()

      await buttonByText(wrapper, t.value.config.bus.addBus).trigger('click')
      await flushPromises()
      await buttonByText(wrapper, t.value.config.common.save).trigger('click')
      await flushPromises()

      expect(configActions.createOrUpdateBus).toHaveBeenCalledTimes(1)
      expect(confirm).not.toHaveBeenCalled()
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('deleting a bus', async () => {
      const wrapper = mountView()
      await flushPromises()

      await wrapper.findAll('[data-testid="popconfirm-confirm"]')[0]!.trigger('click')
      await flushPromises()

      expect(configActions.deleteBus).toHaveBeenCalledWith('bus1', 'web-user')
      expect(confirm).not.toHaveBeenCalled()
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('importing a config', async () => {
      const wrapper = mountView()
      await flushPromises()

      await wrapper.get('[data-testid="upload-trigger"]').trigger('click')
      await flushPromises()

      expect(ioActions.importConfig).toHaveBeenCalledWith('modbus_device', expect.any(File))
      expect(message.success).toHaveBeenCalledWith(t.value.config.importSuccess)
      expect(confirm).not.toHaveBeenCalled()
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('restoring a backup', async () => {
      const wrapper = mountView()
      await flushPromises()

      wrapper.findComponent(BackupDialogStub).vm.$emit('restored')
      await flushPromises()

      expect(configActions.fetchConfig).toHaveBeenCalledTimes(2) // mount + refresh
      expect(confirm).not.toHaveBeenCalled()
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('a failed device save marks nothing', async () => {
      configActions.createOrUpdateDevice.mockRejectedValueOnce(new Error('boom'))
      const wrapper = mountView()
      await flushPromises()

      await submitDevice(wrapper)

      expect(message.error).toHaveBeenCalledWith(t.value.config.device.saveFailed)
      expect(useRestartStore().hasPending).toBe(false)
      expect(bannerVisible(wrapper)).toBe(false)
    })
  })

  describe('banner', () => {
    it('is dismissable, retains pending state, and returns on the next save', async () => {
      const wrapper = mountView()
      await flushPromises()
      await submitDevice(wrapper)
      expect(bannerVisible(wrapper)).toBe(true)

      await wrapper.get('[data-testid="alert-close"]').trigger('click')
      await flushPromises()
      expect(bannerVisible(wrapper)).toBe(false)
      expect(useRestartStore().pendingScopes.has('modbus')).toBe(true)

      await submitDevice(wrapper)
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('survives unmount and remount of the view', async () => {
      const first = mountView()
      await flushPromises()
      await submitDevice(first)
      first.unmount()

      const second = mountView()
      await flushPromises()
      expect(bannerVisible(second)).toBe(true)
    })

    it('its Restart Service button restarts without a second confirmation', async () => {
      const wrapper = mountView()
      await flushPromises()
      await submitDevice(wrapper)

      const alert = wrapper.get('[data-testid="alert"]')
      await alert.find('button:not([data-testid])').trigger('click')
      await flushPromises()

      expect(confirm).not.toHaveBeenCalled()
      expect(axiosPost).toHaveBeenCalledWith('/api/provision/service/restart')
    })
  })

  describe('restart', () => {
    it('the header button confirms, restarts, clears the banner on success and refreshes', async () => {
      const wrapper = mountView()
      await flushPromises()
      await submitDevice(wrapper)
      configActions.fetchConfig.mockClear()

      await headerRestartButton(wrapper, t.value.config.talos.restartService).trigger('click')
      await flushPromises()

      expect(confirm).toHaveBeenCalledWith(
        t.value.config.talos.confirmRestartMessage,
        t.value.config.talos.restartTitle,
        expect.anything(),
      )
      expect(axiosPost).toHaveBeenCalledWith('/api/provision/service/restart')
      // still pending until the poll succeeds
      expect(bannerVisible(wrapper)).toBe(true)

      await letRestartSucceed()

      expect(bannerVisible(wrapper)).toBe(false)
      expect(useRestartStore().hasPending).toBe(false)
      expect(configActions.fetchConfig).toHaveBeenCalledTimes(1) // onRestarted
    })

    it('a header restart with nothing pending completes and refreshes', async () => {
      const wrapper = mountView()
      await flushPromises()
      configActions.fetchConfig.mockClear()

      await headerRestartButton(wrapper, t.value.config.talos.restartService).trigger('click')
      await flushPromises()
      await letRestartSucceed()

      expect(configActions.fetchConfig).toHaveBeenCalledTimes(1)
      expect(bannerVisible(wrapper)).toBe(false)
    })

    it('a rejected restart POST leaves the banner standing', async () => {
      axiosPost.mockRejectedValueOnce(new Error('network'))
      const wrapper = mountView()
      await flushPromises()
      await submitDevice(wrapper)

      await headerRestartButton(wrapper, t.value.config.talos.restartService).trigger('click')
      await flushPromises()

      expect(message.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: t.value.config.talos.restartFailed }),
      )
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('the restarting dialog cannot be dismissed by the user', async () => {
      const wrapper = mountView()
      await flushPromises()

      await headerRestartButton(wrapper, t.value.config.talos.restartService).trigger('click')
      await flushPromises()

      const dialog = wrapper
        .findAllComponents(ElDialogStub)
        .find((d) => d.props('title') === t.value.config.talos.restartingTitle)
      expect(dialog, 'restarting dialog not found').toBeTruthy()
      expect(dialog!.props('modelValue')).toBe(true)
      expect(dialog!.props('closeOnClickModal')).toBe(false)
      expect(dialog!.props('closeOnPressEscape')).toBe(false)
      expect(dialog!.props('showClose')).toBe(false)
    })
  })
})
