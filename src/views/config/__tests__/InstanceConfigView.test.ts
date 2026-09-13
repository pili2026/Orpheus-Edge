import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import InstanceConfigView from '@/views/config/InstanceConfigView.vue'
import { useUIStore } from '@/stores/ui'
import { useRestartStore } from '@/stores/restart'
import type { DriverModelInfo, InstanceConfigResponse } from '@/stores/instance_config'
import type { PinMappingModelInfo } from '@/stores/pin_mapping'
import {
  STUBS,
  DIRECTIVES,
  BackupDialogStub,
  InverterConstraintDialogStub,
  PinConfigDialogStub,
  PinMappingViewDialogStub,
  buttonByText,
  headerRestartButton,
} from './configViewHarness'

// ==================== Restart banner wiring ====================
//
// Every config write in this view marks the `instance` scope pending and
// raises no modal. `instance` covers both the device_instance_config and the
// pin_mapping config kinds (see src/stores/restart.ts).

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

const instanceState = {
  config: ref<InstanceConfigResponse | null>(null),
  driverModels: ref<DriverModelInfo[]>([]),
  isLoading: ref(false),
  isSaving: ref(false),
  inverterModels: ref<string[]>([]),
  aiModels: ref<string[]>([]),
  diModels: ref<string[]>([]),
}
const instanceActions = {
  fetchConfig: vi.fn(async () => undefined),
  fetchDriverModels: vi.fn(async () => undefined),
  updateInstance: vi.fn(async () => undefined),
}
const pinMappingState = { models: ref<PinMappingModelInfo[]>([]) }
const pinMappingActions = { fetchModels: vi.fn(async () => undefined) }
const ioState = { isImporting: ref(false) }
const ioActions = {
  exportConfig: vi.fn(),
  importConfig: vi.fn(async () => undefined),
}

// The view reads `store.config` / `store.inverterModels` directly (no
// `storeToRefs`), so the double has to be reactive itself.
vi.mock('@/stores/instance_config', async () => {
  const { reactive } = await import('vue')
  return { useInstanceConfigStore: () => reactive({ ...instanceState, ...instanceActions }) }
})
vi.mock('@/stores/pin_mapping', async () => {
  const { reactive } = await import('vue')
  return { usePinMappingStore: () => reactive({ ...pinMappingState, ...pinMappingActions }) }
})
vi.mock('@/stores/config_io', () => ({
  useConfigIOStore: () => ({ ...ioState, ...ioActions }),
}))

enableAutoUnmount(afterEach)

const mountView = () =>
  mount(InstanceConfigView, {
    global: {
      stubs: {
        ...STUBS,
        BackupDialog: BackupDialogStub,
        InverterConstraintDialog: InverterConstraintDialogStub,
        PinConfigDialog: PinConfigDialogStub,
        PinMappingViewDialog: PinMappingViewDialogStub,
      },
      directives: DIRECTIVES,
    },
  })
type Wrapper = ReturnType<typeof mountView>

const bannerVisible = (wrapper: Wrapper) => wrapper.find('[data-testid="alert"]').exists()
const pending = () => useRestartStore().pendingScopes.has('instance')

const letRestartSucceed = async () => {
  await vi.advanceTimersByTimeAsync(3000)
  await flushPromises()
  await vi.advanceTimersByTimeAsync(600)
  await flushPromises()
}

const switchToPinMappingTab = async (wrapper: Wrapper) => {
  await wrapper.get('[data-testid="tab-pin_mapping"]').trigger('click')
  await flushPromises()
}

describe('InstanceConfigView', () => {
  const t = computed(() => useUIStore().t)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    confirm.mockResolvedValue(undefined)
    axiosGet.mockResolvedValue({ data: {} })
    axiosPost.mockResolvedValue({ data: { success: true } })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })

    // INV1 has an instance; INV2 and AI1 have none yet.
    instanceState.config.value = {
      status: 'ok',
      global_defaults: null,
      devices: {
        INV1: { instances: { '1': { initialization: null, constraints: null, pins: null } } },
        INV2: { instances: {} },
        AI1: { instances: { '2': { initialization: null, constraints: null, pins: null } } },
      },
      generation: 1,
      checksum: null,
      modified_at: null,
    }
    instanceState.driverModels.value = [
      { model: 'INV1', device_type: 'inverter', pin_names: [], slave_ids: [1] },
      { model: 'INV2', device_type: 'inverter', pin_names: [], slave_ids: [5] },
      { model: 'AI1', device_type: 'ai_module', pin_names: ['AI1'], slave_ids: [2] },
    ]
    instanceState.inverterModels.value = ['INV1', 'INV2']
    instanceState.aiModels.value = ['AI1']
    instanceState.diModels.value = []
    pinMappingState.models.value = [{ model: 'INV1', has_override: false, source: 'template' }]
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('config writes mark pending and raise no modal', () => {
    it('importing an instance config', async () => {
      const wrapper = mountView()
      await flushPromises()
      expect(bannerVisible(wrapper)).toBe(false)

      // On the instance tab the header import is the only upload control.
      await wrapper.get('[data-testid="upload-trigger"]').trigger('click')
      await flushPromises()

      expect(ioActions.importConfig).toHaveBeenCalledWith(
        'device_instance_config',
        expect.any(File),
      )
      expect(message.success).toHaveBeenCalledWith(t.value.config.importSuccess)
      expect(confirm).not.toHaveBeenCalled()
      expect(pending()).toBe(true)
      expect(bannerVisible(wrapper)).toBe(true)
      expect(wrapper.text()).toContain(t.value.config.talos.alertTitle)
    })

    it('restoring an instance backup', async () => {
      const wrapper = mountView()
      await flushPromises()

      wrapper.findComponent(BackupDialogStub).vm.$emit('restored')
      await flushPromises()

      expect(instanceActions.fetchConfig).toHaveBeenCalledTimes(2) // mount + refresh
      expect(confirm).not.toHaveBeenCalled()
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('saving inverter constraints keeps its success toast', async () => {
      const wrapper = mountView()
      await flushPromises()

      await buttonByText(wrapper, t.value.instanceConfig.edit).trigger('click')
      await flushPromises()
      const payload = { constraints: { RW_HZ: { min: 30, max: 60 } } }
      wrapper.findComponent(InverterConstraintDialogStub).vm.$emit('save', payload)
      await flushPromises()

      expect(instanceActions.updateInstance).toHaveBeenCalledWith('INV1', '1', payload)
      expect(message.success).toHaveBeenCalledWith(t.value.instanceConfig.saveSuccess)
      expect(confirm).not.toHaveBeenCalled()
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('saving pins keeps its success toast', async () => {
      const wrapper = mountView()
      await flushPromises()

      await buttonByText(wrapper, t.value.instanceConfig.editPins).trigger('click')
      await flushPromises()
      const payload = { pins: { AI1: { remark: 'x' } } }
      wrapper.findComponent(PinConfigDialogStub).vm.$emit('save', payload)
      await flushPromises()

      expect(instanceActions.updateInstance).toHaveBeenCalledWith('AI1', '2', payload)
      expect(message.success).toHaveBeenCalledWith(t.value.instanceConfig.saveSuccess)
      expect(confirm).not.toHaveBeenCalled()
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('adding an instance directly (single slave id) writes and marks pending', async () => {
      const wrapper = mountView()
      await flushPromises()

      await buttonByText(wrapper, t.value.instanceConfig.addInstance).trigger('click')
      await flushPromises()

      expect(instanceActions.updateInstance).toHaveBeenCalledWith('INV2', '5', {
        initialization: null,
        constraints: null,
        pins: null,
      })
      expect(confirm).not.toHaveBeenCalled()
      expect(pending()).toBe(true)
      expect(bannerVisible(wrapper)).toBe(true)
      // the follow-up constraint dialog still opens
      expect(wrapper.findComponent(InverterConstraintDialogStub).props('visible')).toBe(true)
    })

    it('importing a pin mapping', async () => {
      const wrapper = mountView()
      await flushPromises()
      await switchToPinMappingTab(wrapper)

      // The header import is hidden on this tab; the row control remains.
      const uploads = wrapper.findAll('[data-testid="upload-trigger"]')
      expect(uploads).toHaveLength(1)
      await uploads[0]!.trigger('click')
      await flushPromises()

      expect(ioActions.importConfig).toHaveBeenCalledWith('pin_mapping', expect.any(File), 'INV1')
      expect(pinMappingActions.fetchModels).toHaveBeenCalled()
      expect(message.success).toHaveBeenCalledWith(t.value.config.importSuccess)
      expect(confirm).not.toHaveBeenCalled()
      expect(pending()).toBe(true)
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('restoring a pin-mapping backup', async () => {
      const wrapper = mountView()
      await flushPromises()
      await switchToPinMappingTab(wrapper)
      pinMappingActions.fetchModels.mockClear()

      wrapper.findComponent(BackupDialogStub).vm.$emit('restored')
      await flushPromises()

      expect(pinMappingActions.fetchModels).toHaveBeenCalledTimes(1)
      expect(confirm).not.toHaveBeenCalled()
      expect(pending()).toBe(true)
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('a failed save marks nothing', async () => {
      instanceActions.updateInstance.mockRejectedValueOnce(new Error('boom'))
      const wrapper = mountView()
      await flushPromises()

      await buttonByText(wrapper, t.value.instanceConfig.edit).trigger('click')
      await flushPromises()
      wrapper.findComponent(InverterConstraintDialogStub).vm.$emit('save', {})
      await flushPromises()

      expect(message.error).toHaveBeenCalledWith(t.value.instanceConfig.saveFailed)
      expect(pending()).toBe(false)
      expect(bannerVisible(wrapper)).toBe(false)
    })
  })

  describe('banner and restart', () => {
    it('is dismissable, retains pending state, and returns on the next save', async () => {
      const wrapper = mountView()
      await flushPromises()
      await wrapper.get('[data-testid="upload-trigger"]').trigger('click')
      await flushPromises()
      expect(bannerVisible(wrapper)).toBe(true)

      await wrapper.get('[data-testid="alert-close"]').trigger('click')
      await flushPromises()
      expect(bannerVisible(wrapper)).toBe(false)
      expect(pending()).toBe(true)

      await wrapper.get('[data-testid="upload-trigger"]').trigger('click')
      await flushPromises()
      expect(bannerVisible(wrapper)).toBe(true)
    })

    it('the header button confirms, restarts, clears the banner on success and refreshes', async () => {
      const wrapper = mountView()
      await flushPromises()
      await wrapper.get('[data-testid="upload-trigger"]').trigger('click')
      await flushPromises()
      instanceActions.fetchConfig.mockClear()

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
      expect(instanceActions.fetchConfig).toHaveBeenCalledTimes(1) // onRestarted
    })

    it('poll exhaustion leaves the banner standing', async () => {
      axiosGet.mockRejectedValue(new Error('down'))
      const wrapper = mountView()
      await flushPromises()
      await wrapper.get('[data-testid="upload-trigger"]').trigger('click')
      await flushPromises()

      await headerRestartButton(wrapper, t.value.config.talos.restartService).trigger('click')
      await flushPromises()
      // default timings: 3 s initial delay, then 25 attempts 2 s apart
      await vi.advanceTimersByTimeAsync(3000 + 25 * 2000)
      await flushPromises()

      expect(message.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: t.value.config.talos.restartFailed }),
      )
      expect(pending()).toBe(true)
      expect(bannerVisible(wrapper)).toBe(true)
    })
  })
})
