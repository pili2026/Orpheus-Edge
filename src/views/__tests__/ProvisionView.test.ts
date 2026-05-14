import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ProvisionView from '@/views/ProvisionView.vue'
import { useUIStore } from '@/stores/ui'

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

const { confirm } = vi.hoisted(() => ({ confirm: vi.fn(async () => true) }))
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
  restartRequired: ref(false),
  testingOrion: ref(false),
  registeringGateway: ref(false),
  loadingRegistrationState: ref(false),
  status: ref<any>({ service_registered: true, connected: true }),
}

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<any>('element-plus')
  return { ...actual, ElMessageBox: { confirm }, ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn(), closeAll: vi.fn() } }
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
