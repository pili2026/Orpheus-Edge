import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, inject, provide, ref, type ComputedRef } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ModbusConfigView from '@/views/config/ModbusConfigView.vue'
import { useUIStore } from '@/stores/ui'
import { useConfigStore, type ModbusConfig } from '@/stores/modbus_config'
import en from '@/locales/en'

const { axiosGet, axiosPost, axiosDelete, elMessage } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  axiosDelete: vi.fn(),
  elMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

const restartApi = {
  isRestarting: ref(false),
  showRestartingDialog: ref(false),
  restartProgress: ref(0),
  hasPending: ref(false),
  restartCompletedAt: ref<number | null>(null),
  markPending: vi.fn(),
  promptRestart: vi.fn(),
  confirmRestart: vi.fn(),
  restartNow: vi.fn(),
  dismissAlert: vi.fn(),
  cancelRestartFlow: vi.fn(),
}

vi.mock('axios', () => ({
  default: {
    get: axiosGet,
    post: axiosPost,
    delete: axiosDelete,
    isAxiosError: () => false,
  },
}))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return { ...actual, ElMessage: elMessage }
})
vi.mock('@/composables/useTalosRestart', () => ({
  useTalosRestart: () => restartApi,
}))
vi.mock('@/stores/restart', () => ({ useRestartStore: () => restartApi }))

const CONFIG: ModbusConfig = {
  metadata: {
    generation: 7,
    source: 'manual',
    last_modified: '2026-01-02T03:04:05Z',
    last_modified_by: 'web-user',
    checksum: 'abcdef0123456789deadbeef',
    applied_at: null,
    cloud_sync_id: null,
  },
  buses: { bus0: { name: 'bus0', port: '/dev/ttyUSB0', baudrate: 9600, timeout: 1 } },
  devices: [
    {
      model: 'TECO_VFD',
      type: 'vfd',
      model_file: 'teco.yaml',
      slave_id: 3,
      bus: 'bus0',
      modes: { name: 'Pump A' },
    },
  ],
}

const clone = (): ModbusConfig => JSON.parse(JSON.stringify(CONFIG)) as ModbusConfig

// ===== Stubs =====

const ROWS = Symbol('rows')

const PassThroughStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => h('div', [slots.header?.(), slots.title?.(), slots.default?.(), slots.footer?.()])
  },
})
const ElButtonStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  setup(_, { slots, emit }) {
    return () => h('button', { onClick: () => emit('click') }, slots.default?.())
  },
})
const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    provide(
      ROWS,
      computed(() => props.data),
    )
    return () => h('div', slots.default?.())
  },
})
const ElTableColumnStub = defineComponent({
  props: ['label', 'prop'],
  setup(props, { slots }) {
    const rows = inject<ComputedRef<Record<string, unknown>[]>>(
      ROWS,
      computed(() => []),
    )
    return () =>
      h(
        'div',
        rows.value.map((row) =>
          h(
            'div',
            slots.default
              ? slots.default({ row })
              : String(props.prop ? (row[props.prop] ?? '') : ''),
          ),
        ),
      )
  },
})
/** Renders the confirm action directly; the title identifies which popconfirm it is. */
const ElPopconfirmStub = defineComponent({
  props: ['title'],
  emits: ['confirm'],
  setup(props, { slots, emit }) {
    return () =>
      h('span', [
        h('button', {
          class: 'popconfirm-confirm',
          'data-title': props.title,
          onClick: () => emit('confirm'),
        }),
        slots.reference?.(),
      ])
  },
})
/**
 * ElForm is not driven directly here. Under Vitest, element-plus is loaded from
 * its CommonJS build and its `import AsyncValidator from 'async-validator'`
 * resolves to a namespace rather than the constructor, so ElFormItem throws
 * internally and every field reports valid -- the same harness defect recorded
 * in src/views/__tests__/ProvisionView.test.ts. This stub therefore models the
 * validation verdict explicitly so the view's own branching is what is tested.
 */
const busFormValid = ref(true)
const ElFormStub = defineComponent({
  props: ['model', 'rules'],
  setup(_, { slots, expose }) {
    expose({
      validate: async (cb?: (valid: boolean) => void) => {
        cb?.(busFormValid.value)
        return busFormValid.value
      },
    })
    return () => h('div', slots.default?.())
  },
})
const DeviceDialogStub = defineComponent({
  props: ['visible', 'device', 'isEdit'],
  emits: ['close', 'submit'],
  setup() {
    return () => h('div', { class: 'device-dialog' })
  },
})
const BackupDialogStub = defineComponent({
  props: ['visible', 'configType'],
  emits: ['close', 'restored'],
  setup() {
    return () => h('div', { class: 'backup-dialog' })
  },
})

const STUBS = {
  'el-dialog': PassThroughStub,
  'el-alert': PassThroughStub,
  'el-card': PassThroughStub,
  'el-tabs': PassThroughStub,
  'el-tab-pane': PassThroughStub,
  'el-tag': PassThroughStub,
  'el-icon': PassThroughStub,
  'el-upload': PassThroughStub,
  'el-progress': true,
  'el-input': true,
  'el-input-number': true,
  'el-button': ElButtonStub,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-popconfirm': ElPopconfirmStub,
  RestartPendingBanner: true,
  RestartingDialog: true,
  'el-form': ElFormStub,
  'el-form-item': PassThroughStub,
  DeviceDialog: DeviceDialogStub,
  BackupDialog: BackupDialogStub,
}

const mountView = () => mount(ModbusConfigView, { global: { stubs: STUBS } })

const buttonByText = (wrapper: ReturnType<typeof mountView>, text: string) => {
  const button = wrapper.findAll('button').find((b) => b.text() === text)
  if (!button) throw new Error(`no button labelled "${text}"`)
  return button
}

describe('ModbusConfigView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
    axiosGet.mockResolvedValue({ data: clone() })
    axiosPost.mockResolvedValue({ data: {} })
    axiosDelete.mockResolvedValue({ data: {} })
    restartApi.isRestarting.value = false
    restartApi.showRestartingDialog.value = false
    restartApi.restartProgress.value = 0
    restartApi.hasPending.value = false
    restartApi.restartCompletedAt.value = null
    busFormValid.value = true
  })

  it('loads the config on mount and renders its metadata', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(axiosGet).toHaveBeenCalledWith('/api/config/modbus')
    expect(wrapper.text()).toContain('Pump A')
    expect(wrapper.text()).toContain('abcdef0123456789')
  })

  describe('device submit', () => {
    it('saves the device, closes the dialog and prompts for a restart', async () => {
      const wrapper = mountView()
      await flushPromises()
      const store = useConfigStore()
      const createOrUpdateDevice = vi.spyOn(store, 'createOrUpdateDevice')

      const dialog = wrapper.findComponent(DeviceDialogStub)
      dialog.vm.$emit('submit', clone().devices[0])
      await flushPromises()

      expect(createOrUpdateDevice).toHaveBeenCalledWith(clone().devices[0], 'web-user')
      expect(dialog.props('visible')).toBe(false)
      expect(restartApi.promptRestart).toHaveBeenCalledTimes(1)
    })

    it('does not prompt for a restart when the save fails', async () => {
      const wrapper = mountView()
      await flushPromises()
      const store = useConfigStore()
      vi.spyOn(store, 'createOrUpdateDevice').mockRejectedValue(new Error('boom'))

      wrapper.findComponent(DeviceDialogStub).vm.$emit('submit', clone().devices[0])
      await flushPromises()

      expect(restartApi.promptRestart).not.toHaveBeenCalled()
      expect(elMessage.error).toHaveBeenCalledWith(en.config.device.saveFailed)
    })
  })

  describe('device delete', () => {
    it('deletes the device and prompts for a restart', async () => {
      const wrapper = mountView()
      await flushPromises()
      const store = useConfigStore()
      const deleteDevice = vi.spyOn(store, 'deleteDevice')

      await wrapper.get(`button[data-title="${en.config.device.deleteConfirm}"]`).trigger('click')
      await flushPromises()

      expect(deleteDevice).toHaveBeenCalledWith('TECO_VFD', 3, 'web-user')
      expect(restartApi.promptRestart).toHaveBeenCalledTimes(1)
    })

    it('does not prompt for a restart when the delete fails', async () => {
      const wrapper = mountView()
      await flushPromises()
      const store = useConfigStore()
      vi.spyOn(store, 'deleteDevice').mockRejectedValue(new Error('boom'))

      await wrapper.get(`button[data-title="${en.config.device.deleteConfirm}"]`).trigger('click')
      await flushPromises()

      expect(restartApi.promptRestart).not.toHaveBeenCalled()
    })
  })

  describe('bus save', () => {
    it('saves an edited bus and prompts for a restart', async () => {
      const wrapper = mountView()
      await flushPromises()
      const store = useConfigStore()
      const createOrUpdateBus = vi.spyOn(store, 'createOrUpdateBus')

      await buttonByText(wrapper, en.config.bus.edit).trigger('click')
      await buttonByText(wrapper, en.config.common.save).trigger('click')
      await flushPromises()

      expect(createOrUpdateBus).toHaveBeenCalledWith(
        'bus0',
        { port: '/dev/ttyUSB0', baudrate: 9600, timeout: 1 },
        'web-user',
      )
      expect(restartApi.promptRestart).toHaveBeenCalledTimes(1)
    })

    it('does not save or prompt when the bus form fails validation', async () => {
      const wrapper = mountView()
      await flushPromises()
      const store = useConfigStore()
      const createOrUpdateBus = vi.spyOn(store, 'createOrUpdateBus')

      busFormValid.value = false
      await buttonByText(wrapper, en.config.bus.addBus).trigger('click')
      await buttonByText(wrapper, en.config.common.save).trigger('click')
      await flushPromises()

      expect(createOrUpdateBus).not.toHaveBeenCalled()
      expect(restartApi.promptRestart).not.toHaveBeenCalled()
    })

    it('does not prompt for a restart when the save fails', async () => {
      const wrapper = mountView()
      await flushPromises()
      const store = useConfigStore()
      vi.spyOn(store, 'createOrUpdateBus').mockRejectedValue(new Error('boom'))

      await buttonByText(wrapper, en.config.bus.edit).trigger('click')
      await buttonByText(wrapper, en.config.common.save).trigger('click')
      await flushPromises()

      expect(restartApi.promptRestart).not.toHaveBeenCalled()
    })
  })

  describe('bus delete', () => {
    it('deletes the bus and prompts for a restart', async () => {
      const wrapper = mountView()
      await flushPromises()
      const store = useConfigStore()
      const deleteBus = vi.spyOn(store, 'deleteBus')

      await wrapper.get(`button[data-title="${en.config.bus.deleteConfirm}"]`).trigger('click')
      await flushPromises()

      expect(deleteBus).toHaveBeenCalledWith('bus0', 'web-user')
      expect(restartApi.promptRestart).toHaveBeenCalledTimes(1)
    })

    it('does not prompt for a restart when the delete fails', async () => {
      const wrapper = mountView()
      await flushPromises()
      const store = useConfigStore()
      vi.spyOn(store, 'deleteBus').mockRejectedValue(new Error('boom'))

      await wrapper.get(`button[data-title="${en.config.bus.deleteConfirm}"]`).trigger('click')
      await flushPromises()

      expect(restartApi.promptRestart).not.toHaveBeenCalled()
    })
  })

  describe('restart completion', () => {
    it('refetches the config when the store announces a completed restart', async () => {
      mountView()
      await flushPromises()
      axiosGet.mockClear()

      restartApi.restartCompletedAt.value = Date.now()
      await flushPromises()

      expect(axiosGet).toHaveBeenCalledWith('/api/config/modbus')
    })
  })

  describe('backup restore', () => {
    it('refetches and prompts for a restart', async () => {
      const wrapper = mountView()
      await flushPromises()
      axiosGet.mockClear()

      wrapper.findComponent(BackupDialogStub).vm.$emit('restored')
      await flushPromises()

      expect(axiosGet).toHaveBeenCalledWith('/api/config/modbus')
      expect(restartApi.promptRestart).toHaveBeenCalledTimes(1)
    })
  })
})
