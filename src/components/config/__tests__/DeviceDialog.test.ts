import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import DeviceDialog from '@/components/config/DeviceDialog.vue'
import type { ModbusDevice } from '@/stores/modbus_config'
import en from '@/locales/en'

// ==================== Modes payload ====================
//
// The Talos device endpoint merges only the fields the client supplies, so a
// submission that omits `modes` leaves the stored modes untouched. Clearing the
// last mode therefore has to send an explicit `{}`. These tests pin the shape
// of the emitted payload rather than what the store does with it.

const { messageError, axiosGet } = vi.hoisted(() => ({
  messageError: vi.fn(),
  axiosGet: vi.fn(async () => ({ data: { drivers: [] } })),
}))

const storeState = {
  busList: [{ name: 'bus1', port: '/dev/ttyUSB0', baudrate: 9600, timeout: 1 }],
  devices: [] as ModbusDevice[],
  getDeviceDisplayName: (device: ModbusDevice) => device.model,
}

vi.mock('pinia', () => ({ storeToRefs: (s: any) => s }))
vi.mock('@/stores/ui', () => ({ useUIStore: () => ({ t: ref(en) }) }))
vi.mock('@/stores/modbus_config', () => ({ useConfigStore: () => storeState }))
vi.mock('axios', () => ({ default: { get: axiosGet } }))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<any>('element-plus')
  return {
    ...actual,
    ElMessage: { error: messageError, success: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

const PassThroughStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => h('div', [slots.header?.(), slots.default?.(), slots.footer?.()])
  },
})
// The component calls `formRef.value.validate()` before building the payload,
// so the form stub has to expose a resolving `validate`.
const ElFormStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots, expose }) {
    expose({ validate: async () => true, resetFields: () => undefined })
    return () => h('form', slots.default?.())
  },
})
const ElFormItemStub = defineComponent({
  props: ['label'],
  setup(props, { slots }) {
    return () => h('div', [String(props.label ?? ''), slots.default?.()])
  },
})
const ElButtonStub = defineComponent({
  props: ['disabled'],
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () =>
      h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.())
  },
})
// A real `<input>` / `<textarea>` bound to `v-model`, so a test can drive the
// modes fields the way a user does. The placeholder is forwarded so the three
// modes inputs can be told apart from the read-only auto-filled ones.
const ElInputStub = defineComponent({
  props: ['modelValue', 'type', 'placeholder'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(props.type === 'textarea' ? 'textarea' : 'input', {
        value: props.modelValue,
        placeholder: props.placeholder,
        onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
      })
  },
})

const STUBS = {
  'el-dialog': PassThroughStub,
  'el-form': ElFormStub,
  'el-form-item': ElFormItemStub,
  'el-select': true,
  'el-option': true,
  'el-divider': PassThroughStub,
  'el-input': ElInputStub,
  'el-input-number': true,
  'el-tag': PassThroughStub,
  'el-icon': true,
  'el-alert': true,
  'el-button': ElButtonStub,
  'el-collapse-transition': PassThroughStub,
}

const baseDevice = (modes: Record<string, unknown>): ModbusDevice => ({
  model: 'SDM120',
  type: 'power_meter',
  model_file: 'sdm120.yaml',
  slave_id: 3,
  bus: 'bus1',
  modes,
})

const mountDialog = (device: ModbusDevice) =>
  mount(DeviceDialog, {
    props: { visible: true, isEdit: true, device },
    global: { stubs: STUBS },
  })

type Wrapper = ReturnType<typeof mountDialog>

// Matched in JS rather than by attribute selector: the custom-fields
// placeholder is itself a JSON snippet with double quotes in it.
const modesInput = (wrapper: Wrapper, placeholder: string) => {
  const input = wrapper
    .findAll('input, textarea')
    .find((el) => el.attributes('placeholder') === placeholder)
  expect(input, `modes input with placeholder "${placeholder}" not found`).toBeTruthy()
  return input!
}
const nameInput = (wrapper: Wrapper) => modesInput(wrapper, en.config.device.modes.namePlaceholder)
const purposeInput = (wrapper: Wrapper) =>
  modesInput(wrapper, en.config.device.modes.purposePlaceholder)
const customInput = (wrapper: Wrapper) =>
  modesInput(wrapper, en.config.device.modes.customPlaceholder)

const submit = async (wrapper: Wrapper) => {
  const save = wrapper.findAll('button').find((b) => b.text() === en.config.common.save)
  expect(save, 'save button not found').toBeTruthy()
  expect(save!.attributes('disabled'), 'save button is disabled').toBeUndefined()
  await save!.trigger('click')
  await flushPromises()
}

/** The one payload the dialog emitted, failing if it emitted none or several. */
const submittedPayload = (wrapper: Wrapper): ModbusDevice => {
  const emitted = wrapper.emitted('submit') ?? []
  expect(emitted, 'expected exactly one submit event').toHaveLength(1)
  return emitted[0]![0] as ModbusDevice
}

describe('DeviceDialog modes payload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submitting with every mode cleared emits modes as an explicit empty object', async () => {
    const wrapper = mountDialog(baseDevice({ name: 'Stirring Motor', purpose: 'mixer' }))
    await flushPromises()

    await nameInput(wrapper).setValue('')
    await flushPromises()
    await purposeInput(wrapper).setValue('')
    await flushPromises()

    await submit(wrapper)

    const payload = submittedPayload(wrapper)
    // The key has to be present: an absent `modes` is what the endpoint reads
    // as "leave the stored modes alone".
    expect(Object.prototype.hasOwnProperty.call(payload, 'modes')).toBe(true)
    expect(payload.modes).toEqual({})
  })

  it('submitting with one mode set emits that object', async () => {
    const wrapper = mountDialog(baseDevice({}))
    await flushPromises()

    await nameInput(wrapper).setValue('Stirring Motor')
    await flushPromises()

    await submit(wrapper)

    expect(submittedPayload(wrapper).modes).toEqual({ name: 'Stirring Motor' })
  })

  it('submitting with modes untouched emits the existing object unchanged', async () => {
    const modes = { name: 'Stirring Motor', purpose: 'mixer', max_rpm: 3600, tank_id: 'tank_01' }
    const wrapper = mountDialog(baseDevice(modes))
    await flushPromises()

    await submit(wrapper)

    const payload = submittedPayload(wrapper)
    expect(payload.modes).toEqual(modes)
    expect(payload).toMatchObject({
      model: 'SDM120',
      type: 'power_meter',
      model_file: 'sdm120.yaml',
      slave_id: 3,
      bus: 'bus1',
    })
  })

  it('invalid custom-fields JSON aborts with the error toast and emits nothing', async () => {
    const wrapper = mountDialog(baseDevice({ name: 'Stirring Motor' }))
    await flushPromises()

    await customInput(wrapper).setValue('{"max_rpm": ')
    await flushPromises()

    await submit(wrapper)

    expect(messageError).toHaveBeenCalledWith(en.config.device.modes.invalidJson)
    expect(wrapper.emitted('submit')).toBeUndefined()
  })
})
