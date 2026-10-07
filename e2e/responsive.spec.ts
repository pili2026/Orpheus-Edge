/// <reference lib="dom" />
import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { LONG_SSID, STATUS_ERROR_DETAIL, serveWifi } from './fixtures/wifi'

// ==================== Responsive shell, every route, every viewport ====================
//
// Runs without a Talos backend: every /api request answers 503 and every /api WebSocket
// is closed, so each page renders its error/empty state the same way on every run.
// The shell (header, sidebar, drawer) must always fit the viewport. Page content that
// still overflows is listed in CONTENT_OVERFLOW_SKIPS with the ticket that fixes it.

const ROUTES = [
  '/',
  '/dashboard',
  '/device/TECO_VFD_2',
  '/monitor',
  '/parameter-tool',
  '/config',
  '/config/system',
  '/config/modbus',
  '/config/instance',
  '/config/alert',
  '/config/control',
  '/config/mqtt',
  '/debug/wifi',
  '/provision',
]

/**
 * Assertion (c) skips: project name -> route -> the ticket whose page work removes it.
 * Only page content belongs here, never the shell. A listed route that no longer
 * overflows fails the run, so fixed pages must leave this list.
 */
const CONTENT_OVERFLOW_SKIPS: Record<string, Record<string, string>> = {
  'phone-390x844': {
    // Redirects to /dashboard, so it carries the same overflow.
    '/': 'T3: DashboardView summary row (Auto/List/Grid segmented control)',
    '/dashboard': 'T3: DashboardView summary row (Auto/List/Grid segmented control)',
    '/config/system': 'T4: SystemConfigView export/import/backup button row',
    '/debug/wifi': 'T2: DebugNetworkPage toolbar (refresh button, auto-refresh switch)',
  },
}

test('covers every path declared in src/router/index.ts', () => {
  const source = readFileSync(new URL('../src/router/index.ts', import.meta.url), 'utf8')
  const declared = [...source.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]!)
  expect(declared.length).toBeGreaterThan(0)

  const covered = (path: string) =>
    ROUTES.some((route) => {
      // Child paths are relative to their parent; dynamic segments match one segment.
      const pattern = (path.startsWith('/') ? path : `/${path}`).replace(/:[^/]+/g, '[^/]+')
      const regex = path.startsWith('/') ? `^${pattern}$` : `^/[^/]+${pattern}$`
      return new RegExp(regex).test(route)
    })
  expect(declared.filter((path) => !covered(path))).toEqual([])
})

async function stubBackend(page: Page) {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  )
  await page.routeWebSocket(/\/api\//, (ws) => ws.close())
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.app-content')).toBeVisible()
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}

/**
 * Shell elements (and their visible descendants) that stick out of the viewport, on
 * either axis. A selector that matches nothing is itself a problem: (b) never passes by
 * absence. Vertically, content inside a scroll container (overflow-y auto/scroll, e.g.
 * the 220px sidebar's menu at 768px tall) is reachable by scrolling, so it is bounded
 * by that container, which is itself measured; hidden or clipped overflow gets no pass.
 */
function shellOverflow(page: Page, selectors: string[]) {
  return page.evaluate((selectors) => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const problems: string[] = []
    const label = (el: Element) =>
      el.tagName.toLowerCase() +
      (typeof el.className === 'string' && el.className ? `.${el.className.split(' ')[0]}` : '')
    for (const selector of selectors) {
      const root = document.querySelector(selector)
      if (!root) {
        problems.push(`${selector} is missing`)
      } else {
        if (root.scrollWidth > root.clientWidth) {
          problems.push(`${selector} scrolls sideways (${root.scrollWidth} > ${root.clientWidth})`)
        }
        // The root is always measured; descendants only when they render a box.
        const rendered = [...root.querySelectorAll('*')].filter((el) => {
          const box = el.getBoundingClientRect()
          return box.width > 0 && box.height > 0
        })
        const insideScroller = (el: Element) => {
          for (let a = el.parentElement; a && root.contains(a); a = a.parentElement) {
            if (['auto', 'scroll'].includes(getComputedStyle(a).overflowY)) return true
          }
          return false
        }
        for (const el of [root, ...rendered]) {
          const box = el.getBoundingClientRect()
          if (box.left < -0.5 || box.right > vw + 0.5) {
            problems.push(`${selector} ${label(el)} spans x ${box.left}..${box.right} of ${vw}`)
          }
          if ((box.top < -0.5 || box.bottom > vh + 0.5) && !insideScroller(el)) {
            problems.push(`${selector} ${label(el)} spans y ${box.top}..${box.bottom} of ${vh}`)
          }
        }
      }
    }
    return problems
  }, selectors)
}

for (const path of ROUTES) {
  test(`fits the viewport: ${path}`, async ({ page }, testInfo) => {
    await stubBackend(page)
    await page.goto(path)
    await settle(page)
    const { width, height } = page.viewportSize()!

    // (a) The document never scrolls sideways.
    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect.soft(doc.scrollWidth, '(a) document scrollWidth').toBeLessThanOrEqual(doc.innerWidth)

    // (b) The shell fits. Never skippable: each tier's shell parts must be present, and
    // a missing one fails rather than being skipped.
    const header = page.locator('.app-header')
    const sidebar = page.locator('.app-sidebar')
    const toggle = page.locator('.nav-drawer-toggle')
    const drawer = page.locator('.app-nav-drawer')
    await expect(header, '(b) header is shown').toBeVisible()
    if (width >= 768) {
      await expect(sidebar, '(b) sidebar is shown at >= 768px').toBeVisible()
      await expect(toggle, '(b) no hamburger at >= 768px').toHaveCount(0)
      expect
        .soft(await shellOverflow(page, ['.app-header', '.app-sidebar']), '(b) shell')
        .toEqual([])
    } else {
      await expect(sidebar, '(b) no sidebar below 768px').toHaveCount(0)
      await expect(toggle, '(b) hamburger is shown below 768px').toBeVisible()
      expect.soft(await shellOverflow(page, ['.app-header']), '(b) shell').toEqual([])

      await toggle.click()
      await expect(drawer, '(b) the hamburger opens the drawer').toBeVisible()
      await expect(drawer).toBeInViewport({ ratio: 1 })
      expect.soft(await shellOverflow(page, ['.app-nav-drawer']), '(b) drawer').toEqual([])
      await page.keyboard.press('Escape')
      await expect(drawer, '(b) the drawer closes again').toBeHidden()
    }
    const main = await page.locator('.app-content').boundingBox()
    expect.soft(main!.x, '(b) main area left edge').toBeGreaterThanOrEqual(0)
    expect.soft(main!.x + main!.width, '(b) main area right edge').toBeLessThanOrEqual(width + 0.5)
    expect.soft(main!.y, '(b) main area top edge').toBeGreaterThanOrEqual(0)
    expect
      .soft(main!.y + main!.height, '(b) main area bottom edge')
      .toBeLessThanOrEqual(height + 0.5)

    // The shell is 100dvh with overflow hidden: only .app-content scrolls, never the page.
    const docHeight = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }))
    expect
      .soft(docHeight.scrollHeight, '(b) document scrollHeight')
      .toBeLessThanOrEqual(docHeight.innerHeight)

    // (c) Page content fits the main area, unless listed with the ticket that fixes it.
    const content = await page.evaluate(() => {
      const el = document.querySelector('.app-content')!
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })
    const skip = CONTENT_OVERFLOW_SKIPS[testInfo.project.name]?.[path]
    if (skip) {
      testInfo.annotations.push({ type: 'content-overflow-skip', description: skip })
      expect
        .soft(
          content.scrollWidth,
          `(c) ${path} fits now; remove it from CONTENT_OVERFLOW_SKIPS (${skip})`,
        )
        .toBeGreaterThan(content.clientWidth)
    } else {
      expect
        .soft(content.scrollWidth, '(c) .app-content scrollWidth')
        .toBeLessThanOrEqual(content.clientWidth)
    }

    // (d) Phone only: no visible text field under 16px, which would zoom iOS on focus.
    if (width === 390) {
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('input, textarea')]
          .filter((el) => {
            const box = el.getBoundingClientRect()
            return (
              (el as HTMLInputElement).type !== 'hidden' &&
              box.width > 0 &&
              box.height > 0 &&
              el.checkVisibility({ visibilityProperty: true })
            )
          })
          .map((el) => ({ el: el.outerHTML.slice(0, 120), size: getComputedStyle(el).fontSize }))
          .filter(({ size }) => parseFloat(size) < 16),
      )
      expect.soft(small, '(d) text fields under 16px').toEqual([])
    }
  })
}

// ==================== Header Wi-Fi dropdown, one route per viewport ====================
//
// The WiFiSelector menu is teleported to <body>, so (b) never sees it. It is opened on one
// route, in three backend states and both locales, and must keep 8px clear of both viewport
// edges with nothing in it cut off. Never skippable: every step either passes or fails.

const WIFI_DROPDOWN_ROUTE = '/dashboard'
const WIFI_STATES = ['no backend', 'connected', 'status error'] as const
/** The menu's title per locale, which also proves the locale switch took effect. */
const WIFI_MENU_TITLES = { 'zh-TW': 'WiFi 網絡', en: 'WiFi Networks' } as const

/** The open menu, found by its content rather than by the class that sizes it. */
const wifiMenu = (page: Page) =>
  page.locator('.el-dropdown__popper', { has: page.locator('.dropdown-header') })

/** The app starts in zh-TW and does not restore a saved language, so switch in the UI. */
async function switchToEnglish(page: Page, width: number) {
  const drawer = page.locator('.app-nav-drawer')
  if (width < 768) {
    await page.locator('.nav-drawer-toggle').click()
    await drawer.locator('.language-switcher').getByRole('button').click()
  } else {
    await page.locator('.app-header .language-switcher').getByRole('button').click()
  }
  await page.getByRole('menuitem', { name: /English/ }).click()
  if (width < 768) {
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
  }
}

/** Where the open menu and its content sit horizontally, measured in one pass. */
function wifiMenuGeometry(page: Page) {
  return wifiMenu(page).evaluate((popper) => {
    const vw = window.innerWidth
    const box = popper.getBoundingClientRect()
    const label = (el: Element) =>
      el.tagName.toLowerCase() +
      (typeof el.className === 'string' && el.className ? `.${el.className.split(' ')[0]}` : '')
    const wrap = popper.querySelector('.el-scrollbar__wrap')
    const outside = [...popper.querySelectorAll('*')]
      .filter((el) => {
        const b = el.getBoundingClientRect()
        return b.width > 0 && b.height > 0 && (b.left < box.left - 0.5 || b.right > box.right + 0.5)
      })
      .map((el) => label(el))
    // Text that does not wrap spills out of its element without widening it.
    const textOut: string[] = []
    const walker = document.createTreeWalker(popper, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement!
      const own = parent.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(node)
      const runs = [...range.getClientRects()].filter((r) => r.width > 0)
      if (runs.some((r) => r.left < own.left - 0.5 || r.right > own.right + 0.5)) {
        textOut.push(`${label(parent)}: ${node.textContent!.trim().slice(0, 40)}`)
      }
    }
    return {
      vw,
      left: box.left,
      right: box.right,
      pageScrollWidth: document.documentElement.scrollWidth,
      // The menu's own scroll container: content wider than the menu scrolls inside it.
      contentOverflow: wrap ? wrap.scrollWidth - wrap.clientWidth : 'no .el-scrollbar__wrap',
      outside,
      textOut,
    }
  })
}

for (const state of WIFI_STATES) {
  for (const locale of ['zh-TW', 'en'] as const) {
    test(`header Wi-Fi dropdown fits the viewport: ${state}, ${locale}`, async ({ page }) => {
      await stubBackend(page)
      if (state !== 'no backend') {
        await serveWifi(page, state === 'connected' ? 'connected' : 'status-error')
      }
      await page.goto(WIFI_DROPDOWN_ROUTE)
      await settle(page)
      const { width } = page.viewportSize()!
      if (locale === 'en') await switchToEnglish(page, width)

      // Opening the menu refreshes the status once an interface is known; wait for that
      // answer and the content it brings, then for the menu's transition to finish.
      const trigger = page.locator('.app-header .wifi-selector .el-dropdown > .el-button')
      const refreshed =
        state === 'no backend'
          ? null
          : page.waitForResponse((r) => new URL(r.url()).pathname === '/api/wifi/status')
      await trigger.click()
      const menu = wifiMenu(page)
      await expect(menu, '(e) the Wi-Fi icon opens the menu').toBeVisible()
      await refreshed
      await expect(trigger).not.toHaveClass(/is-loading/)
      await expect(menu.locator('.dropdown-header .title')).toHaveText(WIFI_MENU_TITLES[locale])
      if (state === 'no backend') {
        await expect(menu.locator('.error-alert')).toContainText('interfaces:')
      } else if (state === 'connected') {
        await expect(menu.locator('.ssid')).toHaveText(LONG_SSID)
        await expect(menu.locator('.current-sub')).toContainText('192.168.100.123')
      } else {
        await expect(menu.locator('.error-alert')).toContainText(`status: ${STATUS_ERROR_DETAIL}`)
      }
      await menu.evaluate((el) =>
        Promise.all(
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
            // A cancelled animation (e.g. a spinner removed mid-turn) rejects with an
            // AbortError; it is over too. Any other rejection fails the test.
            .map((a) =>
              a.finished.catch((e: unknown) => {
                if ((e as Error | undefined)?.name === 'AbortError') return a
                throw e
              }),
            ),
        ),
      )
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )

      // (e) The menu keeps 8px from both viewport edges and nothing in it is cut off.
      const g = await wifiMenuGeometry(page)
      expect.soft(g.left, '(e1) menu left edge, 8px clear').toBeGreaterThanOrEqual(8 - 0.5)
      expect.soft(g.right, '(e1) menu right edge, 8px clear').toBeLessThanOrEqual(g.vw - 8 + 0.5)
      expect.soft(g.pageScrollWidth, '(e2) page scrollWidth, menu open').toBeLessThanOrEqual(g.vw)
      expect.soft(g.contentOverflow, '(e3) menu content scrolls sideways by').toBe(0)
      expect.soft(g.outside, '(e4) elements sticking out of the menu').toEqual([])
      expect.soft(g.textOut, '(e5) text running out of its element').toEqual([])

      if (state === 'connected') {
        const line1 = (await menu.locator('.current-status').boundingBox())!
        const line2 = (await menu.locator('.current-sub').boundingBox())!
        expect
          .soft(line2.y, '(e6) wpa_state and IP sit under the SSID line')
          .toBeGreaterThanOrEqual(line1.y + line1.height - 0.5)
      }

      if (state !== 'no backend') {
        const select = menu.locator('.el-select')
        await expect(select, '(e7) the interface select shows it').toContainText('wlan0 (default)')
        const box = (await select.boundingBox())!
        const menuBox = (await menu.boundingBox())!
        expect.soft(box.width, '(e7) interface select width').toBeGreaterThanOrEqual(150)
        expect.soft(box.height, '(e7) interface select height').toBeGreaterThanOrEqual(24)
        expect
          .soft(box.x, '(e7) interface select left, inside the menu')
          .toBeGreaterThanOrEqual(menuBox.x - 0.5)
        expect
          .soft(box.x + box.width, '(e7) interface select right, inside the menu')
          .toBeLessThanOrEqual(menuBox.x + menuBox.width + 0.5)
      }
    })
  }
}
