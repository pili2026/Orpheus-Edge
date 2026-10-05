/// <reference lib="dom" />
import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

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

/** Shell elements (and their visible descendants) that stick out of the viewport. */
function shellOverflow(page: Page, selectors: string[]) {
  return page.evaluate((selectors) => {
    const vw = window.innerWidth
    const problems: string[] = []
    const label = (el: Element) =>
      el.tagName.toLowerCase() +
      (typeof el.className === 'string' && el.className ? `.${el.className.split(' ')[0]}` : '')
    for (const selector of selectors) {
      const root = document.querySelector(selector)
      if (!root) continue
      if (root.scrollWidth > root.clientWidth) {
        problems.push(`${selector} scrolls sideways (${root.scrollWidth} > ${root.clientWidth})`)
      }
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) continue
        if (box.left < -0.5 || box.right > vw + 0.5) {
          problems.push(`${selector} ${label(el)} spans ${box.left}..${box.right} of ${vw}`)
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
    const width = page.viewportSize()!.width

    // (a) The document never scrolls sideways.
    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect.soft(doc.scrollWidth, '(a) document scrollWidth').toBeLessThanOrEqual(doc.innerWidth)

    // (b) The shell fits. Never skippable.
    expect.soft(await shellOverflow(page, ['.app-header', '.app-sidebar']), '(b) shell').toEqual([])
    const main = await page.locator('.app-content').boundingBox()
    expect.soft(main!.x, '(b) main area left edge').toBeGreaterThanOrEqual(0)
    expect.soft(main!.x + main!.width, '(b) main area right edge').toBeLessThanOrEqual(width + 0.5)

    const toggle = page.locator('.nav-drawer-toggle')
    if (await toggle.isVisible()) {
      await toggle.click()
      const drawer = page.locator('.app-nav-drawer')
      await expect(drawer).toBeInViewport({ ratio: 1 })
      expect.soft(await shellOverflow(page, ['.app-nav-drawer']), '(b) drawer').toEqual([])
      await page.keyboard.press('Escape')
      await expect(drawer).toBeHidden()
    }

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
