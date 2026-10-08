/// <reference lib="dom" />
import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import {
  INVALID_REASON,
  LONG_SSID,
  connectAcceptedResponse,
  connectRejectedResponse,
  STATUS_ERROR_DETAIL,
  serveWifi,
  serveWifiPage,
} from './fixtures/wifi'

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
  },
}

/**
 * Assertion (f) skips: project name -> route -> the ticket whose page work removes it.
 * The same rules as (c): only page content, and a listed route that (f) no longer
 * flags fails the run. (f) is skipped nowhere else.
 * /config/instance is not listed: without a backend its tables do not render, so (f)
 * passes there; its squeezed table (f2) shows with fixtures only, under T4b.
 */
const CLIPPED_CONTENT_SKIPS: Record<string, Record<string, string>> = {
  'phone-390x844': {
    // Redirects to /config/modbus, so it carries the same table.
    '/config': 'T4b: ModbusConfigView bus table (fixed actions column leaves 130px of 200px)',
    '/config/modbus':
      'T4b: ModbusConfigView bus table (fixed actions column leaves 130px of 200px)',
    '/config/mqtt': 'T4a — system and MQTT settings on phones: MqttConfigView Runtime Status card',
    '/provision': 'T2b: ProvisionView edit form and MQTT registration buttons',
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

/**
 * (f) exclusions. Each is a named entry saying why it is excluded and the case it was
 * observed on (main at 153ccfe); removing any one of them flags the route named in
 * `observed`. A new exclusion follows the same rule, or it does not go in.
 */
const CLIP_EXCLUSIONS: ReadonlyArray<
  { name: string; observed: string } & ({ textOverflow: 'ellipsis' } | { selector: string })
> = [
  {
    // One-line truncation is a decision, not an accident: the full text is elsewhere.
    name: 'text-overflow: ellipsis',
    observed: '/monitor at 390: .el-select__placeholder',
    textOverflow: 'ellipsis',
  },
  {
    // A text field scrolls its own text under the caret; a long value is not cut off.
    name: 'text fields',
    observed: '/config/system at 390: the el-input-number field',
    selector: 'input, textarea',
  },
  {
    // Element Plus keeps a scrolling table's header and footer at the body's scrollLeft.
    name: 'el-table header and footer of a sideways-scrolling table',
    observed: '/config/modbus at 820: .el-table__header-wrapper',
    selector:
      '.el-table--scrollable-x .el-table__header-wrapper, .el-table--scrollable-x .el-table__footer-wrapper',
  },
  {
    // Element Plus's own sideways scroller for a table wider than its box. A table
    // squeezed past use is (f2)'s to flag.
    name: 'el-table body scroller',
    observed: '/config/modbus at 820: .el-table__body-wrapper .el-scrollbar__wrap',
    selector: '.el-table--scrollable-x .el-table__body-wrapper .el-scrollbar__wrap',
  },
]

/**
 * (f) Page content that cannot be seen, which (c) misses: (c) measures only .app-content.
 * (f1) An element inside .app-content that clips sideways (overflow-x hidden or clip) or
 * scrolls sideways on its own (auto or scroll) and is wider inside than out. Element Plus
 * gives .el-card__body `overflow: auto`, so a card's too-wide content scrolls inside the
 * card, with no scrollbar on a phone. Every element counts, less CLIP_EXCLUSIONS.
 * (f2) An el-table with a fixed column whose remaining width is narrower than its widest
 * non-fixed column: that column is never seen whole.
 */
function clippedContent(page: Page) {
  return page.evaluate((exclusions) => {
    const root = document.querySelector('.app-content')!
    const label = (el: Element) =>
      el.tagName.toLowerCase() +
      (typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).join('.')}`
        : '')
    const excluded = (el: Element, style: CSSStyleDeclaration) =>
      exclusions.some((x) =>
        'textOverflow' in x ? style.textOverflow === x.textOverflow : el.matches(x.selector),
      )
    const problems: string[] = []
    for (const el of root.querySelectorAll('*')) {
      const style = getComputedStyle(el)
      if (!['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) continue
      if (el.scrollWidth <= el.clientWidth + 1) continue
      if (excluded(el, style)) continue
      problems.push(
        `(f1) ${label(el)} [overflow-x: ${style.overflowX}] scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`,
      )
    }
    for (const table of root.querySelectorAll('.el-table')) {
      const heads = [...table.querySelectorAll('.el-table__header-wrapper thead tr:first-child th')]
      const fixed = (th: Element) => /\bel-table-fixed-column--(left|right)\b/.test(th.className)
      const width = (th: Element) => th.getBoundingClientRect().width
      const fixedWidth = heads.filter(fixed).reduce((sum, th) => sum + width(th), 0)
      if (fixedWidth === 0) continue
      const scroller = table.querySelector('.el-table__body-wrapper .el-scrollbar__wrap')
      const left = (scroller ? scroller.clientWidth : table.clientWidth) - fixedWidth
      const widest = heads.filter((th) => !fixed(th)).sort((a, b) => width(b) - width(a))[0]
      if (widest && left + 1 < width(widest)) {
        problems.push(
          `(f2) ${label(table)}: fixed columns leave ${Math.round(left)}px, column "${widest.textContent!.trim()}" is ${Math.round(width(widest))}px`,
        )
      }
    }
    return problems
  }, CLIP_EXCLUSIONS)
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

    // (f) Nothing inside the page is clipped or hidden in a sideways scroller, unless
    // listed with the ticket that fixes it.
    const clipped = await clippedContent(page)
    const clipSkip = CLIPPED_CONTENT_SKIPS[testInfo.project.name]?.[path]
    if (clipSkip) {
      testInfo.annotations.push({ type: 'clipped-content-skip', description: clipSkip })
      expect
        .soft(
          clipped,
          `(f) ${path} clips nothing now; remove it from CLIPPED_CONTENT_SKIPS (${clipSkip})`,
        )
        .not.toEqual([])
    } else {
      expect.soft(clipped, '(f) clipped content').toEqual([])
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
  const english = page.getByRole('menuitem', { name: /English/ })
  await english.click()
  if (width < 768) {
    // The open language menu traps focus, which pauses the drawer's Escape; it lets go
    // only after the click, and before the menu is hidden. So close the drawer after that.
    await expect(english).toBeHidden()
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

// ==================== /debug/wifi with Wi-Fi data, one test per viewport ====================
//
// Without a backend the page has no status details, no scan rows and no configured
// networks, so the per-route test cannot see them clip. Here the page is served a
// connection to the 32-character SSID, a scan with an open and an invalid network,
// and a configured list. Every state must pass (a), (c), (d) and (f); none is skippable.
// At 390 that is the page as loaded, with the status card and the configured networks
// expanded, and with the connect sheet open.

/** Waits for every running finite animation, e.g. the sheet sliding up, to end. */
async function settleAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
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
}

/** (a), (c), (d) and (f) for the page as it is now; `state` names it in each message. */
async function expectWifiPageFits(page: Page, state: string) {
  const m = await page.evaluate(() => {
    const content = document.querySelector('.app-content')!
    return {
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      contentScrollWidth: content.scrollWidth,
      contentClientWidth: content.clientWidth,
      small: [...document.querySelectorAll('input, textarea')]
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
    }
  })
  expect
    .soft(m.docScrollWidth, `(a) ${state}: document scrollWidth`)
    .toBeLessThanOrEqual(m.innerWidth)
  expect
    .soft(m.contentScrollWidth, `(c) ${state}: .app-content scrollWidth`)
    .toBeLessThanOrEqual(m.contentClientWidth)
  if (m.innerWidth === 390) {
    expect.soft(m.small, `(d) ${state}: text fields under 16px`).toEqual([])
  }
  expect.soft(await clippedContent(page), `(f) ${state}: clipped content`).toEqual([])
}

test('/debug/wifi with Wi-Fi data fits and clips nothing', async ({ page }) => {
  await stubBackend(page)
  await serveWifiPage(page)
  await page.goto('/debug/wifi')
  await settle(page)
  const { width } = page.viewportSize()!
  const content = page.locator('.app-content')
  // The data arrived: the scan's last row and the configured list's rescue entry.
  await expect(content).toContainText('Cafe-Guest')

  if (width >= 768) {
    await expect(page.locator('.debug-network-page .el-col'), 'sm+ keeps two columns').toHaveCount(
      2,
    )
    await expect(page.locator('.wifi-status-details')).toBeVisible()
    await expect(page.locator('.configured-networks-card')).toContainText('TALOS-RESCUE')
    await expectWifiPageFits(page, 'two columns')
    return
  }

  await expect(page.locator('.wifi-summary-row')).toContainText(LONG_SSID)
  await expectWifiPageFits(page, 'loaded')

  // The invalid network says why on its row, with no hover.
  const reason = page.locator('.wifi-network-invalid-reason')
  await expect(reason).toBeVisible()
  await expect(reason).toHaveText(INVALID_REASON)

  await page.locator('.wifi-summary-row').click()
  await expect(page.locator('.wifi-status-details')).toBeVisible()
  await page.locator('.configured-collapse .el-collapse-item__header').click()
  await expect(page.locator('.configured-networks-card')).toContainText('TALOS-RESCUE')
  await settleAnimations(page)
  await expectWifiPageFits(page, 'status and configured networks expanded')

  await page.locator('button.wifi-network-row', { hasText: LONG_SSID }).click()
  const sheet = page.locator('.connect-sheet')
  await expect(sheet, 'tapping a network opens the sheet').toBeVisible()
  await expect(sheet.locator('.el-drawer__header')).toContainText(LONG_SSID)
  await expect(sheet.locator('input[type="password"]')).toBeVisible()
  await settleAnimations(page)
  await expect(sheet).toBeInViewport({ ratio: 1 })
  await expectWifiPageFits(page, 'connect sheet open')

  // Connect results, in both places one can show, for the 32-character SSID: a definite
  // rejection in the sheet; an acceptance (with its poll alert) and no response under the
  // summary row.
  let answer: 'rejected' | 'accepted' | 'no response' = 'rejected'
  await page.route(
    (url) => url.pathname === '/api/wifi/connect',
    (route) =>
      answer === 'no response'
        ? route.abort('connectionreset')
        : route.fulfill({
            json: answer === 'rejected' ? connectRejectedResponse : connectAcceptedResponse,
          }),
  )
  const connectThroughConfirmation = async () => {
    await sheet.locator('.el-form .el-button--primary').click()
    const confirmation = page.locator('.el-message-box.connect-confirm')
    await expect(confirmation).toBeVisible()
    await confirmation.locator('.el-message-box__btns .el-button--primary').click()
    await expect(confirmation).toBeHidden()
  }
  await sheet.locator('input[type="password"]').fill('pw-1')

  // (i) A definite rejection stays in the sheet, above the form, with the password kept.
  await connectThroughConfirmation()
  const sheetResult = sheet.locator('.connect-result-sheet')
  await expect(sheetResult.locator('.connect-result-badge')).toHaveText('REJECTED')
  await expect(sheet.locator('input[type="password"]')).toHaveValue('pw-1')
  await settleAnimations(page)
  await expectWifiPageFits(page, 'rejection in the sheet')
  const header = await sheet
    .locator('.el-drawer__header')
    .evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))
  expect
    .soft(header.scrollHeight, 'the sheet header keeps its height after a rejection')
    .toBeLessThanOrEqual(header.clientHeight)
  // The rejection is seen without scrolling, on this phone and on a short one: from the
  // top of the result (its badge) to the bottom of its reason. The details table below
  // them may run on; at 375x667 the whole card (592px) is taller than the sheet's body.
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(viewport)
    await settleAnimations(page)
    const top = (await sheetResult.boundingBox())!.y
    const reason = (await sheetResult.locator('.connect-result-reason').boundingBox())!
    const at = `${viewport.width}x${viewport.height}`
    expect.soft(top, `the rejection's top is in the viewport at ${at}`).toBeGreaterThanOrEqual(0)
    expect
      .soft(reason.y + reason.height, `the rejection's reason ends in the viewport at ${at}`)
      .toBeLessThanOrEqual(viewport.height + 0.5)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await settleAnimations(page)

  // (ii) An acceptance closes the sheet; the result and its poll alert show under the summary row.
  answer = 'accepted'
  await connectThroughConfirmation()
  await expect(sheet).toBeHidden()
  const pageResult = page.locator('.connect-result-page')
  await expect(pageResult.locator('.connect-result-badge')).toHaveText('ACCEPTED')
  await expect(pageResult.locator('.el-alert', { hasText: LONG_SSID })).toBeVisible()
  await settleAnimations(page)
  await expectWifiPageFits(page, 'acceptance under the summary row')

  // (iii) No response closes the sheet too; "Result unknown" shows under the summary row.
  answer = 'no response'
  await page.locator('button.wifi-network-row', { hasText: LONG_SSID }).click()
  await expect(sheet).toBeVisible()
  await sheet.locator('input[type="password"]').fill('pw-2')
  await connectThroughConfirmation()
  await expect(sheet).toBeHidden()
  await expect(pageResult.locator('.connect-result-badge.el-tag--info')).toBeVisible()
  await expect(pageResult.locator('.connect-result-reason')).toBeVisible()
  await settleAnimations(page)
  await expectWifiPageFits(page, 'no response under the summary row')
})
