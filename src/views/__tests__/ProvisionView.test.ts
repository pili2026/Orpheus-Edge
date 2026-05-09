import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import ProvisionView from '@/views/ProvisionView.vue'

const confirm = vi.fn(async () => true)
const push = vi.fn()
const testOrionConnection = vi.fn(async () => ({}))
const registerGateway = vi.fn(async () => ({}))
const loadRegistrationState = vi.fn(async () => ({}))

const mqttState = {
  registrationState: ref<any>({ registered: null, gatewayId: null, username: null, passwordConfigured: null, mqttEnabled: null, connected: null, lastConnectionError: null }),
  orionTestResult: ref<any>(null),
  registrationSuccess: ref<string | null>(null),
  registrationError: ref<string | null>(null),
  restartRequired: ref(false),
  testingOrion: ref(false),
  registeringGateway: ref(false),
  loadingRegistration: ref(false),
}

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<any>('element-plus')
  return { ...actual, ElMessageBox: { confirm }, ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn(), closeAll: vi.fn() } }
})
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/stores/mqtt', () => ({ useMqttStore: () => ({ ...mqttState, testOrionConnection, registerGateway, loadRegistrationState }) }))
vi.mock('@/services/provision', () => ({ provisionService: { getCurrentConfig: vi.fn(async () => ({ hostname: 'h', reverse_port: 8600, port_source: 'service' })), setConfig: vi.fn(), triggerReboot: vi.fn() } }))

describe('ProvisionView mqtt registration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows unknown state and no plaintext password', async () => {
    const wrapper = mount(ProvisionView, { global: { stubs: ['el-card','el-descriptions','el-descriptions-item','el-button','el-alert','el-form','el-form-item','el-input','el-input-number','el-space','el-dialog','el-tag','el-skeleton','el-progress','el-icon'] } })
    await flushPromises()
    expect(wrapper.text()).toContain('MQTT Gateway Registration')
    expect(wrapper.text()).toContain('Unknown')
  })

  it('calls actions with confirmation', async () => {
    mqttState.registrationState.value = { ...mqttState.registrationState.value, registered: true, passwordConfigured: true }
    const wrapper = mount(ProvisionView, { global: { stubs: ['el-card','el-descriptions','el-descriptions-item','el-button','el-alert','el-form','el-form-item','el-input','el-input-number','el-space','el-dialog','el-tag','el-skeleton','el-progress','el-icon'] } })
    await flushPromises()
    await (wrapper.vm as any).handleTestOrion()
    await (wrapper.vm as any).handleRegisterGateway()
    expect(testOrionConnection).toHaveBeenCalled()
    expect(confirm).toHaveBeenCalled()
    expect(registerGateway).toHaveBeenCalled()
  })
})
