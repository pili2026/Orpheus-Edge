import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import RestartPendingBanner from '@/components/config/RestartPendingBanner.vue'
import { useUIStore } from '@/stores/ui'
import { useRestartStore } from '@/stores/restart'
import en from '@/locales/en'

const { axiosGet, axiosPost, elMessage } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  elMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock('axios', () => ({ default: { get: axiosGet, post: axiosPost } }))
vi.mock('element-plus', () => ({ ElMessage: elMessage, ElMessageBox: { confirm: vi.fn() } }))

const TALOS = en.config.talos
const RESTART_URL = '/api/provision/service/restart'
const MQTT_RESTART_URL = '/api/mqtt/restart'

const ElAlertStub = defineComponent({
  emits: ['close'],
  setup(_, { slots, emit }) {
    return () =>
      h('div', { class: 'el-alert' }, [
        h('div', { class: 'alert-title' }, slots.title?.()),
        h('button', { class: 'alert-close', onClick: () => emit('close') }),
        slots.default?.(),
      ])
  },
})
const ElButtonStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  setup(_, { slots, emit }) {
    return () =>
      h('button', { class: 'restart-btn', onClick: () => emit('click') }, slots.default?.())
  },
})

const mountBanner = () =>
  mount(RestartPendingBanner, {
    global: { stubs: { 'el-alert': ElAlertStub, 'el-button': ElButtonStub } },
  })

const buttons = (wrapper: ReturnType<typeof mountBanner>) => wrapper.findAll('.restart-btn')

/** Let a restart's POST settle, then run its poll and closing delay to the end. */
const completeRestart = async () => {
  await flushPromises()
  await vi.advanceTimersByTimeAsync(3000 + 600)
}

describe('RestartPendingBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
    axiosGet.mockResolvedValue({ data: {} })
    axiosPost.mockResolvedValue({ data: { success: true } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing while no scope is pending', () => {
    const wrapper = mountBanner()

    expect(wrapper.find('.el-alert').exists()).toBe(false)
  })

  it('one pending service renders one button with the unchanged copy', async () => {
    useRestartStore().markPending('modbus')
    const wrapper = mountBanner()
    await flushPromises()

    expect(wrapper.find('.alert-title').text()).toBe(TALOS.alertTitle)
    expect(buttons(wrapper)).toHaveLength(1)
    expect(buttons(wrapper)[0]!.text()).toBe(TALOS.restartService)
    expect(wrapper.text()).toContain(TALOS.scopes.modbus)
  })

  it('restarts the service the pending change belongs to, not the page it is shown on', async () => {
    // an MQTT save followed by navigating to the Modbus page: the banner names
    // MQTT, so the button must restart MQTT
    useRestartStore().markPending('mqtt')
    const wrapper = mountBanner()
    await flushPromises()

    expect(buttons(wrapper)).toHaveLength(1)
    expect(buttons(wrapper)[0]!.text()).toBe(TALOS.restartMqttService)

    await buttons(wrapper)[0]!.trigger('click')
    await flushPromises()

    expect(axiosPost).toHaveBeenCalledWith(MQTT_RESTART_URL)
    expect(axiosPost).not.toHaveBeenCalledWith(RESTART_URL)
  })

  it('two pending services render one named button each', async () => {
    const store = useRestartStore()
    store.markPending('modbus')
    store.markPending('system')
    store.markPending('mqtt')
    const wrapper = mountBanner()
    await flushPromises()

    expect(buttons(wrapper).map((b) => b.text())).toEqual([
      TALOS.restartService,
      TALOS.restartMqttService,
    ])

    const rows = wrapper.findAll('.pending-restart')
    expect(rows[0]!.text()).toContain(TALOS.scopes.modbus)
    expect(rows[0]!.text()).toContain(TALOS.scopes.system)
    expect(rows[0]!.text()).not.toContain(TALOS.scopes.mqtt)
    expect(rows[1]!.text()).toContain(TALOS.scopes.mqtt)
  })

  it('each button clears only the scopes its own service applies', async () => {
    const store = useRestartStore()
    store.markPending('modbus')
    store.markPending('system')
    store.markPending('mqtt')
    const wrapper = mountBanner()
    await flushPromises()

    await buttons(wrapper)[0]!.trigger('click')
    await completeRestart()

    expect(axiosPost).toHaveBeenCalledTimes(1)
    expect(axiosPost).toHaveBeenCalledWith(RESTART_URL)
    expect(store.pendingScopeList).toEqual(['mqtt'])

    await flushPromises()
    await buttons(wrapper)[0]!.trigger('click')
    await completeRestart()

    expect(axiosPost).toHaveBeenLastCalledWith(MQTT_RESTART_URL)
    expect(store.hasPending).toBe(false)
  })

  it('closing the banner drops every pending scope', async () => {
    const store = useRestartStore()
    store.markPending('modbus')
    store.markPending('mqtt')
    const wrapper = mountBanner()
    await flushPromises()

    await wrapper.get('.alert-close').trigger('click')

    expect(store.hasPending).toBe(false)
  })
})
