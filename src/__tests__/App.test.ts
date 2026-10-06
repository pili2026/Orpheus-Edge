import { mount, flushPromises, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import ElementPlus, { ElAside, ElDrawer } from 'element-plus'
import App from '@/App.vue'
import AppNavMenu from '@/components/layout/AppNavMenu.vue'
import { useUIStore } from '@/stores/ui'
import { useWebSocketStore } from '@/stores/websocket'
import { installMatchMedia, type MatchMediaStub } from '@/test-utils/matchMedia'
import en from '@/locales/en'
import zhTW from '@/locales/zh-TW'

// ==================== Shell per breakpoint tier ====================
//
// The shell runs over the real breakpoint singleton, driven by the matchMedia stub.
// Routes render placeholders, the Wi-Fi selector is a stub (it talks to the network),
// and the WebSocket store's connect/disconnect are spies so no socket is opened.

enableAutoUnmount(afterEach)

const Page = defineComponent({ template: '<div class="page" />' })
const WiFiSelectorStub = defineComponent({
  name: 'WiFiSelector',
  template: '<button class="wifi-stub" />',
})

const XS = 390
const SM = 820
const MD = 1000
const LG = 1366

let media: MatchMediaStub
let router: Router

beforeAll(() => {
  media = installMatchMedia(LG)
})

afterAll(() => {
  media.uninstall()
})

beforeEach(() => {
  setActivePinia(createPinia())
  useUIStore().setLanguage('en')
  const ws = useWebSocketStore()
  vi.spyOn(ws, 'connect').mockImplementation(() => {})
  vi.spyOn(ws, 'disconnect').mockImplementation(() => {})
})

async function mountAt(
  width: number,
  path = '/provision',
  attachTo?: HTMLElement,
): Promise<VueWrapper> {
  media.setWidth(width)
  router = createRouter({
    history: createMemoryHistory(),
    routes: ['/dashboard', '/provision', '/debug/wifi', '/config/system'].map((p) => ({
      path: p,
      component: Page,
    })),
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    attachTo,
    global: {
      plugins: [ElementPlus, router],
      // Real transitions: a stubbed one would take el-tag's class and attributes, not the tag.
      stubs: { WiFiSelector: WiFiSelectorStub, transition: false },
    },
  })
  await flushPromises()
  return wrapper
}

async function resize(width: number) {
  media.setWidth(width)
  await flushPromises()
}

const connectionTag = (w: VueWrapper) => w.find('.el-tag.connection-status')
const drawerOpen = (w: VueWrapper) => w.findComponent(ElDrawer).props('modelValue') as boolean
const aside = (w: VueWrapper) => w.find('.app-sidebar')
const asideWidth = (w: VueWrapper) => w.findComponent(ElAside).props('width')

/**
 * The dialog's accessible name from aria-labelledby or aria-label. aria-labelledby wins
 * when present, so every id it lists must resolve to an element with text: a dangling
 * reference fails here rather than silently falling back to aria-label.
 */
function accessibleName(dialog: Element): string {
  const labelledBy = dialog.getAttribute('aria-labelledby')
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => {
        const label = document.getElementById(id)
        expect(label, `aria-labelledby points at #${id}, which does not exist`).not.toBeNull()
        return label!.textContent!.trim()
      })
      .join(' ')
      .trim()
  }
  return dialog.getAttribute('aria-label')?.trim() ?? ''
}

async function openDrawer(w: VueWrapper) {
  await w.find('.nav-drawer-toggle').trigger('click')
  await flushPromises()
  expect(drawerOpen(w)).toBe(true)
}

describe('App shell at xs', () => {
  it('renders no aside, only the drawer, closed', async () => {
    const w = await mountAt(XS)

    expect(w.find('.el-aside').exists()).toBe(false)
    expect(w.findComponent(ElAside).exists()).toBe(false)
    expect(w.findComponent(ElDrawer).exists()).toBe(true)
    expect(drawerOpen(w)).toBe(false)
  })

  it('opens the drawer from the header hamburger, with the expanded menu and LanguageSwitcher', async () => {
    const w = await mountAt(XS)
    const toggle = w.find('.app-header .nav-drawer-toggle')
    expect(toggle.attributes('aria-label')).toBe(en.nav.expandMenu)

    await openDrawer(w)

    const menu = w.findComponent(ElDrawer).findComponent(AppNavMenu)
    expect(menu.exists()).toBe(true)
    expect(menu.props('collapsed')).toBe(false)
    expect(w.find('.app-nav-drawer .el-drawer__footer .language-switcher').exists()).toBe(true)
  })

  it.each([
    ['en', en],
    ['zh-TW', zhTW],
  ] as const)(
    'names the open drawer dialog as the navigation menu (%s)',
    async (lang, messages) => {
      useUIStore().setLanguage(lang)
      const host = document.body.appendChild(document.createElement('div'))
      const w = await mountAt(XS, '/provision', host)
      await openDrawer(w)

      const dialogs = document.querySelectorAll('[role="dialog"]')
      expect(dialogs).toHaveLength(1)
      const name = accessibleName(dialogs[0]!)

      expect(name).not.toBe('')
      expect(name).toBe(messages.nav.navigationMenu)
      host.remove()
    },
  )

  it('closes the drawer on a route change', async () => {
    const w = await mountAt(XS)
    await openDrawer(w)

    await router.push('/debug/wifi')
    await flushPromises()

    expect(drawerOpen(w)).toBe(false)
  })

  it('closes the drawer when the menu emits select', async () => {
    const w = await mountAt(XS)
    await openDrawer(w)

    w.findComponent(ElDrawer).findComponent(AppNavMenu).vm.$emit('select', '/provision')
    await flushPromises()

    expect(drawerOpen(w)).toBe(false)
  })

  it('closes the drawer when leaving xs, and keeps it closed on return', async () => {
    const w = await mountAt(XS)
    await openDrawer(w)

    await resize(SM)
    expect(w.findComponent(ElDrawer).exists()).toBe(false)
    expect(aside(w).exists()).toBe(true)

    await resize(XS)
    expect(aside(w).exists()).toBe(false)
    expect(drawerOpen(w)).toBe(false)
  })

  it('keeps WiFiSelector in the header and moves LanguageSwitcher out of it', async () => {
    const w = await mountAt(XS)

    expect(w.find('.app-header .wifi-stub').exists()).toBe(true)
    expect(w.find('.app-header .language-switcher').exists()).toBe(false)
  })

  it('shows the connection status icon-only, with the text as title and aria-label', async () => {
    const w = await mountAt(XS, '/dashboard')
    let tag = connectionTag(w)

    expect(tag.classes()).toContain('el-tag--danger')
    expect(tag.attributes('title')).toBe(en.nav.disconnected)
    expect(tag.attributes('aria-label')).toBe(en.nav.disconnected)
    expect(tag.attributes('role')).toBe('img')
    expect(tag.text()).toBe('')

    useWebSocketStore().isConnected = true
    await flushPromises()
    tag = connectionTag(w)

    expect(tag.classes()).toContain('el-tag--success')
    expect(tag.attributes('title')).toBe(en.nav.connected)
    expect(tag.attributes('aria-label')).toBe(en.nav.connected)
    expect(tag.attributes('role')).toBe('img')
  })
})

describe('App shell at sm/md', () => {
  it.each([
    ['sm', SM],
    ['md', MD],
  ])('defaults to the 64px rail at %s', async (_tier, width) => {
    const w = await mountAt(width)

    expect(aside(w).classes()).toContain('collapsed')
    expect(asideWidth(w)).toBe('64px')
    expect(w.findComponent(ElAside).findComponent(AppNavMenu).props('collapsed')).toBe(true)
    expect(w.find('.nav-drawer-toggle').exists()).toBe(false)
  })

  it('expands from the rail with the manual toggle', async () => {
    const w = await mountAt(SM)

    await w.find('.toggle-btn').trigger('click')

    expect(aside(w).classes()).not.toContain('collapsed')
    expect(asideWidth(w)).toBe('220px')
  })

  it('clears the manual override on a tier change', async () => {
    const w = await mountAt(SM)
    await w.find('.toggle-btn').trigger('click')
    expect(asideWidth(w)).toBe('220px')

    await resize(MD)

    expect(asideWidth(w)).toBe('64px')
  })

  it('keeps the header text and LanguageSwitcher as before', async () => {
    const w = await mountAt(SM, '/dashboard')
    const tag = connectionTag(w)

    expect(tag.text()).toBe(en.nav.disconnected)
    expect(tag.attributes('title')).toBeUndefined()
    expect(tag.attributes('aria-label')).toBeUndefined()
    expect(w.find('.app-header .language-switcher').exists()).toBe(true)
  })
})

describe('App shell at lg', () => {
  it('renders the expanded 220px sidebar', async () => {
    const w = await mountAt(LG)

    expect(aside(w).exists()).toBe(true)
    expect(aside(w).classes()).not.toContain('collapsed')
    expect(asideWidth(w)).toBe('220px')
    expect(w.findComponent(ElDrawer).exists()).toBe(false)
  })

  it('still collapses with the manual toggle, and a tier change resets it', async () => {
    const w = await mountAt(LG)

    await w.find('.toggle-btn').trigger('click')
    expect(asideWidth(w)).toBe('64px')

    await resize(MD)
    await resize(LG)

    expect(asideWidth(w)).toBe('220px')
  })
})
