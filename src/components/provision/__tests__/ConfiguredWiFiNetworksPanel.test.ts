import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

// The panel is mounted over the real Wi-Fi API client with only the shared
// HTTP instance replaced, so these tests exercise the request the panel
// actually issues rather than arguments handed to a wrapper.
vi.mock('@/services/api', () => ({ default: { get: vi.fn() } }))

import api from '@/services/api'
import Panel from '@/components/provision/ConfiguredWiFiNetworksPanel.vue'
import { useUIStore } from '@/stores/ui'
import en from '@/locales/en'
import zhTW from '@/locales/zh-TW'

const getMock = vi.mocked(api.get)
const strings = en.provision.configuredNetworks

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

const body = (networks: WireNetwork[]) => ({
  data: {
    interface: 'wlan0',
    networks,
    total_count: networks.length,
    psk_store_available: true,
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

const mountLoaded = async (networks: WireNetwork[] = FIRST_SNAPSHOT): Promise<Wrapper> => {
  getMock.mockResolvedValueOnce(body(networks) as never)
  const wrapper = mountPanel()
  await flushPromises()
  return wrapper
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

  // ==================== AC1 / AC2 / AC3 ====================

  it('AC1: lists every network with its SSID, priority, enabled state and which is current', async () => {
    const wrapper = await mountLoaded()

    expect(rowCells(wrapper)).toEqual([
      ['ZZ-LEGACY' + strings.factoryDefault, '10', strings.enabledYes, ''],
      ['ZZ-R1', '20', strings.enabledYes, strings.currentYes],
      ['ZZ-R3', strings.priorityUnknown, strings.enabledNo, ''],
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
        ['ZZ-LEGACY' + strings.factoryDefault, '10', strings.enabledYes, ''],
        ['ZZ-R1', '20', strings.enabledYes, strings.currentYes],
        ['ZZ-R3', strings.priorityUnknown, strings.enabledNo, ''],
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
      ['ZZ-LEGACY' + strings.factoryDefault, '10', strings.enabledYes, ''],
      ['ZZ-R1', '20', strings.enabledYes, strings.currentYes],
      ['SITE-NEW', '5', strings.enabledYes, ''],
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

      const zh = zhTW.provision.configuredNetworks
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
        strings.enabledYes,
        strings.enabledNo,
        strings.currentYes,
        strings.factoryDefault,
      ]) {
        expect(text, `English "${label}" survived the switch to zh-TW`).not.toContain(label)
      }
    })

    it('states the failure and the empty state in the active locale', async () => {
      useUIStore().setLanguage('zh-TW')
      getMock.mockRejectedValueOnce(new Error('Network Error'))
      const wrapper = mountPanel()
      await flushPromises()

      const zh = zhTW.provision.configuredNetworks
      expect(wrapper.find('.el-alert').text()).toContain(zh.loadError)
      expect(wrapper.find('.el-empty').text()).toContain(zh.unavailable)
      expect(wrapper.text()).not.toContain(strings.loadError)
      expect(wrapper.text()).not.toContain(strings.unavailable)
    })

    it('declares the same keys in both locales', () => {
      expect(Object.keys(zhTW.provision.configuredNetworks).sort()).toEqual(
        Object.keys(en.provision.configuredNetworks).sort(),
      )
    })
  })
})
