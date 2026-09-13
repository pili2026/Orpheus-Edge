import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import InstanceConfigView from '@/views/config/InstanceConfigView.vue'
import { useUIStore } from '@/stores/ui'
import type { DriverModelInfo, InstanceConfigResponse } from '@/stores/instance_config'
import type { PinMappingModelInfo } from '@/stores/pin_mapping'
import {
  STUBS,
  DIRECTIVES,
  BackupDialogStub,
  InverterConstraintDialogStub,
  PinConfigDialogStub,
  PinMappingViewDialogStub,
} from './configViewHarness'

// ==================== Characterization ====================
//
// Proves the Instance view is wired to `useTalosRestart`'s per-save prompt on
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

describe('InstanceConfigView on main', () => {
  const t = computed(() => useUIStore().t)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    confirm.mockResolvedValue(undefined)
    instanceState.config.value = {
      status: 'ok',
      global_defaults: null,
      devices: {},
      generation: 1,
      checksum: null,
      modified_at: null,
    }
  })

  // PINS CURRENT (BUGGY) BEHAVIOUR — inverted in commit 2
  it('importing an instance config raises the restart prompt', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="alert"]').exists()).toBe(false)

    // The header import control is the only upload on the instance tab.
    await wrapper.get('[data-testid="upload-trigger"]').trigger('click')
    await flushPromises()

    expect(ioActions.importConfig).toHaveBeenCalledWith('device_instance_config', expect.any(File))
    expect(message.success).toHaveBeenCalledWith(t.value.config.importSuccess)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(
      t.value.config.talos.restartMessage,
      t.value.config.talos.restartTitle,
      expect.objectContaining({ distinguishCancelAndClose: true }),
    )
  })
})
