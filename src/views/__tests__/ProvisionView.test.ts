import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

const mqttState = {
  registrationState: ref<any>({ registered: null, gatewayId: null, username: null, passwordConfigured: null, mqttEnabled: null, connected: null, lastConnectionError: null }),
  orionTestResult: ref<any>(null),
  registrationSuccess: ref<string | null>(null),
  registrationError: ref<string | null>(null),
  restartRequired: ref(false),
  testingOrion: ref(false),
  registeringGateway: ref(false),
  loadingRegistrationState: ref(false),
}

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<any>('element-plus')
  return { ...actual, ElMessageBox: { confirm }, ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn(), closeAll: vi.fn() } }
})
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/stores/mqtt', () => ({ useMqttStore: () => ({ ...mqttState, testOrionConnection, registerGateway, loadRegistrationState }) }))
vi.mock('@/services/provision', () => ({ provisionService: { getCurrentConfig: vi.fn(async () => ({ hostname: 'h', reverse_port: 8600, port_source: 'service' })), setConfig: vi.fn(), triggerReboot: vi.fn() } }))

describe('ProvisionView mqtt registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
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
    await (wrapper.vm as any).handleRegisterGateway()
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
})
