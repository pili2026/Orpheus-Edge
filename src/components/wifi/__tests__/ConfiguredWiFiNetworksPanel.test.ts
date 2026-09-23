import { mount, flushPromises, DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessage } from 'element-plus'
import { AxiosError } from 'axios'

// The panel is mounted over the real Wi-Fi API client with only the shared
// HTTP instance replaced, so these tests exercise the request the panel
// actually issues rather than arguments handed to a wrapper.
vi.mock('@/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

import api from '@/services/api'
import Panel from '@/components/wifi/ConfiguredWiFiNetworksPanel.vue'
import { useUIStore } from '@/stores/ui'
import en from '@/locales/en'
import zhTW from '@/locales/zh-TW'

const getMock = vi.mocked(api.get)
const postMock = vi.mocked(api.post)
const strings = en.wifi.configuredNetworks

type WireNetwork = {
  network_id: number
  ssid: string
  priority: number | null
  enabled: boolean
  current: boolean
  is_factory_default: boolean
  psk_state: 'known' | 'unknown' | 'ambiguous'
}

const network = (
  over: Partial<WireNetwork> & Pick<WireNetwork, 'network_id' | 'ssid'>,
): WireNetwork => ({
  priority: 10,
  enabled: true,
  current: false,
  is_factory_default: false,
  // Deliberately the value that shares no wording with any label this panel
  // renders, so an assertion against it cannot pass by coincidence.
  psk_state: 'ambiguous',
  ...over,
})

const body = (networks: WireNetwork[], iface: string | null = 'wlan0') => ({
  data: {
    status: 'success',
    interface: iface,
    networks,
    total_count: networks.length,
    psk_store_available: true,
  },
})

/**
 * The measured 200-with-error body: Talos reports some listing failures with an
 * HTTP 200 status line, a non-success `status` and no rows. Apart from `status`
 * and `message` it is indistinguishable from a gateway that stores nothing.
 */
const ERROR_BODY_MESSAGE = 'Unable to list configured WiFi networks'

const errorBody = (iface: string | null = 'wlan0') => ({
  data: {
    status: 'error',
    message: ERROR_BODY_MESSAGE,
    interface: iface,
    networks: [],
    total_count: 0,
    psk_store_available: false,
  },
})

/** The MEASURED compaction case from ecutestenv00: ZZ-LEGACY=5, ZZ-R1=6, ZZ-R3=8. */
const FIRST_SNAPSHOT = [
  network({ network_id: 5, ssid: 'ZZ-LEGACY', priority: 10, is_factory_default: true }),
  network({ network_id: 6, ssid: 'ZZ-R1', priority: 20, current: true }),
  network({ network_id: 8, ssid: 'ZZ-R3', priority: null, enabled: false }),
]

/** The same three entries after a wpa_supplicant restart renumbered them 4, 5, 6. */
const COMPACTED_SNAPSHOT = [
  network({ network_id: 4, ssid: 'ZZ-LEGACY', priority: 10, is_factory_default: true }),
  network({ network_id: 5, ssid: 'ZZ-R1', priority: 20, current: true }),
  network({ network_id: 6, ssid: 'ZZ-R3', priority: null, enabled: false }),
]

const mountPanel = () => mount(Panel, { global: { plugins: [ElementPlus] } })
type Wrapper = ReturnType<typeof mountPanel>

const rowCells = (wrapper: VueWrapper): string[][] =>
  wrapper
    .findAll('.el-table__body .el-table__row')
    .map((row) => row.findAll('.cell').map((cell) => cell.text()))

const ssids = (wrapper: VueWrapper): string[] => rowCells(wrapper).map((cells) => cells[0]!)

const refresh = async (wrapper: Wrapper) => {
  const button = wrapper.find('.card-header button')
  expect(button.exists(), 'refresh control not found').toBe(true)
  await button.trigger('click')
  await flushPromises()
}

const mountLoaded = async (
  networks: WireNetwork[] = FIRST_SNAPSHOT,
  iface: string | null = 'wlan0',
): Promise<Wrapper> => {
  getMock.mockResolvedValueOnce(body(networks, iface) as never)
  const wrapper = mountPanel()
  await flushPromises()
  return wrapper
}

/** The header label naming the interface the rows came from, or null when none is rendered. */
const interfaceLabel = (wrapper: Wrapper): string | null => {
  const label = wrapper.find('.interface-label')
  return label.exists() ? label.text() : null
}

describe('ConfiguredWiFiNetworksPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
  })

  // ==================== The request ====================

  describe('the request it issues', () => {
    it('asks the configured-networks endpoint for the gateway default interface', async () => {
      await mountLoaded()

      expect(api.get).toHaveBeenCalledTimes(1)
      expect(api.get).toHaveBeenCalledWith('/wifi/networks', {
        params: {},
        timeout: expect.any(Number),
      })
    })

    it('I3: consults no other endpoint, on load or on refresh', async () => {
      const wrapper = await mountLoaded()
      getMock.mockResolvedValueOnce(body(COMPACTED_SNAPSHOT) as never)
      await refresh(wrapper)

      const paths = getMock.mock.calls.map((call) => String(call[0]))
      expect(paths).toEqual(['/wifi/networks', '/wifi/networks'])
    })
  })

  // ==================== The interface label ====================

  describe('the interface label', () => {
    it('names the interface the response came from', async () => {
      const wrapper = await mountLoaded(FIRST_SNAPSHOT, 'wlan0')

      expect(interfaceLabel(wrapper)).toBe(`${strings.interface}: wlan0`)
    })

    it('survives a failed refresh together with the rows it names', async () => {
      const wrapper = await mountLoaded(FIRST_SNAPSHOT, 'wlan0')
      const rowsBefore = rowCells(wrapper)
      expect(interfaceLabel(wrapper)).toBe(`${strings.interface}: wlan0`)

      getMock.mockRejectedValueOnce(new Error('Network Error'))
      await refresh(wrapper)

      // I1 covers the label as much as the rows: a label that vanished, or that
      // outlived the rows it describes, would be the mismatch this exists to
      // prevent.
      expect(rowCells(wrapper)).toEqual(rowsBefore)
      expect(interfaceLabel(wrapper)).toBe(`${strings.interface}: wlan0`)
      // And the failure is still stated (I2).
      expect(wrapper.find('.el-alert').exists()).toBe(true)
    })

    it('changes with the rows when a refresh reports a different interface', async () => {
      const wrapper = await mountLoaded(FIRST_SNAPSHOT, 'wlan0')

      const next = [network({ network_id: 1, ssid: 'SITE-ONLY-ON-WLAN1', priority: 5 })]
      getMock.mockResolvedValueOnce(body(next, 'wlan1') as never)
      await refresh(wrapper)

      // Label and rows move together, from the one response.
      expect(interfaceLabel(wrapper)).toBe(`${strings.interface}: wlan1`)
      expect(ssids(wrapper)).toEqual(['SITE-ONLY-ON-WLAN1'])
    })

    it('renders no label when the response carries no interface', async () => {
      const wrapper = await mountLoaded(FIRST_SNAPSHOT, null)

      expect(wrapper.find('.interface-label').exists()).toBe(false)
      // Nothing is substituted for it -- not the page selector's value, not a
      // placeholder.
      expect(wrapper.find('.card-header').text()).not.toContain(strings.interface)
      // The rows still rendered; only the label is absent.
      expect(ssids(wrapper)).toHaveLength(3)
    })
  })

  // ==================== The refresh control ====================

  describe('the refresh control', () => {
    /** Element Plus renders `type` as one of these modifier classes, and nothing when it is absent. */
    const TYPE_MODIFIERS = ['primary', 'success', 'warning', 'danger', 'info'].map(
      (type) => `el-button--${type}`,
    )

    const refreshButton = (wrapper: Wrapper) => {
      const button = wrapper.find('.card-header button')
      expect(button.exists(), 'refresh control not found').toBe(true)
      return button
    }

    it("is a secondary button, styled like the page toolbar's own refresh button", async () => {
      const wrapper = await mountLoaded()

      // The page toolbar's refresh button passes no `type`, so it carries no
      // type modifier. The page's one primary action is the connect form's; a
      // second filled button on the same page competes with it.
      const classes = refreshButton(wrapper).classes()
      expect(classes).toContain('el-button')
      for (const modifier of TYPE_MODIFIERS) {
        expect(classes, `the refresh control is styled ${modifier}`).not.toContain(modifier)
      }
    })

    it('keeps its icon', async () => {
      const wrapper = await mountLoaded()

      expect(refreshButton(wrapper).find('i.el-icon svg').exists()).toBe(true)
    })

    it('shows the in-flight refresh on itself, and leaves the rendered list alone', async () => {
      const wrapper = await mountLoaded()

      let release: (value: unknown) => void = () => {}
      getMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve
          }),
      )
      await refreshButton(wrapper).trigger('click')
      await flushPromises()

      expect(refreshButton(wrapper).classes()).toContain('is-loading')
      // D3 and I1: the spinner is on the control, and the list it is refreshing
      // is still on screen underneath it.
      expect(ssids(wrapper)).toEqual(['ZZ-LEGACYRescue', 'ZZ-R1', 'ZZ-R3'])

      release(body([]))
      await flushPromises()
      expect(refreshButton(wrapper).classes()).not.toContain('is-loading')
    })
  })

  // ==================== AC1 / AC2 / AC3 ====================

  it('AC1: lists every network with its SSID, priority, enabled state and which is current', async () => {
    const wrapper = await mountLoaded()

    expect(rowCells(wrapper)).toEqual([
      ['ZZ-LEGACY' + strings.factoryDefault, '10', strings.yes, strings.no],
      ['ZZ-R1', '20', strings.yes, strings.yes],
      ['ZZ-R3', strings.priorityUnknown, strings.no, strings.no],
    ])
  })

  it('AC1: the column headers are the SSID, priority, enabled and current labels', async () => {
    const wrapper = await mountLoaded()

    const headers = wrapper.findAll('.el-table__header .cell').map((cell) => cell.text())
    expect(headers).toEqual([strings.ssid, strings.priority, strings.enabled, strings.current])
  })

  it('AC2: the factory-default row is set apart from the site networks', async () => {
    const wrapper = await mountLoaded()

    const rows = wrapper.findAll('.el-table__body .el-table__row')
    expect(rows).toHaveLength(3)
    // The rescue entry, and only the rescue entry, carries the distinguishing
    // row class and the rescue tag.
    expect(rows[0]!.classes()).toContain('factory-default-row')
    expect(rows[1]!.classes()).not.toContain('factory-default-row')
    expect(rows[2]!.classes()).not.toContain('factory-default-row')

    expect(rows[0]!.text()).toContain(strings.factoryDefault)
    expect(rows[1]!.text()).not.toContain(strings.factoryDefault)
    expect(rows[2]!.text()).not.toContain(strings.factoryDefault)
  })

  it('AC3: a null priority reads as unknown, not 0, a dash or a blank', async () => {
    const wrapper = await mountLoaded([network({ network_id: 1, ssid: 'SITE-A', priority: null })])

    const priority = rowCells(wrapper)[0]![1]
    expect(priority).toBe(strings.priorityUnknown)
    expect(priority).not.toBe('0')
    expect(priority).not.toBe('-')
    expect(priority).not.toBe('')
  })

  it('AC3: a priority of 0 is shown as 0 and not mistaken for unknown', async () => {
    // Guard on the null check itself: a falsy test rather than a null test
    // would report a real priority of 0 as unknown.
    const wrapper = await mountLoaded([network({ network_id: 1, ssid: 'SITE-A', priority: 0 })])

    expect(rowCells(wrapper)[0]![1]).toBe('0')
  })

  // ==================== AC4 / AC5 / AC6 -- I1 and I2 ====================

  describe('what a failed fetch does to the screen', () => {
    it('AC4 + AC5: a failed refresh leaves the loaded list on screen and states the failure inline', async () => {
      const wrapper = await mountLoaded()
      expect(ssids(wrapper)).toEqual(['ZZ-LEGACYRescue', 'ZZ-R1', 'ZZ-R3'])

      getMock.mockRejectedValueOnce(
        Object.assign(new Error('Request failed with status code 503'), {
          response: { data: { detail: 'wpa_supplicant is not running' } },
        }),
      )
      await refresh(wrapper)

      // I1: the list is still there, unchanged.
      expect(rowCells(wrapper)).toEqual([
        ['ZZ-LEGACY' + strings.factoryDefault, '10', strings.yes, strings.no],
        ['ZZ-R1', '20', strings.yes, strings.yes],
        ['ZZ-R3', strings.priorityUnknown, strings.no, strings.no],
      ])
      // I2: and the failure is stated, with that data still present.
      const alert = wrapper.find('.el-alert')
      expect(alert.exists(), 'no inline failure message alongside the retained list').toBe(true)
      expect(alert.text()).toContain(strings.loadError)
      expect(alert.text()).toContain('wpa_supplicant is not running')
    })

    it('AC4 + AC5: an error with an empty body still keeps the list and still says something', async () => {
      const wrapper = await mountLoaded()

      getMock.mockRejectedValueOnce(
        Object.assign(new Error('Network Error'), { response: { data: {} } }),
      )
      await refresh(wrapper)

      expect(ssids(wrapper)).toEqual(['ZZ-LEGACYRescue', 'ZZ-R1', 'ZZ-R3'])
      const alert = wrapper.find('.el-alert')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toContain(strings.loadError)
      expect(alert.text()).toContain('Network Error')
    })

    it('AC6: a first load that fails shows the failure and an empty state, not a blank panel', async () => {
      getMock.mockRejectedValueOnce(new Error('Network Error'))
      const wrapper = mountPanel()
      await flushPromises()

      const alert = wrapper.find('.el-alert')
      expect(alert.exists(), 'first-load failure is silent').toBe(true)
      expect(alert.text()).toContain(strings.loadError)

      const empty = wrapper.find('.el-empty')
      expect(empty.exists(), 'first-load failure leaves the panel body blank').toBe(true)
      // The panel never claims the gateway stores nothing on the strength of a
      // request that failed.
      expect(empty.text()).toContain(strings.unavailable)
      expect(empty.text()).not.toContain(strings.empty)
    })

    it('a successful refresh clears the previous failure', async () => {
      getMock.mockRejectedValueOnce(new Error('Network Error'))
      const wrapper = mountPanel()
      await flushPromises()
      expect(wrapper.find('.el-alert').exists()).toBe(true)

      getMock.mockResolvedValueOnce(body(FIRST_SNAPSHOT) as never)
      await refresh(wrapper)

      expect(wrapper.find('.el-alert').exists()).toBe(false)
      expect(ssids(wrapper)).toHaveLength(3)
    })

    it('an empty networks array reads as a gateway with nothing stored, not as a failure', async () => {
      const wrapper = await mountLoaded([])

      expect(wrapper.find('.el-alert').exists()).toBe(false)
      const empty = wrapper.find('.el-empty')
      expect(empty.exists()).toBe(true)
      expect(empty.text()).toContain(strings.empty)
      expect(wrapper.findAll('.el-table__body .el-table__row')).toHaveLength(0)
    })

    // The same 200 the case above reads as an empty gateway, distinguished only
    // by `status` and `message`. Nothing here asserts on the client; the panel
    // is mounted over the real one, so these fail if the body reaches it as data.
    describe('a refresh answered 200 with a non-success body', () => {
      it('AC4 + AC5: keeps every rendered row and states the failure', async () => {
        const wrapper = await mountLoaded()
        const rowsBefore = rowCells(wrapper)
        expect(rowsBefore).toHaveLength(3)

        getMock.mockResolvedValueOnce(errorBody() as never)
        await refresh(wrapper)

        // I1: the rows the operator was reading are still the rows on screen.
        // An empty `networks` treated as data would have blanked them and put
        // the "stores nothing" text where the list was.
        expect(rowCells(wrapper)).toEqual(rowsBefore)
        expect(wrapper.find('.el-empty').exists()).toBe(false)

        // I2: and the failure is stated, in the server's own words.
        const alert = wrapper.find('.el-alert')
        expect(alert.exists(), 'a 200 with a non-success body failed silently').toBe(true)
        expect(alert.text()).toContain(strings.loadError)
        expect(alert.text()).toContain(ERROR_BODY_MESSAGE)
      })

      it('D7: leaves the interface label naming the rows still on screen', async () => {
        const wrapper = await mountLoaded(FIRST_SNAPSHOT, 'wlan0')
        expect(interfaceLabel(wrapper)).toBe(`${strings.interface}: wlan0`)

        // The failure body carries an interface of its own, named differently
        // here so that a label taken from it is visible. A panel handed this
        // body as data would relabel the wlan0 rows below as wlan1's.
        getMock.mockResolvedValueOnce(errorBody('wlan1') as never)
        await refresh(wrapper)

        expect(interfaceLabel(wrapper)).toBe(`${strings.interface}: wlan0`)
        expect(wrapper.find('.card-header').text()).not.toContain('wlan1')
      })

      it('AC6: a first load answered this way is a failure, not an empty gateway', async () => {
        getMock.mockResolvedValueOnce(errorBody() as never)
        const wrapper = mountPanel()
        await flushPromises()

        const alert = wrapper.find('.el-alert')
        expect(alert.exists(), 'a first-load 200 with a non-success body is silent').toBe(true)
        expect(alert.text()).toContain(strings.loadError)
        expect(alert.text()).toContain(ERROR_BODY_MESSAGE)

        const empty = wrapper.find('.el-empty')
        expect(empty.exists()).toBe(true)
        expect(empty.text()).toContain(strings.unavailable)
        // Telling an operator the gateway stores nothing, on the strength of a
        // response that said it could not read the list, invites them to
        // re-enter networks that are already there.
        expect(empty.text()).not.toContain(strings.empty)

        // And nothing off that body names an interface the panel never listed.
        expect(wrapper.find('.interface-label').exists()).toBe(false)
      })
    })
  })

  // ==================== AC7 -- I4 ====================

  it('AC7: a refresh re-renders from the new response, with no row held over from the old one', async () => {
    const wrapper = await mountLoaded()

    // The same three SSIDs renumbered, plus one network gone and one new.
    const next = [
      ...COMPACTED_SNAPSHOT.slice(0, 2),
      network({ network_id: 7, ssid: 'SITE-NEW', priority: 5 }),
    ]
    getMock.mockResolvedValueOnce(body(next) as never)
    await refresh(wrapper)

    expect(rowCells(wrapper)).toEqual([
      ['ZZ-LEGACY' + strings.factoryDefault, '10', strings.yes, strings.no],
      ['ZZ-R1', '20', strings.yes, strings.yes],
      ['SITE-NEW', '5', strings.yes, strings.no],
    ])
    // A panel that merged snapshots by network_id, or kept the old rows around,
    // would still be showing the dropped entry.
    expect(wrapper.text()).not.toContain('ZZ-R3')
  })

  it('AC7 + I4: renumbering the same networks changes nothing on screen', async () => {
    const wrapper = await mountLoaded(FIRST_SNAPSHOT)
    const before = rowCells(wrapper)

    getMock.mockResolvedValueOnce(body(COMPACTED_SNAPSHOT) as never)
    await refresh(wrapper)

    // Only network_id differs between the two snapshots. Anything on screen
    // that moved is keyed on a number that is not an identifier.
    expect(rowCells(wrapper)).toEqual(before)
  })

  it('I4: no network_id reaches the DOM', async () => {
    const wrapper = await mountLoaded()

    const html = wrapper.html()
    expect(html).not.toContain('network_id')
    // 5, 6 and 8 are the first snapshot's ids; 10 and 20 are its priorities,
    // which the panel does render.
    expect(rowCells(wrapper).flat()).not.toContain('8')
  })

  // ==================== AC8 -- I5 ====================

  describe('AC8: nothing passphrase-related reaches the operator', () => {
    let consoleSpies: ReturnType<typeof vi.spyOn>[] = []

    beforeEach(() => {
      consoleSpies = (['log', 'info', 'debug', 'warn', 'error'] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => {}),
      )
    })

    afterEach(() => {
      consoleSpies.forEach((spy) => spy.mockRestore())
    })

    it('renders no passphrase-related field from a successful response', async () => {
      const wrapper = await mountLoaded()

      const html = wrapper.html()
      expect(html).not.toContain('psk')
      expect(html).not.toContain('psk_state')
      expect(html).not.toContain('psk_store_available')
      expect(html).not.toContain('ambiguous')
    })

    it('prints no part of the response to the console, so a later field cannot ride along', async () => {
      const wrapper = await mountLoaded()
      getMock.mockRejectedValueOnce(
        Object.assign(new Error('boom'), {
          response: { data: { detail: 'nope', psk_state: 'ambiguous' } },
        }),
      )
      await refresh(wrapper)

      const printed = consoleSpies
        .flatMap((spy) => spy.mock.calls)
        .map((args) => args.map((a) => JSON.stringify(a)).join(' '))
        .join(' ')
      expect(printed).not.toContain('psk')
      expect(printed).not.toContain('ambiguous')
      expect(printed).not.toContain('ZZ-LEGACY')
    })
  })

  // ==================== AC9 ====================

  describe('AC9: every user-visible string comes from the message files', () => {
    it('renders the English messages under the English locale', async () => {
      const wrapper = await mountLoaded()

      const text = wrapper.text()
      expect(text).toContain(strings.title)
      expect(text).toContain(strings.ssid)
      expect(text).toContain(strings.priority)
      expect(text).toContain(strings.enabled)
      expect(text).toContain(strings.current)
      expect(text).toContain(strings.priorityUnknown)
      expect(text).toContain(strings.factoryDefault)
      expect(text).toContain(en.common.refresh)
    })

    it('renders the Traditional Chinese messages under that locale, with no English label left behind', async () => {
      useUIStore().setLanguage('zh-TW')
      const wrapper = await mountLoaded()

      const zh = zhTW.wifi.configuredNetworks
      const text = wrapper.text()
      expect(text).toContain(zh.title)
      expect(text).toContain(zh.priority)
      expect(text).toContain(zh.enabled)
      expect(text).toContain(zh.current)
      expect(text).toContain(zh.priorityUnknown)
      expect(text).toContain(zh.factoryDefault)
      expect(text).toContain(zhTW.common.refresh)

      // A hardcoded English label would survive the locale switch.
      for (const label of [
        strings.title,
        strings.priority,
        strings.enabled,
        strings.current,
        strings.priorityUnknown,
        strings.yes,
        strings.no,
        strings.factoryDefault,
        strings.interface,
      ]) {
        expect(text, `English "${label}" survived the switch to zh-TW`).not.toContain(label)
      }
    })

    it('states the failure and the empty state in the active locale', async () => {
      useUIStore().setLanguage('zh-TW')
      getMock.mockRejectedValueOnce(new Error('Network Error'))
      const wrapper = mountPanel()
      await flushPromises()

      const zh = zhTW.wifi.configuredNetworks
      expect(wrapper.find('.el-alert').text()).toContain(zh.loadError)
      expect(wrapper.find('.el-empty').text()).toContain(zh.unavailable)
      expect(wrapper.text()).not.toContain(strings.loadError)
      expect(wrapper.text()).not.toContain(strings.unavailable)
    })

    it('declares the same keys in both locales', () => {
      expect(Object.keys(zhTW.wifi.configuredNetworks).sort()).toEqual(
        Object.keys(en.wifi.configuredNetworks).sort(),
      )
    })
  })
})

// ==================== The add-network control ====================
//
// The dialog is appended to <body>, outside this panel's element, so everything
// about it is looked up through `document` rather than the wrapper.

describe('ConfiguredWiFiNetworksPanel: adding a network', () => {
  const addStrings = en.wifi.addNetwork
  const SECRET = 'Zq7!unique-passphrase'
  const TYPE_MODIFIERS = ['primary', 'success', 'warning', 'danger', 'info'].map(
    (type) => `el-button--${type}`,
  )

  let wrapper: Wrapper | null = null

  const mountAttached = async (networks: WireNetwork[] = FIRST_SNAPSHOT) => {
    getMock.mockResolvedValueOnce(body(networks) as never)
    wrapper = mount(Panel, { global: { plugins: [ElementPlus] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }

  const headerButtons = (w: Wrapper) => w.findAll('.card-header button')
  const addButton = (w: Wrapper) => {
    const button = w.find('.card-header button.add-network')
    expect(button.exists(), 'add-network control not found').toBe(true)
    return button
  }

  const q = <T extends Element = HTMLElement>(selector: string): T | null =>
    document.body.querySelector<T>(selector)

  const dialogOpen = (): boolean => {
    const overlay = q('.add-wifi-network-dialog')?.closest('.el-overlay') as HTMLElement | null
    return !!overlay && overlay.style.display !== 'none'
  }

  /** The document's markup, and every form control's live value, which no markup includes. */
  const documentHolds = (value: string): boolean =>
    document.documentElement.outerHTML.includes(value) ||
    [...document.querySelectorAll<HTMLInputElement>('input')].some((el) => el.value.includes(value))

  const openAndFill = async (w: Wrapper, ssid = 'ZZ-SITE-B') => {
    await addButton(w).trigger('click')
    await flushPromises()
    await new DOMWrapper(q<HTMLInputElement>('.ssid-input input')!).setValue(ssid)
    await new DOMWrapper(q<HTMLInputElement>('.passphrase-input input')!).setValue(SECRET)
    await flushPromises()
  }

  const clickSave = async () => {
    await new DOMWrapper(q('.save-button')!).trigger('click')
    await flushPromises()
  }

  const saveSuccess = (created = true) => ({
    data: {
      status: 'success',
      message: null,
      interface: 'wlan0',
      ssid: 'ZZ-SITE-B',
      network_id: 9,
      applied_priority: 4,
      created,
      saved: true,
      save_error: null,
      left_disabled: false,
      note: null,
    },
  })

  const loadFailure = () => wrapper!.find('.load-error')

  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued once-values; a test that failed early must not feed the next.
    getMock.mockReset()
    postMock.mockReset()
    setActivePinia(createPinia())
    useUIStore().setLanguage('en')
    document.body.innerHTML = ''
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    ElMessage.closeAll()
    document.body.innerHTML = ''
  })

  it('renders after refresh, styled like it, and opens the dialog', async () => {
    const w = await mountAttached()

    const buttons = headerButtons(w)
    expect(buttons).toHaveLength(2)
    // Refresh stays first, so every control this suite drives by position is unchanged.
    expect(buttons[0]!.text()).toBe(en.common.refresh)
    expect(buttons[1]!.classes()).toContain('add-network')
    expect(buttons[1]!.text()).toBe(addStrings.open)
    expect(buttons[1]!.find('i.el-icon svg').exists()).toBe(true)
    for (const modifier of TYPE_MODIFIERS) {
      expect(buttons[1]!.classes(), `the add control is styled ${modifier}`).not.toContain(modifier)
    }
    expect(dialogOpen()).toBe(false)

    await addButton(w).trigger('click')
    await flushPromises()

    expect(dialogOpen()).toBe(true)
    // Opening the dialog issues nothing.
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('names the control without the word the interface label uses, in either locale', async () => {
    expect(addStrings.open).not.toContain('Interface')
    expect(zhTW.wifi.addNetwork.open).not.toContain('介面')
  })

  it('hands the dialog its rows, so a rescue SSID from the list is blocked', async () => {
    const w = await mountAttached()
    // ZZ-LEGACY is the rescue entry of the first snapshot.
    await openAndFill(w, 'ZZ-LEGACY')

    expect(q('.ssid-error')!.textContent).toContain('factory-default')
    expect(q<HTMLButtonElement>('.save-button')!.disabled).toBe(true)
    expect(q('.stored-check-unavailable')).toBeNull()
  })

  it('tells the dialog when no list has loaded', async () => {
    getMock.mockRejectedValueOnce(new Error('Network Error'))
    wrapper = mount(Panel, { global: { plugins: [ElementPlus] }, attachTo: document.body })
    await flushPromises()

    await addButton(wrapper).trigger('click')
    await flushPromises()

    expect(q('.stored-check-unavailable')!.textContent).toContain(addStrings.storedCheckUnavailable)
  })

  it('reloads the list exactly once when the dialog reports a save', async () => {
    const w = await mountAttached()
    postMock.mockResolvedValueOnce(saveSuccess() as never)
    const next = [...FIRST_SNAPSHOT, network({ network_id: 9, ssid: 'ZZ-SITE-B', priority: 4 })]
    getMock.mockResolvedValueOnce(body(next) as never)

    await openAndFill(w)
    await clickSave()

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(ssids(w)).toContain('ZZ-SITE-B')
    // I3: no request the panel made carries an interface.
    for (const call of getMock.mock.calls) {
      expect(call[0]).toBe('/wifi/networks')
      expect(call[1]).toEqual({ params: {}, timeout: expect.any(Number) })
    }
    expect(postMock.mock.calls[0]![2]).toEqual({ timeout: 45000 })
    // I9 through the panel: the dialog closed and took the passphrase with it.
    expect(dialogOpen()).toBe(false)
    expect(documentHolds(SECRET)).toBe(false)
  })

  it('reloads the list exactly once when the dialog asks for a reload', async () => {
    const w = await mountAttached()
    postMock.mockResolvedValueOnce({
      data: {
        ...saveSuccess().data,
        status: 'error',
        message: 'Failed to save WiFi network: FAIL',
      },
    } as never)
    getMock.mockResolvedValueOnce(body(FIRST_SNAPSHOT) as never)

    await openAndFill(w)
    await clickSave()

    expect(api.get).toHaveBeenCalledTimes(2)
    expect(dialogOpen()).toBe(true)
  })

  it('does not reload on an outcome that never reached the save', async () => {
    const w = await mountAttached()
    postMock.mockRejectedValueOnce(
      Object.assign(new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST'), {
        response: { status: 400, data: { detail: 'OPEN network must not include psk' } },
      }),
    )

    await openAndFill(w)
    await clickSave()

    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('shows the success message when the reload after it fails, keeps the rows, and shows the failure (I1, I2)', async () => {
    const w = await mountAttached()
    const rowsBefore = rowCells(w)
    postMock.mockResolvedValueOnce(saveSuccess(false) as never)
    getMock.mockRejectedValueOnce(new Error('Network Error'))

    await openAndFill(w, 'ZZ-SITE-B')
    await clickSave()

    // The save succeeded on the gateway whatever the read that follows it does.
    const toast = q('.el-message--success')
    expect(toast, 'no success message').not.toBeNull()
    expect(toast!.textContent).toContain(
      '"ZZ-SITE-B" already existed on wlan0; its passphrase was updated.',
    )
    expect(rowCells(w)).toEqual(rowsBefore)
    expect(loadFailure().exists()).toBe(true)
    expect(loadFailure().text()).toContain(strings.loadError)
    expect(loadFailure().text()).toContain('Network Error')
  })

  it('keeps the rows and a standing failure on screen while a save is in flight (I1, I2)', async () => {
    const w = await mountAttached()
    const rowsBefore = rowCells(w)
    getMock.mockRejectedValueOnce(new Error('Network Error'))
    await refresh(w)
    expect(loadFailure().exists()).toBe(true)

    let release: (value: unknown) => void = () => {}
    postMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    await openAndFill(w)
    await clickSave()

    expect(q<HTMLButtonElement>('.save-button')!.disabled).toBe(true)
    expect(rowCells(w)).toEqual(rowsBefore)
    expect(loadFailure().exists()).toBe(true)

    getMock.mockResolvedValueOnce(body(FIRST_SNAPSHOT) as never)
    release(saveSuccess())
    await flushPromises()
    expect(rowCells(w)).toEqual(rowsBefore)
  })

  it('D12: after a save timeout the reload can itself time out behind the same lock; the rows stay and the failure shows', async () => {
    const w = await mountAttached()
    const rowsBefore = rowCells(w)
    postMock.mockRejectedValueOnce(
      new AxiosError('timeout of 45000ms exceeded', AxiosError.ECONNABORTED),
    )
    // Talos serialises the listing behind the save's per-interface lock, so the
    // reload waits for the save and can outlast its own timeout.
    getMock.mockRejectedValueOnce(
      new AxiosError('timeout of 15000ms exceeded', AxiosError.ECONNABORTED),
    )

    await openAndFill(w)
    await clickSave()

    expect(api.get).toHaveBeenCalledTimes(2)
    // The dialog states the timeout and claims neither outcome.
    expect(dialogOpen()).toBe(true)
    expect(q('.save-failure')!.textContent).toContain(addStrings.timedOut)
    // The panel states its own failure, with whatever it last rendered intact.
    expect(rowCells(w)).toEqual(rowsBefore)
    expect(loadFailure().text()).toContain('timeout of 15000ms exceeded')
  })

  // ==================== I10 ====================
  //
  // Refresh is disabled while a load is in flight, so through the UI two loads
  // overlap only when the dialog's `saved` or `reload` starts one. Each case
  // below drives that reload through a real save; nothing calls the loader.

  describe('I10: only the most recently started load writes', () => {
    const deferred = () => {
      let resolve: (value: unknown) => void = () => {}
      let reject: (reason: unknown) => void = () => {}
      const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }

    /** What the post-save reload returns: the first snapshot plus the saved network. */
    const NEWER = [...FIRST_SNAPSHOT, network({ network_id: 9, ssid: 'ZZ-SITE-B', priority: 4 })]
    /**
     * What the superseded load returns. It shares no SSID and no interface with
     * either the first snapshot or NEWER, so any trace of it on screen can only
     * mean it was written.
     */
    const OLDER = [network({ network_id: 2, ssid: 'ZZ-STALE-ONLY', priority: 7 })]
    const OLDER_INTERFACE = 'wlan9'

    /** The SSID cells a snapshot renders as, rescue tag included. */
    const shown = (rows: WireNetwork[]): string[] =>
      rows.map((n) => n.ssid + (n.is_factory_default ? strings.factoryDefault : ''))

    /** Starts a refresh whose response is held until the test releases it. */
    const startHeldRefresh = async (w: Wrapper) => {
      const held = deferred()
      getMock.mockImplementationOnce(() => held.promise as never)
      await refresh(w)
      // Refresh shows the load in flight on itself; adding a network stays available.
      expect(headerButtons(w)[0]!.attributes('disabled')).toBeDefined()
      expect(addButton(w).attributes('disabled')).toBeUndefined()
      return held
    }

    it('keeps the post-save reload when an earlier load resolves after it with an older snapshot', async () => {
      const w = await mountAttached()
      const held = await startHeldRefresh(w)

      postMock.mockResolvedValueOnce(saveSuccess() as never)
      getMock.mockResolvedValueOnce(body(NEWER) as never)
      await openAndFill(w)
      await clickSave()
      expect(api.get).toHaveBeenCalledTimes(3)
      expect(ssids(w)).toContain('ZZ-SITE-B')

      held.resolve(body(OLDER, OLDER_INTERFACE))
      await flushPromises()

      expect(ssids(w)).toEqual(shown(NEWER))
      expect(interfaceLabel(w)).toBe(`${strings.interface}: wlan0`)
      expect(w.text()).not.toContain('ZZ-STALE-ONLY')
      expect(w.text()).not.toContain(OLDER_INTERFACE)
    })

    it('shows no error when an earlier load fails after the post-save reload succeeded (I1, I2)', async () => {
      const w = await mountAttached()
      const held = await startHeldRefresh(w)

      postMock.mockResolvedValueOnce(saveSuccess() as never)
      getMock.mockResolvedValueOnce(body(NEWER) as never)
      await openAndFill(w)
      await clickSave()

      held.reject(new Error('Superseded Network Error'))
      await flushPromises()

      expect(loadFailure().exists()).toBe(false)
      expect(w.text()).not.toContain('Superseded Network Error')
      expect(ssids(w)).toEqual(shown(NEWER))
      expect(interfaceLabel(w)).toBe(`${strings.interface}: wlan0`)
    })

    it('does not mark the panel loaded from a superseded success after the post-save reload failed', async () => {
      const held = deferred()
      getMock.mockImplementationOnce(() => held.promise as never)
      wrapper = mount(Panel, { global: { plugins: [ElementPlus] }, attachTo: document.body })
      await flushPromises()
      const w = wrapper

      postMock.mockResolvedValueOnce(saveSuccess() as never)
      getMock.mockRejectedValueOnce(new Error('Network Error'))
      await openAndFill(w)
      await clickSave()
      expect(loadFailure().exists()).toBe(true)

      held.resolve(body(OLDER, OLDER_INTERFACE))
      await flushPromises()

      // The newer load's failure stands, and the older success wrote nothing:
      // no rows, no label, and the empty state still says the list could not be read.
      expect(rowCells(w)).toEqual([])
      expect(interfaceLabel(w)).toBeNull()
      expect(loadFailure().exists()).toBe(true)
      expect(w.find('.el-empty').text()).toContain(strings.unavailable)
      expect(w.find('.el-empty').text()).not.toContain(strings.empty)
    })

    it('leaves loads that do not overlap writing exactly as before', async () => {
      const w = await mountAttached()

      getMock.mockResolvedValueOnce(body(NEWER) as never)
      await refresh(w)
      expect(ssids(w)).toEqual(shown(NEWER))

      getMock.mockRejectedValueOnce(new Error('Network Error'))
      await refresh(w)
      expect(ssids(w)).toEqual(shown(NEWER))
      expect(loadFailure().text()).toContain('Network Error')

      getMock.mockResolvedValueOnce(body(FIRST_SNAPSHOT) as never)
      await refresh(w)
      expect(loadFailure().exists()).toBe(false)
      expect(ssids(w)).toEqual(shown(FIRST_SNAPSHOT))
    })
  })
})
