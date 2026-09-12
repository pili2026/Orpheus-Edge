import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import AsyncValidator from 'async-validator'
import { ElForm, ElFormItem, ElInput } from 'element-plus'
import ProvisionView from '@/views/ProvisionView.vue'
import { useUIStore } from '@/stores/ui'
import { useRestartStore } from '@/stores/restart'
import { provisionService } from '@/services/provision'
import en from '@/locales/en'
import zhTW from '@/locales/zh-TW'

const PassThroughStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => [slots.header?.(), slots.default?.()]
  },
})
const ElDescriptionsItemStub = defineComponent({
  props: ['label'],
  setup(props, { slots }) {
    return () => h('div', [String(props.label ?? ''), slots.default?.()])
  },
})
const ElAlertStub = defineComponent({
  props: ['title', 'description'],
  setup(props, { slots }) {
    return () =>
      h('div', [String(props.title ?? ''), String(props.description ?? ''), slots.default?.()])
  },
})
const ElButtonStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  setup(_, { slots, emit }) {
    return () => h('button', { onClick: () => emit('click') }, slots.default?.())
  },
})

const STUBS = {
  'el-card': PassThroughStub,
  'el-descriptions': PassThroughStub,
  'el-descriptions-item': ElDescriptionsItemStub,
  'el-button': ElButtonStub,
  'el-alert': ElAlertStub,
  'el-form': PassThroughStub,
  'el-form-item': PassThroughStub,
  'el-input': true,
  'el-input-number': true,
  'el-space': PassThroughStub,
  'el-dialog': PassThroughStub,
  'el-tag': PassThroughStub,
  'el-skeleton': true,
  'el-progress': true,
  'el-icon': PassThroughStub,
}

const { confirm, axiosGet, axiosPost, elMessageWarning } = vi.hoisted(() => ({
  confirm: vi.fn(async () => true),
  elMessageWarning: vi.fn(),
  axiosGet: vi.fn(async () => ({ data: {} })),
  axiosPost: vi.fn(async () => ({ data: { success: true } })),
}))
const push = vi.fn()
const testOrionConnection = vi.fn(async () => ({}))
const registerGateway = vi.fn(async () => ({}))
const loadRegistrationState = vi.fn(async () => ({}))
const loadStatus = vi.fn(async (_opts?: { silent?: boolean }) => {})

const makeDeferred = <T = void>() => {
  let resolve: (value: T) => void = () => {}
  let reject: (err?: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const makeControllableLoadStatus = () => {
  const pending: Array<() => void> = []
  const impl = (_opts?: { silent?: boolean }) =>
    new Promise<void>((resolve) => {
      pending.push(resolve)
    })
  return {
    impl,
    resolveOldest: () => {
      const r = pending.shift()
      if (r) r()
    },
    resolveAll: () => {
      pending.splice(0).forEach((r) => r())
    },
    pendingCount: () => pending.length,
  }
}

const mqttState = {
  registrationState: ref<any>({ registered: null, gatewayId: null, username: null, passwordConfigured: null, mqttEnabled: null, connected: null, lastConnectionError: null }),
  orionTestResult: ref<any>(null),
  registrationSuccess: ref<string | null>(null),
  registrationError: ref<string | null>(null),
  testingOrion: ref(false),
  registeringGateway: ref(false),
  loadingRegistrationState: ref(false),
  status: ref<any>({ service_registered: true, connected: true }),
}

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<any>('element-plus')
  return { ...actual, ElMessageBox: { confirm }, ElMessage: { error: vi.fn(), success: vi.fn(), warning: elMessageWarning, info: vi.fn(), closeAll: vi.fn() } }
})
// only the restart store reaches axios from this view's import graph; `create`
// is kept real so any service module that loads still gets a usable instance
vi.mock('axios', async () => {
  const actual = await vi.importActual<any>('axios')
  return { default: { ...actual.default, get: axiosGet, post: axiosPost } }
})
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/stores/mqtt', () => ({ useMqttStore: () => ({ ...mqttState, testOrionConnection, registerGateway, loadRegistrationState, loadStatus }) }))
vi.mock('@/services/provision', () => ({ provisionService: { getCurrentConfig: vi.fn(async () => ({ hostname: 'h', reverse_port: 8600, port_source: 'service' })), setConfig: vi.fn(), triggerReboot: vi.fn() } }))

describe('ProvisionView mqtt registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
    mqttState.registrationState.value = {
      registered: null,
      gatewayId: null,
      username: null,
      passwordConfigured: null,
      mqttEnabled: null,
      connected: null,
      lastConnectionError: null,
    }
    mqttState.status.value = { service_registered: true, connected: true }
    loadStatus.mockImplementation(async (_opts?: { silent?: boolean }) => {})
  })

  describe('manual Refresh with unsaved edits', () => {
    const refresh = async (wrapper: ReturnType<typeof mount>) => {
      const button = wrapper.findAll('button').find((b) => b.text() === en.common.refresh)
      expect(button, 'refresh button not found').toBeDefined()
      await button!.trigger('click')
      await flushPromises()
    }

    it('keeps the edits when the stored config is unchanged, and says nothing', async () => {
      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()
      ;(wrapper.vm as any).formData.hostname = 'edited'

      await refresh(wrapper)

      expect((wrapper.vm as any).formData.hostname).toBe('edited')
      expect((wrapper.vm as any).hasChanges).toBe(true)
      expect(elMessageWarning).not.toHaveBeenCalled()
    })

    it('keeps the edits when the stored config changed, and says so', async () => {
      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()
      ;(wrapper.vm as any).formData.hostname = 'edited'
      vi.mocked(provisionService.getCurrentConfig).mockResolvedValueOnce({
        hostname: 'renamed',
        reverse_port: 8601,
        port_source: 'service',
      } as any)

      await refresh(wrapper)

      expect((wrapper.vm as any).formData.hostname).toBe('edited')
      expect((wrapper.vm as any).currentConfig.hostname).toBe('renamed')
      expect(elMessageWarning).toHaveBeenCalledWith(en.common.changedWhileEditing)
    })

    it('still reseeds a clean form', async () => {
      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()
      vi.mocked(provisionService.getCurrentConfig).mockResolvedValueOnce({
        hostname: 'renamed',
        reverse_port: 8601,
        port_source: 'service',
      } as any)

      await refresh(wrapper)

      expect((wrapper.vm as any).formData.hostname).toBe('renamed')
      expect(elMessageWarning).not.toHaveBeenCalled()
    })
  })

  describe('pending MQTT restart warning', () => {
    const guidance = en.provision.mqttRegistration.restartGuidance

    it('is absent while no MQTT restart is outstanding', async () => {
      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()

      expect(wrapper.text()).not.toContain(guidance)
    })

    it('is absent when only another scope is pending', async () => {
      useRestartStore().markPending('modbus')
      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()

      expect(wrapper.text()).not.toContain(guidance)
    })

    it('appears once an MQTT restart is outstanding', async () => {
      useRestartStore().markPending('mqtt')
      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()

      expect(wrapper.text()).toContain(guidance)
    })

    it('goes away when Talos is restarted from another page', async () => {
      const restartStore = useRestartStore()
      restartStore.markPending('mqtt')
      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()
      expect(wrapper.text()).toContain(guidance)

      // the restart happens on the MQTT config screen; this view is only a
      // reader of the same shared fact
      vi.useFakeTimers()
      try {
        await restartStore.restartNow()
        await flushPromises()
        await vi.advanceTimersByTimeAsync(3000 + 600)
      } finally {
        vi.useRealTimers()
      }
      await flushPromises()

      expect(axiosPost).toHaveBeenCalledWith('/api/provision/service/restart')
      expect(wrapper.text()).not.toContain(guidance)
    })
  })

  it('shows unknown state and no plaintext password', async () => {
    const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.text()).toContain('MQTT Gateway Registration')
    expect(wrapper.text()).toContain('Unknown')
  })

  it('calls actions with confirmation', async () => {
    mqttState.registrationState.value = { ...mqttState.registrationState.value, registered: true, passwordConfigured: true }
    const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
    await flushPromises()
    await (wrapper.vm as any).handleTestOrion()
    await (wrapper.vm as any).handleReregisterGateway()
    expect(testOrionConnection).toHaveBeenCalled()
    expect(confirm).toHaveBeenCalled()
    expect(registerGateway).toHaveBeenCalled()
  })

  it('reacts when registrationState changes after load', async () => {
    const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
    await flushPromises()
    mqttState.registrationState.value = { ...mqttState.registrationState.value, registered: false }
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Not Registered')
  })

  it('does not throw runtime error when opening register flow', async () => {
    const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
    await flushPromises()
    await expect((wrapper.vm as any).handleRegisterGateway()).resolves.toBeUndefined()
  })

  describe('TASK-A3 status polling', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    const advanceTick = async () => {
      await vi.advanceTimersByTimeAsync(1000)
    }

    it('does not poll when status already connected post-register', async () => {
      mqttState.status.value = { service_registered: true, connected: true }
      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()

      await (wrapper.vm as any).handleRegisterGateway()
      await vi.advanceTimersByTimeAsync(5000)
      await flushPromises()

      expect(loadStatus).not.toHaveBeenCalled()
      expect(wrapper.text()).not.toContain('Connecting to MQTT')
    })

    it('stops polling on success after a few ticks', async () => {
      mqttState.status.value = { service_registered: false, connected: false }
      let calls = 0
      loadStatus.mockImplementation(async (_opts?: { silent?: boolean }) => {
        calls += 1
        if (calls >= 3) {
          mqttState.status.value = { service_registered: true, connected: true }
        } else {
          mqttState.status.value = { service_registered: false, connected: false }
        }
      })

      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()
      await (wrapper.vm as any).handleRegisterGateway()
      await flushPromises()

      await advanceTick()
      await advanceTick()
      await advanceTick()

      expect(loadStatus).toHaveBeenCalledTimes(3)
      expect(loadStatus).toHaveBeenCalledWith({ silent: true })
      expect(wrapper.text()).not.toContain('Connecting to MQTT')
      expect(wrapper.text()).not.toContain('MQTT may take longer to come online')

      await vi.advanceTimersByTimeAsync(5000)
      expect(loadStatus).toHaveBeenCalledTimes(3)
    })

    it('times out after 30 attempts', async () => {
      mqttState.status.value = { service_registered: false, connected: false }
      loadStatus.mockImplementation(async (_opts?: { silent?: boolean }) => {
        mqttState.status.value = { service_registered: false, connected: false }
      })

      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()
      await (wrapper.vm as any).handleRegisterGateway()
      await flushPromises()

      for (let i = 0; i < 30; i++) {
        await advanceTick()
      }

      expect(loadStatus).toHaveBeenCalledTimes(30)
      expect(wrapper.text()).not.toContain('Connecting to MQTT')
      expect(wrapper.text()).toContain('MQTT may take longer to come online')
    })

    it('clears stale timeout warning when a subsequent register sees status already connected', async () => {
      mqttState.status.value = { service_registered: false, connected: false }
      loadStatus.mockImplementation(async (_opts?: { silent?: boolean }) => {
        mqttState.status.value = { service_registered: false, connected: false }
      })

      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()
      await (wrapper.vm as any).handleRegisterGateway()
      await flushPromises()

      for (let i = 0; i < 30; i++) {
        await advanceTick()
      }
      expect(wrapper.text()).toContain('MQTT may take longer to come online')

      mqttState.registrationState.value = {
        ...mqttState.registrationState.value,
        registered: true,
      }
      mqttState.status.value = { service_registered: true, connected: true }

      await (wrapper.vm as any).handleReregisterGateway()
      await flushPromises()

      expect(wrapper.text()).not.toContain('MQTT may take longer to come online')
    })

    it('cancels stale poll when re-register fires', async () => {
      mqttState.status.value = { service_registered: false, connected: false }
      mqttState.registrationState.value = {
        ...mqttState.registrationState.value,
        registered: true,
      }
      loadStatus.mockImplementation(async (_opts?: { silent?: boolean }) => {
        mqttState.status.value = { service_registered: false, connected: false }
      })

      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()
      await (wrapper.vm as any).handleReregisterGateway()
      await flushPromises()

      await advanceTick()
      await advanceTick()
      const callsAfterTwoTicks = loadStatus.mock.calls.length

      await (wrapper.vm as any).handleReregisterGateway()
      await flushPromises()

      await advanceTick()
      await advanceTick()
      await advanceTick()
      await advanceTick()
      await advanceTick()

      const delta = loadStatus.mock.calls.length - callsAfterTwoTicks
      expect(delta).toBeGreaterThanOrEqual(4)
      expect(delta).toBeLessThanOrEqual(6)
    })

    it('does not resurrect polling when unmount happens during a pending loadStatus()', async () => {
      const controllable = makeControllableLoadStatus()
      loadStatus.mockImplementation(controllable.impl)

      mqttState.status.value = { service_registered: false, connected: false }

      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()

      await (wrapper.vm as any).handleRegisterGateway()
      await flushPromises()

      vi.advanceTimersByTime(1000)
      await flushPromises()
      expect(loadStatus).toHaveBeenCalledTimes(1)
      expect(controllable.pendingCount()).toBe(1)

      wrapper.unmount()
      await flushPromises()

      controllable.resolveOldest()
      await flushPromises()

      vi.advanceTimersByTime(10_000)
      await flushPromises()
      expect(loadStatus).toHaveBeenCalledTimes(1)
      expect(controllable.pendingCount()).toBe(0)
    })

    it('does not start polling when view unmounts while registerGateway is in flight', async () => {
      mqttState.status.value = { service_registered: false, connected: false } as any
      mqttState.registrationState.value = {
        ...mqttState.registrationState.value,
        registered: null,
      }

      const deferred = makeDeferred<void>()
      registerGateway.mockImplementationOnce(() => deferred.promise as any)

      const wrapper = mount(ProvisionView, { global: { stubs: STUBS } })
      await flushPromises()

      const handlerDone = (wrapper.vm as any).handleRegisterGateway()
      await flushPromises()

      expect(registerGateway).toHaveBeenCalledTimes(1)

      wrapper.unmount()
      await flushPromises()

      deferred.resolve()
      await handlerDone
      await flushPromises()

      vi.advanceTimersByTime(10_000)
      await flushPromises()

      expect(loadStatus).not.toHaveBeenCalled()
    })
  })

  describe('TASK-A2 register / re-register button surface', () => {
    const buttonStub = {
      name: 'el-button',
      props: ['loading', 'disabled', 'type'],
      template:
        '<button :data-loading="String(!!loading)" :data-disabled="String(!!disabled)" :data-type="type || \'\'"><slot/></button>',
    }

    const tooltipStub = {
      name: 'el-tooltip',
      props: ['content', 'disabled', 'placement'],
      template:
        '<div :data-tooltip-content="content" :data-tooltip-disabled="String(!!disabled)"><slot/></div>',
    }

    const A2_STUBS = {
      'el-card': PassThroughStub,
      'el-descriptions': PassThroughStub,
      'el-descriptions-item': ElDescriptionsItemStub,
      'el-button': buttonStub,
      'el-tooltip': tooltipStub,
      'el-alert': ElAlertStub,
      'el-form': PassThroughStub,
      'el-form-item': PassThroughStub,
      'el-input': true,
      'el-input-number': true,
      'el-space': { template: '<div><slot/></div>' },
      'el-dialog': true,
      'el-tag': true,
      'el-skeleton': true,
      'el-progress': true,
      'el-icon': true,
    }

    const mountView = () => mount(ProvisionView, { global: { stubs: A2_STUBS } })

    const findPrimary = (wrapper: ReturnType<typeof mountView>) => {
      const all = wrapper.findAll('[data-type="primary"]')
      const btn = all.find((b) => b.text().includes('Register Gateway'))
      if (!btn) throw new Error('Register Gateway primary button not found')
      return btn
    }

    const findSecondary = (wrapper: ReturnType<typeof mountView>) => {
      const all = wrapper.findAll('button')
      return all.find((b) => b.text().includes('Re-register')) ?? null
    }

    const findTooltip = (wrapper: ReturnType<typeof mountView>) =>
      wrapper.find('[data-tooltip-content*="Already registered"]')

    it('R=false idle: primary enabled, no spinner, tooltip disabled, secondary hidden', async () => {
      mqttState.registrationState.value = {
        ...mqttState.registrationState.value,
        registered: false,
      }
      mqttState.loadingRegistrationState.value = false
      mqttState.registeringGateway.value = false

      const wrapper = mountView()
      await flushPromises()

      const primary = findPrimary(wrapper)
      expect(primary.exists()).toBe(true)
      expect(primary.attributes('data-disabled')).toBe('false')
      expect(primary.attributes('data-loading')).toBe('false')

      const tooltip = findTooltip(wrapper)
      expect(tooltip.attributes('data-tooltip-disabled')).toBe('true')

      expect(findSecondary(wrapper)).toBeFalsy()
    })

    it('R=true idle: primary disabled with tooltip, secondary visible and enabled', async () => {
      mqttState.registrationState.value = {
        ...mqttState.registrationState.value,
        registered: true,
      }
      mqttState.loadingRegistrationState.value = false
      mqttState.registeringGateway.value = false

      const wrapper = mountView()
      await flushPromises()

      const primary = findPrimary(wrapper)
      expect(primary.attributes('data-disabled')).toBe('true')
      expect(primary.attributes('data-loading')).toBe('false')

      const tooltip = findTooltip(wrapper)
      expect(tooltip.attributes('data-tooltip-disabled')).toBe('false')
      expect(tooltip.attributes('data-tooltip-content')).toContain('Already registered')

      const secondary = findSecondary(wrapper)
      expect(secondary).toBeTruthy()
      expect(secondary!.attributes('data-disabled')).toBe('false')
      expect(secondary!.attributes('data-loading')).toBe('false')
    })

    it('R=false RG=true (first register in flight): primary disabled with spinner, secondary hidden', async () => {
      mqttState.registrationState.value = {
        ...mqttState.registrationState.value,
        registered: false,
      }
      mqttState.registeringGateway.value = true

      const wrapper = mountView()
      await flushPromises()

      const primary = findPrimary(wrapper)
      expect(primary.attributes('data-disabled')).toBe('true')
      expect(primary.attributes('data-loading')).toBe('true')

      expect(findSecondary(wrapper)).toBeFalsy()
    })

    it('R=true RG=true (re-register in flight): primary disabled no spinner, secondary disabled with spinner', async () => {
      mqttState.registrationState.value = {
        ...mqttState.registrationState.value,
        registered: true,
      }
      mqttState.registeringGateway.value = true

      const wrapper = mountView()
      await flushPromises()

      const primary = findPrimary(wrapper)
      expect(primary.attributes('data-disabled')).toBe('true')
      expect(primary.attributes('data-loading')).toBe('false')

      const secondary = findSecondary(wrapper)
      expect(secondary).toBeTruthy()
      expect(secondary!.attributes('data-disabled')).toBe('true')
      expect(secondary!.attributes('data-loading')).toBe('true')
    })

    it('R=true polling active: both buttons disabled, secondary visible', async () => {
      vi.useFakeTimers()
      try {
        mqttState.registrationState.value = {
          ...mqttState.registrationState.value,
          registered: true,
        }
        mqttState.registeringGateway.value = false
        mqttState.status.value = { service_registered: false, connected: false }
        loadStatus.mockImplementation(async (_opts?: { silent?: boolean }) => {
          mqttState.status.value = { service_registered: false, connected: false }
        })

        const wrapper = mountView()
        await flushPromises()

        await (wrapper.vm as any).handleReregisterGateway()
        await flushPromises()
        await vi.advanceTimersByTimeAsync(1000)
        await flushPromises()

        const primary = findPrimary(wrapper)
        expect(primary.attributes('data-disabled')).toBe('true')

        const secondary = findSecondary(wrapper)
        expect(secondary).toBeTruthy()
        expect(secondary!.attributes('data-disabled')).toBe('true')
      } finally {
        vi.useRealTimers()
      }
    })

    it('R=null initial unknown: primary enabled, tooltip disabled, secondary hidden', async () => {
      mqttState.registrationState.value = {
        ...mqttState.registrationState.value,
        registered: null,
      }
      mqttState.loadingRegistrationState.value = false
      mqttState.registeringGateway.value = false

      const wrapper = mountView()
      await flushPromises()

      const primary = findPrimary(wrapper)
      expect(primary.attributes('data-disabled')).toBe('false')

      const tooltip = findTooltip(wrapper)
      expect(tooltip.attributes('data-tooltip-disabled')).toBe('true')

      expect(findSecondary(wrapper)).toBeFalsy()
    })

    it('LS=true (initial loading): primary disabled, secondary hidden when R is not true', async () => {
      mqttState.registrationState.value = {
        ...mqttState.registrationState.value,
        registered: null,
      }
      mqttState.loadingRegistrationState.value = true
      mqttState.registeringGateway.value = false

      const wrapper = mountView()
      await flushPromises()

      const primary = findPrimary(wrapper)
      expect(primary.attributes('data-disabled')).toBe('true')

      expect(findSecondary(wrapper)).toBeFalsy()
    })

    it('handleReregisterGateway confirm-accept: registerGateway called and polling kicks off', async () => {
      vi.useFakeTimers()
      try {
        mqttState.registrationState.value = {
          ...mqttState.registrationState.value,
          registered: true,
        }
        mqttState.status.value = { service_registered: false, connected: false }
        loadStatus.mockImplementation(async (_opts?: { silent?: boolean }) => {
          mqttState.status.value = { service_registered: false, connected: false }
        })
        confirm.mockResolvedValueOnce(true)

        const wrapper = mountView()
        await flushPromises()

        await (wrapper.vm as any).handleReregisterGateway()
        await flushPromises()

        expect(confirm).toHaveBeenCalledTimes(1)
        expect(registerGateway).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(1000)
        await flushPromises()
        expect(loadStatus).toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('handleReregisterGateway confirm-reject: registerGateway NOT called', async () => {
      mqttState.registrationState.value = {
        ...mqttState.registrationState.value,
        registered: true,
      }
      confirm.mockRejectedValueOnce(new Error('cancel'))

      const wrapper = mountView()
      await flushPromises()

      await (wrapper.vm as any).handleReregisterGateway()
      await flushPromises()

      expect(confirm).toHaveBeenCalledTimes(1)
      expect(registerGateway).not.toHaveBeenCalled()
      expect(loadStatus).not.toHaveBeenCalled()
    })

    it('handleRegisterGateway never calls confirm (regression guard)', async () => {
      mqttState.registrationState.value = {
        ...mqttState.registrationState.value,
        registered: false,
      }

      const wrapper = mountView()
      await flushPromises()

      await (wrapper.vm as any).handleRegisterGateway()
      await flushPromises()

      expect(confirm).not.toHaveBeenCalled()
      expect(registerGateway).toHaveBeenCalledTimes(1)
    })
  })
})

// ==================== Hostname width rule ====================
//
// The Talos backend requires the provisioning hostname to be exactly a fixed
// number of alphanumeric characters, and this form validates the hostname on
// every submission -- so a stale width here breaks every save, including one
// that changes only the reverse SSH port. These tests read the width out of
// the component's own rule rather than restating it, so the width is stated in
// one place and the checks cannot drift from it.

const REAL_FORM_STUBS = {
  'el-card': PassThroughStub,
  'el-descriptions': PassThroughStub,
  'el-descriptions-item': ElDescriptionsItemStub,
  'el-button': ElButtonStub,
  'el-alert': ElAlertStub,
  'el-space': PassThroughStub,
  'el-dialog': PassThroughStub,
  'el-tag': PassThroughStub,
  'el-skeleton': true,
  'el-progress': true,
  'el-icon': PassThroughStub,
}

// Real ElForm / ElFormItem / ElInput, so the wiring assertions below see what
// the component actually renders rather than a stub's attributes.
const mountWithRealForm = () =>
  mount(ProvisionView, {
    global: {
      components: { ElForm, ElFormItem, ElInput },
      stubs: REAL_FORM_STUBS,
    },
  })

type Wrapper = ReturnType<typeof mountWithRealForm>

const hostnameRules = (wrapper: Wrapper): Array<Record<string, unknown>> => {
  const rules = (wrapper.vm as any).formRules?.hostname
  expect(Array.isArray(rules), 'formRules.hostname is not an array of rules').toBe(true)
  return rules
}

/** The exact width the component's own hostname rule enforces. */
const ruleWidth = (wrapper: Wrapper): number => {
  const patternRule = hostnameRules(wrapper).find((r) => r.pattern instanceof RegExp)
  expect(patternRule, 'formRules.hostname has no pattern rule').toBeTruthy()
  const source = (patternRule!.pattern as RegExp).source
  // An exact width, `{n}` -- not a range, which is what diverged from the
  // backend in the first place and let a short hostname through to a 422.
  const match = /\{(\d+)\}\$?$/.exec(source)
  expect(match, `hostname pattern /${source}/ does not state an exact width`).toBeTruthy()
  return Number(match![1])
}

/**
 * Run the component's own hostname rules exactly as ElFormItem runs them:
 * the same async-validator schema, the same `firstFields` option, and the
 * same "first error wins" message the form-item surfaces to the user.
 *
 * ElForm is not driven directly here. Under Vitest, element-plus is loaded
 * from its CommonJS build and its `import AsyncValidator from 'async-validator'`
 * resolves to a namespace rather than the constructor, so ElFormItem throws
 * internally and *every* field reports valid -- reverse_port included. That is
 * a test-harness defect, not a product one (Vite resolves the ESM build for
 * the real app), but it means a test driving ElForm would pass no matter what
 * the rule said.
 */
const validateHostname = async (
  wrapper: Wrapper,
  value: string,
): Promise<{ valid: boolean; message: string }> => {
  const rules = hostnameRules(wrapper).map(({ trigger: _trigger, ...rule }) => rule)
  const validator = new AsyncValidator({ hostname: rules })
  try {
    await validator.validate({ hostname: value }, { firstFields: true })
    return { valid: true, message: '' }
  } catch (err: any) {
    return { valid: false, message: err?.errors?.[0]?.message ?? '' }
  }
}

/** The single number a locale's placeholder states, e.g. "12" in "(12 ...)". */
const placeholderWidth = (placeholder: string, locale: string): number => {
  const numbers = placeholder.match(/\d+/g)
  expect(numbers, `${locale} hostnamePlaceholder states no width: ${placeholder}`).toBeTruthy()
  expect(
    numbers!.length,
    `${locale} hostnamePlaceholder states ${numbers!.length} numbers, so which is the width is ambiguous: ${placeholder}`,
  ).toBe(1)
  return Number(numbers![0])
}

describe('ProvisionView hostname rule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
  })

  it('rejects a hostname one character under the rule width', async () => {
    const wrapper = mountWithRealForm()
    await flushPromises()
    const width = ruleWidth(wrapper)

    const { valid } = await validateHostname(wrapper, 'a'.repeat(width - 1))
    expect(valid, `${width - 1} characters should be rejected`).toBe(false)
  })

  it('accepts a hostname of exactly the rule width', async () => {
    const wrapper = mountWithRealForm()
    await flushPromises()
    const width = ruleWidth(wrapper)

    const value = 'a1'.repeat(width).slice(0, width)
    const { valid, message } = await validateHostname(wrapper, value)
    expect(valid, `${width} alphanumeric characters should be accepted, got: ${message}`).toBe(true)
  })

  it('rejects a hostname one character over the rule width', async () => {
    const wrapper = mountWithRealForm()
    await flushPromises()
    const width = ruleWidth(wrapper)

    const { valid } = await validateHostname(wrapper, 'a'.repeat(width + 1))
    expect(valid, `${width + 1} characters should be rejected`).toBe(false)
  })

  it('rejects a correct-width hostname containing a non-alphanumeric character, by the character rule', async () => {
    const wrapper = mountWithRealForm()
    await flushPromises()
    const width = ruleWidth(wrapper)

    const value = `${'a'.repeat(width - 1)}-`
    // Guard: an input of the wrong width would be refused by the width rule
    // before the character class was ever consulted, leaving this test green
    // while proving nothing.
    expect(value).toHaveLength(width)
    expect(
      new RegExp(`^.{${width}}$`).test(value),
      'the input must satisfy the width, so only the character class can reject it',
    ).toBe(true)

    const { valid, message } = await validateHostname(wrapper, value)
    expect(valid).toBe(false)
    expect(message).toMatch(/alphanumeric/i)
  })

  it("matches each locale's stated width against the rule's width", async () => {
    const wrapper = mountWithRealForm()
    await flushPromises()
    const width = ruleWidth(wrapper)

    expect(placeholderWidth(en.provision.hostnamePlaceholder, 'en')).toBe(width)
    expect(placeholderWidth(zhTW.provision.hostnamePlaceholder, 'zh-TW')).toBe(width)
  })

  it("matches the input's own maxlength against the rule's width", async () => {
    const wrapper = mountWithRealForm()
    await flushPromises()
    const width = ruleWidth(wrapper)

    const input = wrapper.find('input[maxlength]')
    expect(input.exists(), 'hostname input not found').toBe(true)
    expect(Number(input.attributes('maxlength'))).toBe(width)
  })

  it('attaches the hostname rules to the hostname field', async () => {
    const wrapper = mountWithRealForm()
    await flushPromises()

    // A correct rule bound to the wrong field would pass every test above.
    const props = wrapper.findAllComponents(ElFormItem).map((c) => c.props('prop'))
    expect(props).toContain('hostname')
    expect(Object.keys((wrapper.vm as any).formRules)).toContain('hostname')
  })
})
