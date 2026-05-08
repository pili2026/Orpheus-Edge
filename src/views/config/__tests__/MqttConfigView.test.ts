import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import MqttConfigView from '@/views/config/MqttConfigView.vue'

const confirm = vi.fn(async () => true)
const restartService = vi.fn(async () => undefined)
const loadStatus = vi.fn(async () => undefined)

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

vi.mock('pinia', () => ({ storeToRefs: (s: any) => s }))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<any>('element-plus')
  return { ...actual, ElMessageBox: { confirm } }
})
vi.mock('@/stores/mqtt', () => ({
  useMqttStore: () => ({ ...storeState, loadConfig, loadStatus, saveConfig: vi.fn(async () => undefined), restartService }),
}))

describe('MqttConfigView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.config.value = null
    storeState.configLoaded.value = false
    storeState.configLoadError.value = null
  })

  it('save disabled before config loads', async () => {
    storeState.loadingConfig.value = true
    const wrapper = mount(MqttConfigView)
    await flushPromises()
    expect(wrapper.get('[data-testid="save-btn"]').attributes('disabled')).toBeDefined()
  })

  it('save disabled when config load fails', async () => {
    loadConfig.mockImplementationOnce(async () => { throw new Error('boom') })
    const wrapper = mount(MqttConfigView)
    await flushPromises()
    expect(wrapper.text()).toContain('Saving is disabled')
    expect(wrapper.get('[data-testid="save-btn"]').attributes('disabled')).toBeDefined()
  })

  it('cancel restart confirmation does not call restart api', async () => {
    confirm.mockRejectedValueOnce(new Error('cancel'))
    storeState.restartRequired.value = true
    const wrapper = mount(MqttConfigView)
    await flushPromises()
    await wrapper.find('button').trigger('click')
    expect(restartService).not.toHaveBeenCalled()
  })

  it('confirm restart calls restart api', async () => {
    storeState.restartRequired.value = true
    const wrapper = mount(MqttConfigView)
    await flushPromises()
    await wrapper.findAll('button').at(-1)!.trigger('click')
    await flushPromises()
    expect(restartService).toHaveBeenCalled()
  })
})
