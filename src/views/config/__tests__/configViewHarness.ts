import { computed, defineComponent, h, inject, provide, type InjectionKey, type Ref } from 'vue'
import type { VueWrapper } from '@vue/test-utils'

// Shared Element Plus stubs for the three config views that use
// `useTalosRestart` (Modbus / System / Instance). Each view file registers
// Element Plus components globally, so in tests every tag has to be stubbed
// or Vue warns "Failed to resolve component". The stubs are deliberately
// minimal and render real DOM the tests can click on.

export const PassThroughStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => h('div', [slots.header?.(), slots.default?.(), slots.footer?.()])
  },
})

export const ElButtonStub = defineComponent({
  props: ['disabled', 'loading'],
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        'button',
        { disabled: props.disabled ? true : undefined, onClick: () => emit('click') },
        slots.default?.(),
      )
  },
})

// The restart banner. The close control emits `close`, which the views bind
// to `dismissAlert`.
export const ElAlertStub = defineComponent({
  props: ['title', 'type', 'closable'],
  emits: ['close'],
  setup(props, { emit, slots }) {
    return () =>
      h('div', { 'data-testid': 'alert' }, [
        h('button', { 'data-testid': 'alert-close', onClick: () => emit('close') }, 'x'),
        String(props.title ?? ''),
        slots.title?.(),
        slots.default?.(),
      ])
  },
})

// Renders its body only while open, and keeps the dismissability props so a
// test can assert the restarting dialog cannot be closed by the user.
export const ElDialogStub = defineComponent({
  props: ['modelValue', 'title', 'closeOnClickModal', 'closeOnPressEscape', 'showClose'],
  emits: ['update:modelValue'],
  setup(props, { slots }) {
    return () =>
      props.modelValue
        ? h('div', { 'data-testid': 'dialog', 'data-title': props.title }, [
            slots.default?.(),
            slots.footer?.(),
          ])
        : null
  },
})

const ROWS_KEY: InjectionKey<Ref<Array<Record<string, unknown>>>> = Symbol('rows')

// `el-table` / `el-table-column`: the table publishes its rows, each column
// renders its default slot once per row. That is enough for a test to reach
// the per-row action buttons.
export const ElTableStub = defineComponent({
  props: ['data'],
  setup(props, { slots }) {
    provide(
      ROWS_KEY,
      computed(() => (props.data ?? []) as Array<Record<string, unknown>>),
    )
    return () => h('div', { 'data-testid': 'table' }, slots.default?.())
  },
})

export const ElTableColumnStub = defineComponent({
  props: ['label', 'prop'],
  setup(props, { slots }) {
    const rows = inject(ROWS_KEY)
    return () =>
      h(
        'div',
        (rows?.value ?? []).map((row) =>
          h(
            'div',
            { class: 'cell' },
            slots.default ? slots.default({ row }) : String(row[props.prop] ?? ''),
          ),
        ),
      )
  },
})

// `el-popconfirm`: a button that fires `confirm`, next to the reference slot.
export const ElPopconfirmStub = defineComponent({
  props: ['title'],
  emits: ['confirm'],
  setup(_, { emit, slots }) {
    return () =>
      h('span', [
        slots.reference?.(),
        h('button', { 'data-testid': 'popconfirm-confirm', onClick: () => emit('confirm') }, 'ok'),
      ])
  },
})

// `el-upload`: a button that invokes `before-upload` with a stand-in file,
// which is how the views run their import handlers.
export const ElUploadStub = defineComponent({
  props: ['beforeUpload'],
  setup(props, { slots }) {
    return () =>
      h('span', [
        h(
          'button',
          {
            'data-testid': 'upload-trigger',
            onClick: () => props.beforeUpload?.(new File(['x'], 'config.yml')),
          },
          'upload',
        ),
        slots.default?.(),
      ])
  },
})

// `el-form`: the views call `formRef.value.validate(cb)` before saving.
export const ElFormStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots, expose }) {
    expose({
      validate: async (cb?: (valid: boolean) => void | Promise<void>) => {
        await cb?.(true)
        return true
      },
      validateField: async () => true,
      clearValidate: () => undefined,
      resetFields: () => undefined,
    })
    return () => h('form', slots.default?.())
  },
})

export const ElFormItemStub = defineComponent({
  props: ['label', 'prop'],
  setup(props, { slots }) {
    return () => h('div', [String(props.label ?? ''), slots.default?.()])
  },
})

// A real numeric input bound to `v-model`, so a test can dirty a form.
export const ElInputNumberStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue', 'change'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        type: 'number',
        value: props.modelValue,
        onInput: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value)
          emit('update:modelValue', v)
          emit('change', v)
        },
      })
  },
})

const TAB_SELECT_KEY: InjectionKey<(name: string) => void> = Symbol('selectTab')

// `el-tabs` / `el-tab-pane`: every pane renders; each pane also renders a
// button that switches the tabs' `v-model` so a test can change `activeTab`.
export const ElTabsStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue', 'tab-change'],
  setup(_, { emit, slots }) {
    provide(TAB_SELECT_KEY, (name: string) => {
      emit('update:modelValue', name)
      emit('tab-change', name)
    })
    return () => h('div', slots.default?.())
  },
})

export const ElTabPaneStub = defineComponent({
  props: ['name', 'label'],
  setup(props, { slots }) {
    const select = inject(TAB_SELECT_KEY, () => undefined)
    return () =>
      h('div', [
        h(
          'button',
          { 'data-testid': `tab-${props.name}`, onClick: () => select(String(props.name)) },
          String(props.label ?? props.name),
        ),
        slots.default?.(),
      ])
  },
})

export const ElLinkStub = defineComponent({
  emits: ['click'],
  setup(_, { emit, slots }) {
    return () => h('a', { onClick: () => emit('click') }, slots.default?.())
  },
})

export const STUBS = {
  'el-dialog': ElDialogStub,
  'el-alert': ElAlertStub,
  'el-button': ElButtonStub,
  'el-card': PassThroughStub,
  'el-tag': PassThroughStub,
  'el-tabs': ElTabsStub,
  'el-tab-pane': ElTabPaneStub,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-popconfirm': ElPopconfirmStub,
  'el-upload': ElUploadStub,
  'el-form': ElFormStub,
  'el-form-item': ElFormItemStub,
  'el-input': true,
  'el-input-number': ElInputNumberStub,
  'el-select': true,
  'el-option': true,
  'el-icon': true,
  'el-progress': true,
  'el-divider': PassThroughStub,
  'el-tooltip': PassThroughStub,
  'el-link': ElLinkStub,
  'el-empty': true,
}

export const DIRECTIVES = { loading: () => undefined }

// Child dialogs the views own. Stubbed by component name so a test can reach
// them with `findComponent` and emit the events the views listen for.
export const DeviceDialogStub = defineComponent({
  name: 'DeviceDialog',
  props: ['visible', 'device', 'isEdit'],
  emits: ['close', 'submit'],
  setup: () => () => null,
})

export const BackupDialogStub = defineComponent({
  name: 'BackupDialog',
  props: ['visible', 'configType', 'model'],
  emits: ['close', 'restored'],
  setup: () => () => null,
})

export const InverterConstraintDialogStub = defineComponent({
  name: 'InverterConstraintDialog',
  props: ['visible', 'row'],
  emits: ['update:visible', 'save'],
  setup: () => () => null,
})

export const PinConfigDialogStub = defineComponent({
  name: 'PinConfigDialog',
  props: ['visible', 'row', 'mode'],
  emits: ['update:visible', 'save'],
  setup: () => () => null,
})

export const PinMappingViewDialogStub = defineComponent({
  name: 'PinMappingViewDialog',
  props: ['visible', 'model'],
  emits: ['update:visible'],
  setup: () => () => null,
})

/** Find the button whose text is exactly `text`, failing loudly if absent. */
export const buttonByText = (wrapper: VueWrapper<unknown>, text: string) => {
  const btn = wrapper.findAll('button').find((b) => b.text() === text)
  if (!btn) throw new Error(`button "${text}" not found`)
  return btn
}
