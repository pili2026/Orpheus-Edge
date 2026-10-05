import { mount, flushPromises, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import AppNavMenu from '@/components/layout/AppNavMenu.vue'
import { useUIStore } from '@/stores/ui'
import en from '@/locales/en'

enableAutoUnmount(afterEach)

const Page = defineComponent({ template: '<div />' })

// The menu exactly as App.vue rendered it before it moved into AppNavMenu.
const GROUPS = [en.nav.monitoringGroup, en.nav.toolsGroup, en.nav.systemGroup, en.nav.configGroup]
const ITEMS: Array<[index: string, label: string]> = [
  ['/dashboard', en.nav.deviceMonitoring],
  ['/monitor', en.nav.singleDeviceMonitor],
  ['/parameter-tool', en.nav.parameterTesting],
  ['/debug/wifi', en.nav.wifiInfo],
  ['/provision', en.nav.provision],
  ['/config/system', en.nav.systemConfig],
  ['/config/modbus', en.nav.modbusConfig],
  ['/config/instance', en.nav.instanceConfig],
  ['/config/time_control', en.nav.timeControlConfig],
  ['/config/control', en.nav.controlConfig],
  ['/config/alert', en.nav.alertConfig],
]
const DISABLED = ['/config/time_control', '/config/control', '/config/alert']

const menuClasses = (w: VueWrapper) => w.get('ul.el-menu').classes()

beforeEach(() => {
  setActivePinia(createPinia())
  useUIStore().setLanguage('en')
})

async function mountMenu(collapsed: boolean, path = '/dashboard'): Promise<VueWrapper> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ITEMS.map(([index]) => ({ path: index, component: Page })),
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(AppNavMenu, {
    props: { collapsed },
    // Real transitions: a stubbed one would take the menu's root class instead of the <ul>.
    global: { plugins: [ElementPlus, router], stubs: { transition: false } },
  })
  await flushPromises()
  return wrapper
}

describe('AppNavMenu', () => {
  it('renders the same groups and items as before the move', async () => {
    const w = await mountMenu(false)

    expect(w.findAll('.menu-group-title').map((g) => g.text())).toEqual(GROUPS)
    const items = w.findAllComponents({ name: 'ElMenuItem' })
    expect(items.map((i) => [i.props('index'), i.text()])).toEqual(ITEMS)
    expect(
      w.findAll('.el-menu-item.disabled-item').length,
      'disabled items keep their lock styling',
    ).toBe(DISABLED.length)
    expect(w.find('.el-sub-menu .el-sub-menu__title').text()).toBe(en.nav.configuration)
  })

  it('opens the config submenu and shows the group titles when expanded', async () => {
    const w = await mountMenu(false)

    expect(menuClasses(w)).not.toContain('collapsed')
    expect(menuClasses(w)).not.toContain('el-menu--collapse')
    expect(w.find('.el-sub-menu').classes()).toContain('is-opened')
    for (const title of w.findAll('.menu-group-title')) expect(title.isVisible()).toBe(true)
  })

  it('follows the collapsed prop for its collapsed styling', async () => {
    const w = await mountMenu(true)

    expect(menuClasses(w)).toContain('collapsed')
    expect(menuClasses(w)).toContain('el-menu--collapse')
    for (const title of w.findAll('.menu-group-title')) expect(title.isVisible()).toBe(false)

    await w.setProps({ collapsed: false })
    // el-menu swaps its <ul> through an out-in transition when collapse changes.
    await vi.waitFor(() => expect(w.find('ul.el-menu').exists()).toBe(true))

    expect(menuClasses(w)).not.toContain('collapsed')
    expect(menuClasses(w)).not.toContain('el-menu--collapse')
  })

  it('highlights the current route', async () => {
    const w = await mountMenu(false, '/provision')

    expect(w.find('.el-menu-item.is-active').text()).toBe(en.nav.provision)
  })

  it('emits select with the item index when an item is chosen', async () => {
    const w = await mountMenu(false)

    await w.findAll('.el-menu-item')[4]!.trigger('click')

    expect(w.emitted('select')?.[0]).toEqual(['/provision'])
  })
})
