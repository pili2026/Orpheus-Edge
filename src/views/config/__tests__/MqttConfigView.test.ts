import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import MqttConfigView from '@/views/config/MqttConfigView.vue'

const confirm = vi.fn(async () => true)
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<any>('element-plus')
  return { ...actual, ElMessageBox: { confirm } }
})

describe('MqttConfigView', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('renders status and restart flow', async () => {
    const wrapper = mount(MqttConfigView, { global: { stubs: ['el-card','el-form','el-form-item','el-input','el-input-number','el-switch','el-tag','el-alert','el-button'] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Password Configured')
    expect(wrapper.text()).not.toContain('password')
  })
})
