import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import SystemConfigView from '@/views/config/SystemConfigView.vue'
import { useUIStore } from '@/stores/ui'
import { useRestartStore } from '@/stores/restart'
import type { SystemConfigInfo } from '@/stores/system_config'
import en from '@/locales/en'

const { axiosGet, axiosPost, elMessage } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  elMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock('axios', () => ({
  default: { get: axiosGet, post: axiosPost, isAxiosError: () => false },
}))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return { ...actual, ElMessage: elMessage, ElMessageBox: { confirm: vi.fn() } }
})
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const STORED: SystemConfigInfo = {
  monitor_interval_seconds: 5,
  control_interval_seconds: null,
  alert_interval_seconds: null,
  device_id_series: 2,
  reverse_ssh_port: 8600,
  reverse_ssh_port_source: 'service',
}

const serve = (config: SystemConfigInfo) => ({ data: { status: 'ok', config: { ...config } } })

// ===== Stubs =====

const PassThroughStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => h('div', [slots.header?.(), slots.default?.(), slots.suffix?.()])
  },
})
const ElButtonStub = defineComponent({
  inheritAttrs: false,
  props: ['disabled'],
  emits: ['click'],
  setup(props, { slots, emit }) {
    return () =>
      h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.())
  },
})
/**
 * ElForm is not driven directly here: under Vitest, element-plus loads from
 * its CommonJS build and every field reports valid regardless of its rules
 * (recorded in src/views/__tests__/ProvisionView.test.ts). The stub answers
 * the calls the view makes and reports the form valid.
 */
const ElFormStub = defineComponent({
  props: ['model', 'rules'],
  setup(_, { slots, expose }) {
    expose({
      validate: async (cb?: (valid: boolean) => void) => {
        cb?.(true)
        return true
      },
      validateField: async () => true,
      clearValidate: () => undefined,
    })
    return () => h('div', slots.default?.())
  },
})

const STUBS = {
  'el-card': PassThroughStub,
  'el-form': ElFormStub,
  'el-form-item': PassThroughStub,
  'el-input': PassThroughStub,
  'el-input-number': true,
  'el-divider': PassThroughStub,
  'el-tooltip': PassThroughStub,
  'el-icon': PassThroughStub,
  'el-link': PassThroughStub,
  'el-upload': PassThroughStub,
  'el-button': ElButtonStub,
  BackupDialog: true,
  RestartPendingBanner: true,
  RestartingDialog: true,
}

const mountView = () =>
  mount(SystemConfigView, {
    global: { stubs: STUBS, directives: { loading: () => undefined } },
  })

type Wrapper = ReturnType<typeof mountView>

const form = (wrapper: Wrapper) => (wrapper.vm as any).form
const isDirty = (wrapper: Wrapper): boolean => (wrapper.vm as any).isDirty

const buttonByText = (wrapper: Wrapper, text: string) => {
  const button = wrapper.findAll('button').find((b) => b.text() === text)
  if (!button) throw new Error(`no button labelled "${text}"`)
  return button
}

const complete = async (scopes: string[]) => {
  useRestartStore().restartCompletion = { at: Date.now(), scopes: scopes as never }
  await flushPromises()
}

describe('SystemConfigView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
    axiosGet.mockResolvedValue(serve(STORED))
    axiosPost.mockResolvedValue({ data: {} })
  })

  it('seeds the form from the stored config on mount', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(axiosGet).toHaveBeenCalledWith('/api/config/system')
    expect(form(wrapper).monitor_interval_seconds).toBe(5)
    expect(form(wrapper).device_id_series).toBe(2)
    expect(isDirty(wrapper)).toBe(false)
  })

  describe('a restart of another service', () => {
    it('does not refetch while the form is clean', async () => {
      const wrapper = mountView()
      await flushPromises()
      axiosGet.mockClear()

      await complete(['mqtt'])

      expect(axiosGet).not.toHaveBeenCalled()
      expect(form(wrapper).monitor_interval_seconds).toBe(5)
    })

    it('does not refetch or touch the form while it is dirty', async () => {
      const wrapper = mountView()
      await flushPromises()
      form(wrapper).monitor_interval_seconds = 42
      axiosGet.mockClear()

      await complete(['mqtt'])

      expect(axiosGet).not.toHaveBeenCalled()
      expect(form(wrapper).monitor_interval_seconds).toBe(42)
      expect(isDirty(wrapper)).toBe(true)
      expect(elMessage.warning).not.toHaveBeenCalled()
    })
  })

  describe('a restart of its own service', () => {
    it('refetches and reseeds a clean form', async () => {
      const wrapper = mountView()
      await flushPromises()
      axiosGet.mockResolvedValue(serve({ ...STORED, monitor_interval_seconds: 7 }))

      await complete(['modbus', 'system'])

      expect(axiosGet).toHaveBeenCalledTimes(2)
      expect(form(wrapper).monitor_interval_seconds).toBe(7)
      expect(isDirty(wrapper)).toBe(false)
      expect(elMessage.warning).not.toHaveBeenCalled()
    })

    it('keeps a dirty form, moves the baseline, and says the stored config changed', async () => {
      const wrapper = mountView()
      await flushPromises()
      form(wrapper).monitor_interval_seconds = 42
      axiosGet.mockResolvedValue(serve({ ...STORED, device_id_series: 9 }))

      await complete(['system'])

      expect(axiosGet).toHaveBeenCalledTimes(2)
      expect(form(wrapper).monitor_interval_seconds).toBe(42)
      expect(isDirty(wrapper)).toBe(true)
      expect(elMessage.warning).toHaveBeenCalledWith(en.common.changedWhileEditing)

      // the baseline is the fetched config: Reset restores it, not the old one
      await buttonByText(wrapper, en.config.common.cancel).trigger('click')
      expect(form(wrapper).monitor_interval_seconds).toBe(5)
      expect(form(wrapper).device_id_series).toBe(9)
      expect(isDirty(wrapper)).toBe(false)
    })

    it('keeps a dirty form silently when the stored config did not change', async () => {
      const wrapper = mountView()
      await flushPromises()
      form(wrapper).monitor_interval_seconds = 42

      await complete(['system'])

      expect(form(wrapper).monitor_interval_seconds).toBe(42)
      expect(elMessage.warning).not.toHaveBeenCalled()
    })

    it('fires again when the same scope completes twice', async () => {
      mountView()
      await flushPromises()
      axiosGet.mockClear()

      await complete(['system'])
      await complete(['system'])

      expect(axiosGet).toHaveBeenCalledTimes(2)
    })
  })

  it('ignores a completion that cleared nothing', async () => {
    mountView()
    await flushPromises()
    axiosGet.mockClear()

    await complete([])

    expect(axiosGet).not.toHaveBeenCalled()
  })

  describe('manual Refresh', () => {
    it('updates a clean form', async () => {
      const wrapper = mountView()
      await flushPromises()
      axiosGet.mockResolvedValue(serve({ ...STORED, monitor_interval_seconds: 7 }))

      await buttonByText(wrapper, en.config.refresh).trigger('click')
      await flushPromises()

      expect(form(wrapper).monitor_interval_seconds).toBe(7)
      expect(elMessage.warning).not.toHaveBeenCalled()
    })

    it('keeps a dirty form', async () => {
      const wrapper = mountView()
      await flushPromises()
      form(wrapper).monitor_interval_seconds = 42
      axiosGet.mockResolvedValue(serve({ ...STORED, monitor_interval_seconds: 7 }))

      await buttonByText(wrapper, en.config.refresh).trigger('click')
      await flushPromises()

      expect(form(wrapper).monitor_interval_seconds).toBe(42)
      expect(isDirty(wrapper)).toBe(true)
      expect(elMessage.warning).toHaveBeenCalledWith(en.common.changedWhileEditing)
    })
  })

  describe('save', () => {
    it('posts the form, re-baselines it and prompts for a restart', async () => {
      const wrapper = mountView()
      await flushPromises()
      form(wrapper).monitor_interval_seconds = 42
      await flushPromises() // Save is disabled until the dirty form re-renders
      axiosPost.mockImplementationOnce(async () => {
        axiosGet.mockResolvedValue(serve({ ...STORED, monitor_interval_seconds: 42 }))
        return { data: {} }
      })
      const restartStore = useRestartStore()

      await buttonByText(wrapper, en.config.common.save).trigger('click')
      await flushPromises()

      expect(axiosPost).toHaveBeenCalledWith(
        '/api/config/system',
        expect.objectContaining({ monitor_interval_seconds: 42 }),
      )
      expect(form(wrapper).monitor_interval_seconds).toBe(42)
      expect(isDirty(wrapper)).toBe(false)
      expect(elMessage.warning).not.toHaveBeenCalled()
      expect(restartStore.pendingScopeList).toEqual(['system'])
    })
  })
})
