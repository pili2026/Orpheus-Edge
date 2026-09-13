import { enableAutoUnmount, mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import MqttConfigView from '@/views/config/MqttConfigView.vue'

const { confirm, elMessage } = vi.hoisted(() => ({
  confirm: vi.fn(async () => true),
  elMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))
const loadStatus = vi.fn(async () => undefined)
const saveConfig = vi.fn(async () => undefined)
// the save-time re-read answers with whatever is loaded unless a test says otherwise
const readConfig = vi.fn(async () => storeState.config.value)
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
  restartCompletion: ref<{ at: number } | null>(null),
}

// storeToRefs is identity here because the store doubles below are already
// plain objects of refs; the rest of pinia is kept real so that modules pulled
// in by the shared restart components (which call defineStore) still load.
vi.mock('pinia', async () => {
  const actual = await vi.importActual<any>('pinia')
  return { ...actual, storeToRefs: (s: any) => s }
})
vi.mock('@/stores/restart', () => ({ useRestartStore: () => restartStore }))
// `t` is a ref, as the real composable returns: the script reads `t.value`.
vi.mock('@/composables/useI18n', async () => {
  const { ref } = await import('vue')
  return {
  useI18n: () => ({
    t: ref({
        common: {
          changedWhileEditing: 'The stored configuration changed while you were editing.',
          saveRefusedStoredChanged: 'Not saved: {fields} changed on the device.',
          saveRefusedCheckFailed: 'Not saved: the stored configuration could not be re-read.',
        },
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
    }),
  }),
  }
})
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useRoute: () => route,
}))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<any>('element-plus')
  return { ...actual, ElMessageBox: { confirm }, ElMessage: elMessage }
})
const mqttStoreDouble = { ...storeState, loadConfig, loadStatus, saveConfig, readConfig }
vi.mock('@/stores/mqtt', () => ({ useMqttStore: () => mqttStoreDouble }))

// Every test mounts a fresh view against the same module-level restart-store
// double. Without unmounting, earlier instances keep watching it and answer a
// later test's completion event first, consuming that test's one-shot mocks.
enableAutoUnmount(afterEach)

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
    restartStore.restartCompletion.value = null
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

    restartStore.restartCompletion.value = { at: Date.now() }
    await flushPromises()

    expect(loadConfig).toHaveBeenCalled()
    // no pending-state mutation reaches the shared store from this view
    expect(Object.keys(restartStore)).toEqual(['restartCompletion'])
  })

  it('a completed restart with unsaved edits keeps them and moves only the baseline', async () => {
    const wrapper = mountView()
    await flushPromises()
    ;(wrapper.vm as any).draft.enabled = false
    await flushPromises()
    expect(wrapper.get('[data-testid="save-btn"]').attributes('disabled')).toBeUndefined()

    // the stored config changes underneath: host differs, enabled still true
    loadConfig.mockImplementationOnce(async () => {
      storeState.config.value = { ...storeState.config.value, broker: { ...storeState.config.value.broker, host: 'other' } }
    })
    restartStore.restartCompletion.value = { at: Date.now() }
    await flushPromises()

    expect((wrapper.vm as any).draft.enabled).toBe(false)
    expect((wrapper.vm as any).draft.broker.host).toBe('host')
    expect(elMessage.warning).toHaveBeenCalledWith('The stored configuration changed while you were editing.')
    // still dirty against the new baseline, so Save stays available
    expect(wrapper.get('[data-testid="save-btn"]').attributes('disabled')).toBeUndefined()
  })

  it('a completed restart with unsaved edits and an unchanged store says nothing', async () => {
    const wrapper = mountView()
    await flushPromises()
    ;(wrapper.vm as any).draft.enabled = false

    restartStore.restartCompletion.value = { at: Date.now() }
    await flushPromises()

    expect((wrapper.vm as any).draft.enabled).toBe(false)
    expect(elMessage.warning).not.toHaveBeenCalled()
  })

  it('a failed refetch with unsaved edits does not discard the draft', async () => {
    const wrapper = mountView()
    await flushPromises()
    ;(wrapper.vm as any).draft.enabled = false
    loadConfig.mockRejectedValueOnce(new Error('boom'))

    restartStore.restartCompletion.value = { at: Date.now() }
    await flushPromises()

    expect((wrapper.vm as any).draft).not.toBeNull()
    expect((wrapper.vm as any).draft.enabled).toBe(false)
  })

  describe('save against the stored configuration', () => {
    const saveButton = (wrapper: ReturnType<typeof mountView>) => wrapper.get('[data-testid="save-btn"]')
    const refreshButton = (wrapper: ReturnType<typeof mountView>) =>
      wrapper.findAll('button').find((b) => b.text() === 'Refresh')!

    const mountEdited = async () => {
      const wrapper = mountView()
      await flushPromises()
      ;(wrapper.vm as any).draft.enabled = false
      await flushPromises()
      return wrapper
    }

    it('an unchanged store saves and re-baselines', async () => {
      const wrapper = await mountEdited()

      await saveButton(wrapper).trigger('click')
      await flushPromises()

      expect(readConfig).toHaveBeenCalledTimes(1)
      expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
      expect(readConfig.mock.invocationCallOrder[0]!).toBeLessThan(saveConfig.mock.invocationCallOrder[0]!)
      expect(elMessage.error).not.toHaveBeenCalled()
      expect((wrapper.vm as any).isDirty).toBe(false)
    })

    it('refuses when the store changed a field the user did not touch, and names it', async () => {
      const wrapper = await mountEdited()
      readConfig.mockResolvedValueOnce({
        ...storeState.config.value,
        broker: { ...storeState.config.value.broker, host: 'other' },
      })

      await saveButton(wrapper).trigger('click')
      await flushPromises()

      expect(saveConfig).not.toHaveBeenCalled()
      expect(elMessage.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Not saved: Broker Host changed on the device.' }),
      )
      // the edits survive the refusal and Save stays available
      expect((wrapper.vm as any).draft.enabled).toBe(false)
      expect(saveButton(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('refuses when the store changed the very field the user edited', async () => {
      const wrapper = await mountEdited()
      // the server now holds the same value the user typed; the baseline still
      // says true, so the store moved and the save is refused all the same
      readConfig.mockResolvedValueOnce({ ...storeState.config.value, enabled: false })

      await saveButton(wrapper).trigger('click')
      await flushPromises()

      expect(saveConfig).not.toHaveBeenCalled()
      expect(elMessage.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Not saved: MQTT Enabled changed on the device.' }),
      )
      expect((wrapper.vm as any).draft.enabled).toBe(false)
    })

    it('refuses when the stored configuration cannot be re-read', async () => {
      const wrapper = await mountEdited()
      readConfig.mockRejectedValueOnce(new Error('boom'))

      await saveButton(wrapper).trigger('click')
      await flushPromises()

      expect(saveConfig).not.toHaveBeenCalled()
      expect(elMessage.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Not saved: the stored configuration could not be re-read.' }),
      )
      expect((wrapper.vm as any).draft.enabled).toBe(false)
    })

    it('a retry after refreshing saves against the moved baseline', async () => {
      const wrapper = await mountEdited()
      const changed = () => ({
        ...storeState.config.value,
        broker: { ...storeState.config.value.broker, host: 'other' },
      })
      readConfig.mockResolvedValueOnce(changed())
      await saveButton(wrapper).trigger('click')
      await flushPromises()
      expect(saveConfig).not.toHaveBeenCalled()

      // Refresh keeps the edits and moves the baseline to the changed store
      loadConfig.mockImplementationOnce(async () => {
        storeState.config.value = changed()
      })
      await refreshButton(wrapper).trigger('click')
      await flushPromises()
      expect(elMessage.warning).toHaveBeenCalledWith('The stored configuration changed while you were editing.')
      expect((wrapper.vm as any).draft.enabled).toBe(false)

      await saveButton(wrapper).trigger('click')
      await flushPromises()

      expect(saveConfig).toHaveBeenCalledTimes(1)
      // What the save sends is unchanged by the check: the draft as it stands,
      // whose untouched broker.host still holds the value loaded before the
      // change. Telling an untouched field from an edited one is per-field
      // tracking, which this commit deliberately does not add.
      expect(saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false, broker: expect.objectContaining({ host: 'host' }) }),
      )
    })
  })

  describe('edits made while the request is in flight', () => {
    const refreshButton = (wrapper: ReturnType<typeof mountView>) =>
      wrapper.findAll('button').find((b) => b.text() === 'Refresh')!

    /** The next loadConfig settles only when the test says so. */
    const deferLoad = () => {
      let settle!: { resolve: () => void; reject: (err: Error) => void }
      loadConfig.mockImplementationOnce(
        () =>
          new Promise<void>((resolve, reject) => {
            settle = { resolve, reject }
          }),
      )
      return {
        resolve: () => settle.resolve(),
        reject: (err: Error) => settle.reject(err),
      }
    }
    const changeStore = () => {
      storeState.config.value = {
        ...storeState.config.value,
        broker: { ...storeState.config.value.broker, host: 'other' },
      }
    }

    it('keeps them when the store is unchanged, and says nothing', async () => {
      const wrapper = mountView()
      await flushPromises()
      const load = deferLoad()
      await refreshButton(wrapper).trigger('click')
      ;(wrapper.vm as any).draft.enabled = false

      load.resolve()
      await flushPromises()

      expect((wrapper.vm as any).draft.enabled).toBe(false)
      expect((wrapper.vm as any).isDirty).toBe(true)
      expect(elMessage.warning).not.toHaveBeenCalled()
    })

    it('keeps them when the store changed, and says so', async () => {
      const wrapper = mountView()
      await flushPromises()
      const load = deferLoad()
      await refreshButton(wrapper).trigger('click')
      ;(wrapper.vm as any).draft.enabled = false

      changeStore()
      load.resolve()
      await flushPromises()

      expect((wrapper.vm as any).draft.enabled).toBe(false)
      expect((wrapper.vm as any).draft.broker.host).toBe('host')
      expect((wrapper.vm as any).isDirty).toBe(true)
      expect(elMessage.warning).toHaveBeenCalledWith('The stored configuration changed while you were editing.')
    })

    it('reseeds a draft left clean throughout', async () => {
      const wrapper = mountView()
      await flushPromises()
      const load = deferLoad()
      await refreshButton(wrapper).trigger('click')

      changeStore()
      load.resolve()
      await flushPromises()

      expect((wrapper.vm as any).draft.broker.host).toBe('other')
      expect((wrapper.vm as any).isDirty).toBe(false)
      expect(elMessage.warning).not.toHaveBeenCalled()
    })

    it('leaves an edited draft untouched when the request fails', async () => {
      const wrapper = mountView()
      await flushPromises()
      const load = deferLoad()
      await refreshButton(wrapper).trigger('click')
      ;(wrapper.vm as any).draft.enabled = false

      load.reject(new Error('boom'))
      await flushPromises()

      expect((wrapper.vm as any).draft).not.toBeNull()
      expect((wrapper.vm as any).draft.enabled).toBe(false)
      expect(elMessage.warning).not.toHaveBeenCalled()
    })
  })
})
