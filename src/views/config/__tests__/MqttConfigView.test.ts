import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import MqttConfigView from '@/views/config/MqttConfigView.vue'

const { confirm } = vi.hoisted(() => ({ confirm: vi.fn(async () => true) }))
const loadStatus = vi.fn(async () => undefined)
const saveConfig = vi.fn(async () => undefined)
const routerPush = vi.fn(async () => undefined)
const routerReplace = vi.fn(async () => undefined)
const route = { query: {} as Record<string, string> }

const storeState = {
  config: ref<any>(null),
  status: ref<any>({ registered: false, connected: false }),
  loadingConfig: ref(false),
  loadingStatus: ref(false),
  saving: ref(false),
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
const PassThroughStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots, attrs }) {
    return () => h('div', attrs, [slots.header?.(), slots.default?.(), slots.title?.()])
  },
})
const ElAlertStub = defineComponent({
  props: ['title', 'description'],
  setup(props, { slots }) {
    return () =>
      h('div', [
        String(props.title ?? ''),
        String(props.description ?? ''),
        slots.title?.(),
        slots.default?.(),
      ])
  },
})
const ElFormItemStub = defineComponent({
  props: ['label'],
  setup(props, { slots }) {
    return () => h('div', [String(props.label ?? ''), slots.default?.()])
  },
})

const restartStore = {
  restartCompletedAt: ref<number | null>(null),
}

// storeToRefs is identity here because the store doubles below are already
// plain objects of refs; the rest of pinia is kept real so that modules pulled
// in by the shared restart components (which call defineStore) still load.
vi.mock('pinia', async () => {
  const actual = await vi.importActual<any>('pinia')
  return { ...actual, storeToRefs: (s: any) => s }
})
vi.mock('@/stores/restart', () => ({ useRestartStore: () => restartStore }))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: {
      config: {
        mqtt: {
          back: 'Back',
          title: 'MQTT Configuration',
          refresh: 'Refresh',
          save: 'Save',
          loadFailed: 'MQTT config failed to load. Saving is disabled until config is loaded successfully.',
          restartRequired: 'Restart required',
          restartTalos: 'Restart Talos',
          mqttEnabled: 'MQTT Enabled',
          brokerHost: 'Broker Host',
          brokerPort: 'Broker Port',
          tlsEnabled: 'TLS Enabled',
          caCertPath: 'CA Cert Path',
          tlsInsecureSkipVerify: 'TLS Insecure Skip Verify',
          username: 'Username',
          passwordConfigured: 'Password Configured',
          missing: 'Missing',
          configured: 'Configured',
          clientId: 'Client ID',
          cleanSession: 'Clean Session',
          keepaliveSeconds: 'Keepalive Seconds',
          baseTopicPrefix: 'Base Topic Prefix',
          eventEnabled: 'Event Enabled',
          telemetryEnabled: 'Telemetry Enabled',
          telemetryNotice: 'Telemetry notice',
          loadToEdit: 'Load MQTT config to edit settings.',
        },
      },
    },
  }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useRoute: () => route,
}))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<any>('element-plus')
  return { ...actual, ElMessageBox: { confirm } }
})
const mqttStoreDouble = { ...storeState, loadConfig, loadStatus, saveConfig }
vi.mock('@/stores/mqtt', () => ({ useMqttStore: () => mqttStoreDouble }))

describe('MqttConfigView', () => {
  const mountView = () =>
    mount(MqttConfigView, {
      global: {
        stubs: {
          'el-button': ElButtonStub,
          'el-card': PassThroughStub,
          'el-form': PassThroughStub,
          'el-form-item': ElFormItemStub,
          'el-switch': true,
          'el-input': true,
          'el-input-number': true,
          'el-alert': ElAlertStub,
          'el-tag': PassThroughStub,
          'el-empty': true,
          RestartPendingBanner: true,
          RestartingDialog: true,
        },
        directives: { loading: () => undefined },
      },
    })

  beforeEach(() => {
    vi.clearAllMocks()
    storeState.config.value = null
    storeState.configLoaded.value = false
    storeState.configLoadError.value = null
    storeState.loadingConfig.value = false
    restartStore.restartCompletedAt.value = null
    route.query = {}
    routerPush.mockClear()
    routerReplace.mockClear()
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
    expect(wrapper.text()).toContain('MQTT config failed to load')
    expect(wrapper.get('[data-testid="save-btn"]').attributes('disabled')).toBeDefined()
  })

  it('save failure does not throw from save handler', async () => {
    const wrapper = mountView()
    await flushPromises()
    saveConfig.mockRejectedValueOnce(new Error('save failed'))
    // force button enabled path: the draft itself must differ from its baseline
    ;(wrapper.vm as any).draft.enabled = false
    await flushPromises()
    await expect(wrapper.get('[data-testid="save-btn"]').trigger('click')).resolves.toBeUndefined()
    await flushPromises()
    expect(saveConfig).toHaveBeenCalled()
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
    expect(routerReplace).toHaveBeenCalledWith('/config')
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('back button routes to provision when from=provision', async () => {
    route.query = { from: 'provision' }
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="back-btn"]').trigger('click')
    expect(routerReplace).toHaveBeenCalledWith('/provision')
    expect(routerPush).not.toHaveBeenCalled()
  })

it('a completed restart refreshes, and clears nothing itself', async () => {
    mountView()
    await flushPromises()
    loadConfig.mockClear()

    restartStore.restartCompletedAt.value = Date.now()
    await flushPromises()

    expect(loadConfig).toHaveBeenCalled()
    // no pending-state mutation reaches the shared store from this view
    expect(Object.keys(restartStore)).toEqual(['restartCompletedAt'])
  })
})
