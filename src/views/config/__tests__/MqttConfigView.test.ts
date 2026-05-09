import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import MqttConfigView from '@/views/config/MqttConfigView.vue'

const confirm = vi.fn(async () => true)
const restartService = vi.fn(async () => undefined)
const loadStatus = vi.fn(async () => undefined)
const saveConfig = vi.fn(async () => undefined)
const routerPush = vi.fn(async () => undefined)
const route = { query: {} as Record<string, string> }

const storeState = {
  config: ref<any>(null),
  status: ref<any>({ registered: false, connected: false }),
  loadingConfig: ref(false),
  loadingStatus: ref(false),
  saving: ref(false),
  restarting: ref(false),
  restartRequired: ref(false),
  configLoaded: ref(false),
  configLoadError: ref<string | null>(null),
  statusLoadError: ref<string | null>(null),
}

const loadConfig = vi.fn(async () => {
  storeState.config.value = {
    enabled: true,
    broker: { host: 'host', port: 1883, tls: { enabled: false, ca_cert_path: '', insecure_skip_verify: false } },
    credentials: { username: 'u', password_configured: true },
    client: { client_id: 'cid', clean_session: true, keepalive_sec: 60 },
    reconnect: {}, qos: {}, topics: { base_prefix: 'bp' }, outbox: {}, status: {}, event: { enabled: true }, telemetry: { enabled: false },
  }
  storeState.configLoaded.value = true
})

const ElButtonStub = defineComponent({
  props: ['disabled'],
  emits: ['click'],
  setup(props, { emit, slots, attrs }) {
    return () => h('button', { ...attrs, disabled: props.disabled, onClick: () => emit('click') }, slots.default?.())
  },
})

vi.mock('pinia', () => ({ storeToRefs: (s: any) => s }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
  useRoute: () => route,
}))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<any>('element-plus')
  return { ...actual, ElMessageBox: { confirm } }
})
vi.mock('@/stores/mqtt', () => ({
  useMqttStore: () => ({ ...storeState, loadConfig, loadStatus, saveConfig, restartService }),
}))

describe('MqttConfigView', () => {
  const mountView = () =>
    mount(MqttConfigView, {
      global: {
        stubs: { 'el-button': ElButtonStub, 'el-card': true, 'el-form': true, 'el-form-item': true, 'el-switch': true, 'el-input': true, 'el-input-number': true, 'el-alert': true, 'el-tag': true, 'el-empty': true },
      },
    })

  beforeEach(() => {
    vi.clearAllMocks()
    storeState.config.value = null
    storeState.configLoaded.value = false
    storeState.configLoadError.value = null
    storeState.loadingConfig.value = false
    storeState.restartRequired.value = false
    route.query = {}
  })

  it('save disabled before config loads', async () => {
    storeState.loadingConfig.value = true
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('[data-testid="save-btn"]').attributes('disabled')).toBeDefined()
  })

  it('save disabled when config load fails', async () => {
    loadConfig.mockImplementationOnce(async () => {
      storeState.configLoadError.value = 'Failed to load MQTT config'
      throw new Error('boom')
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('config.mqtt.loadFailed')
    expect(wrapper.get('[data-testid="save-btn"]').attributes('disabled')).toBeDefined()
  })

  it('cancel restart confirmation does not call restart api', async () => {
    confirm.mockRejectedValueOnce(new Error('cancel'))
    storeState.restartRequired.value = true
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('button').at(-1)!.trigger('click')
    expect(restartService).not.toHaveBeenCalled()
  })

  it('restart failure does not throw from handler', async () => {
    restartService.mockRejectedValueOnce(new Error('restart failed'))
    storeState.restartRequired.value = true
    const wrapper = mountView()
    await flushPromises()
    await expect(wrapper.findAll('button').at(-1)!.trigger('click')).resolves.toBeUndefined()
  })

  it('load status failure after restart does not throw', async () => {
    loadStatus.mockRejectedValueOnce(new Error('status failed'))
    storeState.restartRequired.value = true
    const wrapper = mountView()
    await flushPromises()
    await expect(wrapper.findAll('button').at(-1)!.trigger('click')).resolves.toBeUndefined()
  })

  it('save failure does not throw from save handler', async () => {
    const wrapper = mountView()
    await flushPromises()
    saveConfig.mockRejectedValueOnce(new Error('save failed'))
    // force button enabled path
    storeState.configLoaded.value = true
    storeState.config.value!.enabled = false
    await wrapper.vm.$forceUpdate()
    await expect(wrapper.get('[data-testid="save-btn"]').trigger('click')).resolves.toBeUndefined()
  })

  
  it('initial null status renders unknown values', async () => {
    storeState.status.value = null
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Unknown')
  })


  it('status failure clears stale status and renders Unknown', async () => {
    storeState.status.value = { registered: true, connected: true, service_registered: true }
    loadStatus.mockImplementationOnce(async () => {
      storeState.status.value = null
      throw new Error('status failed')
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Unknown')
    expect(wrapper.text()).toContain('N/A')
  })

  it('connected=false renders No', async () => {
    storeState.status.value = { registered: true, connected: false, service_registered: true }
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('No')
  })

  it('registered=false renders No', async () => {
    storeState.status.value = { registered: false, connected: true, service_registered: true }
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('No')
  })

  it('connected=true renders Yes', async () => {
    storeState.status.value = { registered: true, connected: true, service_registered: false }
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Yes')
  })

  it('back button routes to safe config route by default', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="back-btn"]').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/config')
  })

  it('back button routes to provision when from=provision', async () => {
    route.query = { from: 'provision' }
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="back-btn"]').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/provision')
  })

it('confirm restart calls restart api', async () => {
    storeState.restartRequired.value = true
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('button').at(-1)!.trigger('click')
    await flushPromises()
    expect(restartService).toHaveBeenCalled()
  })
})
