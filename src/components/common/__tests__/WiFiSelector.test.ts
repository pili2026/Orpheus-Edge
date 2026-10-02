import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

// The selector runs over the real store and Wi-Fi client with only the shared
// HTTP instance replaced; no interface is reported, so it asks for nothing more.
vi.mock('@/services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import api from '@/services/api'
import WiFiSelector from '@/components/common/WiFiSelector.vue'
import { useUIStore } from '@/stores/ui'
import en from '@/locales/en'

const getMock = vi.mocked(api.get)

// The dropdown's menu renders only once opened, through a popper; what this
// suite checks is the header control inside it, so the menu renders in place.
const passThrough = { template: '<div><slot /><slot name="dropdown" /></div>' }

const mountSelector = () =>
  mount(WiFiSelector, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDropdown: passThrough,
        ElDropdownMenu: passThrough,
        ElDropdownItem: passThrough,
        ElDropdownDivider: true,
      },
    },
  })

/** The header's icon-only refresh control: the one button that carries a tooltip title. */
const refreshTitle = (w: ReturnType<typeof mountSelector>) => {
  const button = w.find('.dropdown-header button[title]')
  expect(button.exists(), 'no refresh control in the header').toBe(true)
  return button.attributes('title')
}

describe('WiFiSelector: the header refresh control', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMock.mockReset()
    getMock.mockResolvedValue({ data: { interfaces: [], total_count: 0 } } as never)
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
  })

  it('says it refreshes the status', async () => {
    const w = mountSelector()
    await flushPromises()
    expect(refreshTitle(w)).toBe(en.wifi.refreshStatus)
    expect(refreshTitle(w)).toBe('Refresh status')
  })

  it('says so in the active locale', async () => {
    useUIStore().setLanguage('zh-TW')
    const w = mountSelector()
    await flushPromises()
    expect(refreshTitle(w)).toBe('重新整理狀態')
  })
})
