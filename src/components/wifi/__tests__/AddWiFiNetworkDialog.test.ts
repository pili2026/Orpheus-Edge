import { mount, flushPromises, DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessage } from 'element-plus'
import { AxiosError, AxiosHeaders } from 'axios'

// D5: the dialog runs over the real Wi-Fi API client with only the shared HTTP
// instance replaced, and every control is driven by clicking what it renders.
vi.mock('@/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

import api from '@/services/api'
import Dialog from '@/components/wifi/AddWiFiNetworkDialog.vue'
import { useUIStore } from '@/stores/ui'
import en from '@/locales/en'
import zhTW from '@/locales/zh-TW'

const postMock = vi.mocked(api.post)
const strings = en.wifi.addNetwork

/**
 * The passphrase the tests type. It shares no text with any label, SSID or
 * server message below, so finding it anywhere can only mean it leaked.
 */
const SECRET = 'Zq7!unique-passphrase'

type Row = {
  network_id: number
  ssid: string
  priority: number | null
  enabled: boolean
  current: boolean
  is_factory_default: boolean
  psk_state: 'known' | 'unknown' | 'ambiguous'
}

const row = (over: Partial<Row> & Pick<Row, 'ssid'>): Row => ({
  network_id: 3,
  priority: 4,
  enabled: true,
  current: false,
  is_factory_default: false,
  psk_state: 'known',
  ...over,
})

/** The gateway's rescue entry and one site network, as the panel would pass them. */
const STORED = [
  row({ network_id: 0, ssid: 'imaoffice1', priority: 5, current: true, is_factory_default: true }),
  row({ network_id: 1, ssid: 'ZZ-SITE-A' }),
]

const successBody = (over: Record<string, unknown> = {}) => ({
  status: 'success',
  timestamp: '2026-09-23T05:00:00',
  message: null,
  // Nothing else the dialog sees names an interface, so this one can only come from the response.
  interface: 'wlan1',
  ssid: 'ZZ-SITE-B',
  network_id: 7777,
  applied_priority: 4,
  created: true,
  saved: true,
  save_error: null,
  left_disabled: false,
  note: 'Network stored in wpa_supplicant configuration.',
  ...over,
})

const httpError = (status: number, data: unknown): AxiosError => {
  const error = new AxiosError(
    `Request failed with status code ${status}`,
    status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
  )
  error.response = {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  }
  return error
}

const timeoutError = () => new AxiosError('timeout of 45000ms exceeded', AxiosError.ECONNABORTED)

type Props = { existingNetworks?: Row[]; existingNetworksLoaded?: boolean }

let wrapper: VueWrapper | null = null

const mountDialog = async ({
  existingNetworks = STORED,
  existingNetworksLoaded = true,
}: Props = {}) => {
  const mounted: VueWrapper = mount(Dialog, {
    props: {
      modelValue: true,
      existingNetworks,
      existingNetworksLoaded,
      'onUpdate:modelValue': (value: boolean) => mounted.setProps({ modelValue: value }),
    },
    global: { plugins: [ElementPlus] },
    // The dialog is appended to body, outside this wrapper's own element.
    attachTo: document.body,
  })
  wrapper = mounted
  await flushPromises()
  return mounted
}

// ---- The document, not the wrapper --------------------------------------
// The dialog is teleported to <body>, so `wrapper.html()` never contains it, and
// a field's typed value is a DOM property that no markup serialisation includes.
// Every lookup below goes through `document`, and `documentHolds` reads both the
// markup and every form control's live value.

const q = <T extends Element = HTMLElement>(selector: string): T | null =>
  document.body.querySelector<T>(selector)

const dialogEl = () => q('.el-dialog.add-wifi-network-dialog')

const isOpen = (): boolean => {
  const overlay = dialogEl()?.closest('.el-overlay') as HTMLElement | null
  return !!overlay && overlay.style.display !== 'none'
}

const documentHolds = (value: string): boolean =>
  document.documentElement.outerHTML.includes(value) ||
  [...document.querySelectorAll<HTMLInputElement>('input, textarea, select')].some((el) =>
    el.value.includes(value),
  )

const textOf = (selector: string): string[] =>
  [...document.body.querySelectorAll(selector)].map((el) => el.textContent?.trim() ?? '')

const inputOf = (selector: string) => q<HTMLInputElement>(`${selector} input`)

const type = async (selector: string, value: string) => {
  const input = inputOf(selector)
  expect(input, `${selector} not rendered`).not.toBeNull()
  await new DOMWrapper(input!).setValue(value)
  await flushPromises()
}

const typeSsid = (value: string) => type('.ssid-input', value)
const typePassphrase = (value: string) => type('.passphrase-input', value)

const securityOptions = (): string[] => textOf('.el-select-dropdown__item')

const chooseSecurity = async (value: string) => {
  await new DOMWrapper(q('.security-select .el-select__wrapper')!).trigger('click')
  const item = [...document.body.querySelectorAll('.el-select-dropdown__item')].find(
    (el) => el.textContent?.trim() === value,
  )
  expect(item, `no security option ${value}`).toBeDefined()
  await new DOMWrapper(item!).trigger('click')
  await flushPromises()
}

const saveButton = () => q<HTMLButtonElement>('.save-button')!
const cancelButton = () => q<HTMLButtonElement>('.cancel-button')!

const clickSave = async () => {
  await new DOMWrapper(saveButton()).trigger('click')
  await flushPromises()
}

const fillValid = async (ssid = 'ZZ-SITE-B', passphrase = SECRET) => {
  await typeSsid(ssid)
  await typePassphrase(passphrase)
}

const sentBody = (call = 0) => postMock.mock.calls[call]![1] as Record<string, unknown>

const failureRegion = () => dialogEl()?.querySelector('.save-failure') ?? null
const toasts = () => textOf('.el-message')

const emitted = (name: string) => wrapper!.emitted(name) ?? []

describe('AddWiFiNetworkDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued once-values; a test that failed early must not feed the next.
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

  // ==================== The form ====================

  describe('the form', () => {
    it('offers exactly the five security values save accepts, defaulting to WPA2', async () => {
      await mountDialog()

      expect(securityOptions()).toEqual(['OPEN', 'WPA', 'WPA2', 'WPA/WPA2', 'WPA2/WPA3'])
      expect(q('.security-select')!.textContent).toContain('WPA2')
      expect(q('.security-select')!.textContent).not.toContain('WPA/WPA2')
    })

    it('renders the passphrase field only when security is not OPEN', async () => {
      await mountDialog()
      expect(inputOf('.passphrase-input')).not.toBeNull()

      await chooseSecurity('OPEN')
      expect(inputOf('.passphrase-input')).toBeNull()

      await chooseSecurity('WPA')
      expect(inputOf('.passphrase-input')).not.toBeNull()
    })

    it('clears the passphrase when security switches to OPEN', async () => {
      await mountDialog()
      await fillValid()
      expect(documentHolds(SECRET)).toBe(true)

      await chooseSecurity('OPEN')
      await chooseSecurity('WPA2')

      expect(inputOf('.passphrase-input')!.value).toBe('')
      expect(documentHolds(SECRET)).toBe(false)
    })

    it('has no priority, BSSID, save-config or interface field', async () => {
      await mountDialog()

      const text = dialogEl()!.textContent!.toLowerCase()
      for (const word of ['priority', 'bssid', 'save config', 'interface']) {
        expect(text).not.toContain(word)
      }
      expect(dialogEl()!.querySelectorAll('input')).toHaveLength(3)
    })
  })

  // ==================== Tier 1 ====================

  describe('Tier 1: blocks submission and names the reason', () => {
    const expectBlocked = async (errorSelector: string, message: string) => {
      expect(textOf(errorSelector)).toEqual([message])
      expect(saveButton().disabled).toBe(true)
      await clickSave()
      expect(api.post).not.toHaveBeenCalled()
    }

    it('an empty SSID', async () => {
      await mountDialog()
      await typePassphrase(SECRET)

      await expectBlocked('.ssid-error', strings.ssidRequired)
    })

    it('a 15-character CJK SSID, which is 45 bytes in UTF-8', async () => {
      await mountDialog()
      const ssid = '測'.repeat(15)
      expect(ssid.length).toBe(15)
      await fillValid(ssid)

      // 15 characters is inside any character limit; the bytes are what 802.11 counts.
      await expectBlocked('.ssid-error', 'The SSID is 45 bytes in UTF-8; the limit is 32 bytes.')
    })

    it('allows an SSID of exactly 32 bytes and blocks one of 33', async () => {
      await mountDialog()
      const atLimit = '測'.repeat(10) + 'ab' // 30 + 2 bytes, 12 characters
      await fillValid(atLimit)
      expect(textOf('.ssid-error')).toEqual([])
      expect(saveButton().disabled).toBe(false)

      await typeSsid('測'.repeat(11)) // 33 bytes, 11 characters
      await expectBlocked('.ssid-error', 'The SSID is 33 bytes in UTF-8; the limit is 32 bytes.')
    })

    it.each([
      ['a control character', 'ZZ\u0007SITE'],
      ['a no-break space', 'ZZ SITE'],
      ['a zero-width joiner', 'ZZ‍SITE'],
    ])('a non-printable character in the SSID: %s', async (_label, ssid) => {
      await mountDialog()
      await fillValid(ssid)

      await expectBlocked('.ssid-error', strings.ssidNonPrintable)
    })

    it('allows an ordinary space inside the SSID', async () => {
      await mountDialog()
      await fillValid('ZZ SITE B')

      expect(textOf('.ssid-error')).toEqual([])
      expect(saveButton().disabled).toBe(false)
    })

    it('a non-printable character in the passphrase', async () => {
      await mountDialog()
      await fillValid('ZZ-SITE-B', 'correct\thorse battery')

      await expectBlocked('.passphrase-error', strings.passphraseNonPrintable)
    })

    it.each([
      ['empty', ''],
      ['7 characters', 'a'.repeat(7)],
      ['64 characters', 'a'.repeat(64)],
    ])('a passphrase outside 8-63: %s', async (_label, passphrase) => {
      await mountDialog()
      await fillValid('ZZ-SITE-B', passphrase)

      await expectBlocked('.passphrase-error', strings.passphraseLength)
    })

    it.each([
      ['8 characters', 'a'.repeat(8)],
      ['63 characters', 'a'.repeat(63)],
      // 32 code points but 64 UTF-16 units: Talos counts code points, so this is legal.
      ['32 astral code points', '\u{1F600}'.repeat(32)],
    ])('a passphrase inside 8-63 counted in code points: %s', async (_label, passphrase) => {
      await mountDialog()
      await fillValid('ZZ-SITE-B', passphrase)

      expect(textOf('.passphrase-error')).toEqual([])
      expect(saveButton().disabled).toBe(false)
    })

    it('does not name the passphrase length in its message', async () => {
      await mountDialog()
      await fillValid('ZZ-SITE-B', 'a'.repeat(5))

      // I5: the length of the passphrase is a passphrase-related value.
      expect(dialogEl()!.textContent).not.toMatch(/\b5\b/)
    })

    it('any passphrase when security is OPEN', async () => {
      await mountDialog()
      await typeSsid('ZZ-OPEN')
      await chooseSecurity('OPEN')
      // Unreachable through the form, which clears the passphrase on the switch
      // and hides the field. Forced here to prove the rule still stands behind it.
      ;(wrapper!.vm as unknown as { passphrase: string }).passphrase = 'left-over'
      await flushPromises()

      await expectBlocked('.security-error', strings.passphraseOnOpen)
    })
  })

  // ==================== Tier 2 ====================

  describe('Tier 2: warns and still allows submission', () => {
    beforeEach(() => {
      postMock.mockResolvedValue({ data: successBody() } as never)
    })

    const expectWarnedAndSent = async (warningSelector: string, message: string) => {
      expect(textOf(warningSelector)).toEqual([message])
      // Distinct from a Tier 1 error: another element, another class, and no error beside it.
      expect(q(`${warningSelector}.form-error`)).toBeNull()
      expect(textOf('.form-error')).toEqual([])
      expect(saveButton().disabled).toBe(false)

      await clickSave()
      expect(api.post).toHaveBeenCalledTimes(1)
    }

    it('leading or trailing whitespace in the SSID, sent exactly as typed (I8)', async () => {
      await mountDialog()
      await fillValid(' ZZ-SITE-B ')

      await expectWarnedAndSent('.ssid-warning', strings.ssidWhitespace)
      expect(sentBody().ssid).toBe(' ZZ-SITE-B ')
    })

    it('non-ASCII printable characters in the passphrase, sent exactly as typed (I8)', async () => {
      await mountDialog()
      const passphrase = 'Pässwörter-Ünïcode'
      await fillValid('ZZ-SITE-B', passphrase)

      await expectWarnedAndSent('.passphrase-warning', strings.passphraseNonAscii)
      expect(sentBody().psk).toBe(passphrase)
    })

    it('an SSID already stored, whose passphrase the save will overwrite', async () => {
      await mountDialog()
      await fillValid('ZZ-SITE-A')

      await expectWarnedAndSent(
        '.ssid-warning',
        '"ZZ-SITE-A" is already stored on this gateway. Saving replaces its passphrase.',
      )
      expect(sentBody().ssid).toBe('ZZ-SITE-A')
    })

    it('matches a stored SSID exactly, with no case-folding (I8)', async () => {
      await mountDialog()
      await fillValid('zz-site-a')

      expect(textOf('.ssid-warning')).toEqual([])
    })
  })

  // ==================== Tier 3 ====================

  describe('Tier 3', () => {
    it('blocks a factory-default SSID and issues no request', async () => {
      await mountDialog()
      await fillValid('imaoffice1')

      expect(textOf('.ssid-error')).toEqual([
        '"imaoffice1" is the gateway\'s factory-default network and cannot be changed here.',
      ])
      // Blocked, not merely warned about as a duplicate.
      expect(textOf('.ssid-warning')).toEqual([])
      expect(saveButton().disabled).toBe(true)
      await clickSave()
      expect(api.post).not.toHaveBeenCalled()
    })
  })

  // ==================== No loaded list ====================

  describe('when the panel has no loaded list', () => {
    beforeEach(() => {
      postMock.mockResolvedValue({ data: successBody() } as never)
    })

    it('says the stored networks could not be checked', async () => {
      await mountDialog({ existingNetworksLoaded: false })

      expect(textOf('.stored-check-unavailable')).toEqual([strings.storedCheckUnavailable])
    })

    it('says nothing of the kind when a list has loaded', async () => {
      await mountDialog({ existingNetworksLoaded: true })

      expect(q('.stored-check-unavailable')).toBeNull()
    })

    it('fires neither the duplicate warning nor the factory-default block, and still submits', async () => {
      // The rows would trigger both checks if the flag were ignored.
      await mountDialog({ existingNetworks: STORED, existingNetworksLoaded: false })

      await fillValid('ZZ-SITE-A')
      expect(textOf('.ssid-warning')).toEqual([])

      await fillValid('imaoffice1')
      expect(textOf('.ssid-error')).toEqual([])
      expect(saveButton().disabled).toBe(false)

      // The gateway refuses a rescue SSID on its own; the form does not lock the operator out.
      await clickSave()
      expect(api.post).toHaveBeenCalledTimes(1)
      expect(sentBody().ssid).toBe('imaoffice1')
    })
  })

  // ==================== The request ====================

  describe('the request', () => {
    beforeEach(() => {
      postMock.mockResolvedValue({ data: successBody() } as never)
    })

    it('carries exactly ssid, security and psk, and no interface', async () => {
      await mountDialog()
      await fillValid('ZZ-SITE-B')
      await chooseSecurity('WPA/WPA2')
      await typePassphrase(SECRET)

      await clickSave()

      expect(api.post).toHaveBeenCalledWith(
        '/wifi/networks',
        { ssid: 'ZZ-SITE-B', security: 'WPA/WPA2', psk: SECRET },
        { timeout: 45000 },
      )
    })

    it('omits psk entirely for OPEN', async () => {
      await mountDialog()
      await typeSsid('ZZ-OPEN')
      await chooseSecurity('OPEN')

      await clickSave()

      expect(sentBody()).toEqual({ ssid: 'ZZ-OPEN', security: 'OPEN' })
      expect(sentBody()).not.toHaveProperty('psk')
    })

    it('disables the submit control while a request is in flight', async () => {
      let release: (value: unknown) => void = () => {}
      postMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      await mountDialog()
      await fillValid()

      await clickSave()
      expect(saveButton().disabled).toBe(true)
      expect(cancelButton().disabled).toBe(true)
      await clickSave()
      expect(api.post).toHaveBeenCalledTimes(1)

      // No close route is open while the outcome is pending.
      dialogEl()!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
      )
      await flushPromises()
      expect(isOpen()).toBe(true)

      release({ data: successBody() })
      await flushPromises()
      expect(isOpen()).toBe(false)
    })
  })

  // ==================== Outcomes ====================

  describe('outcomes', () => {
    const submitWith = async (outcome: () => void) => {
      outcome()
      await mountDialog()
      await fillValid()
      await clickSave()
    }

    const expectStaysOpenWithFailure = (title: string, detail: string) => {
      expect(isOpen()).toBe(true)
      expect(emitted('update:modelValue')).toEqual([])
      const region = failureRegion()
      expect(region, 'no failure region inside the dialog').not.toBeNull()
      expect(region!.querySelector('.el-alert__title')!.textContent!.trim()).toBe(title)
      expect(region!.querySelector('.el-alert__description')!.textContent!.trim()).toBe(detail)
      // Never a toast.
      expect(toasts()).toEqual([])
      expect(emitted('saved')).toEqual([])
      // Input preserved while the operator reads it.
      expect(inputOf('.ssid-input')!.value).toBe('ZZ-SITE-B')
      expect(inputOf('.passphrase-input')!.value).toBe(SECRET)
    }

    it('200 success, created: closes, emits saved, and toasts "added" naming the response', async () => {
      await submitWith(() => postMock.mockResolvedValueOnce({ data: successBody() } as never))

      expect(isOpen()).toBe(false)
      expect(emitted('update:modelValue')).toEqual([[false]])
      expect(emitted('saved')).toEqual([[]])
      expect(emitted('reload')).toEqual([])
      expect(toasts()).toEqual(['Added "ZZ-SITE-B" on wlan1. No connection was attempted.'])
      expect(q('.el-message--success')).not.toBeNull()
      // I4: the response's network_id reaches nothing.
      expect(documentHolds('7777')).toBe(false)
    })

    it('200 success, not created: closes and says the passphrase was updated', async () => {
      await submitWith(() =>
        postMock.mockResolvedValueOnce({ data: successBody({ created: false }) } as never),
      )

      expect(isOpen()).toBe(false)
      expect(emitted('saved')).toEqual([[]])
      expect(toasts()).toEqual([
        '"ZZ-SITE-B" already existed on wlan1; its passphrase was updated. No connection was attempted.',
      ])
    })

    it('200 with status "error": stays open with the server message, and asks for a reload', async () => {
      const message =
        'Failed to save WiFi network: wpa_cli returned FAIL The existing entry was left disabled and must be re-saved before use.'
      await submitWith(() =>
        postMock.mockResolvedValueOnce({
          data: successBody({
            status: 'error',
            message,
            network_id: null,
            applied_priority: null,
            created: false,
            saved: false,
            left_disabled: true,
          }),
        } as never),
      )

      // I6: a 2xx is not a successful save.
      expectStaysOpenWithFailure(strings.saveFailed, message)
      expect(emitted('reload')).toEqual([[]])
    })

    it('500 persistence failure: stored in session but not on disk, with save_error from the response root', async () => {
      await submitWith(() =>
        postMock.mockRejectedValueOnce(
          httpError(
            500,
            successBody({
              status: 'error',
              message: 'Network was configured but could not be persisted to disk. EROFS',
              saved: false,
              save_error: 'EROFS: read-only file system',
              note: 'The entry exists in the running wpa_supplicant session.',
              // Not a field Talos sends on this path. Present so reading it instead of the root would show.
              detail: 'NESTED-DETAIL-NOT-THE-BODY',
            }),
          ),
        ),
      )

      expectStaysOpenWithFailure(strings.notPersisted, 'EROFS: read-only file system')
      expect(documentHolds('NESTED-DETAIL-NOT-THE-BODY')).toBe(false)
      expect(emitted('reload')).toEqual([[]])
    })

    it('any other 500: the body message, claiming neither success nor failure', async () => {
      await submitWith(() =>
        postMock.mockRejectedValueOnce(
          httpError(500, {
            status: 'error',
            message: 'An unexpected error occurred',
            detail: null,
          }),
        ),
      )

      expectStaysOpenWithFailure(strings.outcomeUnknown, 'An unexpected error occurred')
      const text = failureRegion()!.textContent!
      expect(text).not.toContain(strings.notPersisted)
      expect(text).not.toContain(strings.saveFailed)
      expect(emitted('reload')).toEqual([[]])
    })

    it('400: the detail string, and no reload', async () => {
      const detail =
        "'ZZ-SITE-B' is an 802.1X/Enterprise network (scan flags: [WPA2-EAP-CCMP][ESS])."
      await submitWith(() =>
        postMock.mockRejectedValueOnce(httpError(400, { detail, message: 'NOT-THE-DETAIL' })),
      )

      expectStaysOpenWithFailure(strings.refused, detail)
      expect(emitted('reload')).toEqual([])
    })

    it('422: every error as "field: message", and no reload', async () => {
      await submitWith(() =>
        postMock.mockRejectedValueOnce(
          httpError(422, {
            status: 'error',
            message: 'Request validation failed',
            errors: [
              {
                field: 'body.ssid',
                message: 'String should have at most 32 characters',
                type: 'string_too_long',
              },
              {
                field: 'body.priority',
                message: 'Extra inputs are not permitted',
                type: 'extra_forbidden',
              },
            ],
          }),
        ),
      )

      expectStaysOpenWithFailure(
        strings.invalid,
        'body.ssid: String should have at most 32 characters; body.priority: Extra inputs are not permitted',
      )
      expect(emitted('reload')).toEqual([])
    })

    it('422 with no errors listed: falls back to the body message', async () => {
      await submitWith(() =>
        postMock.mockRejectedValueOnce(
          httpError(422, { status: 'error', message: 'Request validation failed', errors: [] }),
        ),
      )

      expectStaysOpenWithFailure(strings.invalid, 'Request validation failed')
    })

    it('client timeout: may have completed, check the list; reloads (I7)', async () => {
      await submitWith(() => postMock.mockRejectedValueOnce(timeoutError()))

      expectStaysOpenWithFailure(strings.timedOut, strings.timedOutDetail)
      expect(emitted('reload')).toEqual([[]])
      // Claims neither success nor failure.
      expect(failureRegion()!.textContent).not.toContain(strings.saveFailed)
      expect(failureRegion()!.querySelector('.el-alert--warning')).not.toBeNull()
    })

    it('clears the failure region on the next attempt', async () => {
      postMock.mockRejectedValueOnce(timeoutError())
      postMock.mockResolvedValueOnce({ data: successBody() } as never)
      await mountDialog()
      await fillValid()
      await clickSave()
      expect(failureRegion()).not.toBeNull()

      await clickSave()
      expect(failureRegion()).toBeNull()
      expect(isOpen()).toBe(false)
    })
  })

  // ==================== Message placement ====================

  describe('message placement', () => {
    it('a Tier 2 warning leaves submit enabled while a Tier 1 error disables it', async () => {
      await mountDialog()
      await fillValid(' ZZ-SITE-B')
      expect(q('.ssid-warning')).not.toBeNull()
      expect(saveButton().disabled).toBe(false)

      await typePassphrase('short')
      expect(q('.ssid-warning')).not.toBeNull()
      expect(q('.passphrase-error')).not.toBeNull()
      expect(saveButton().disabled).toBe(true)
    })

    it.each([
      ['200 error body', () => ({ data: successBody({ status: 'error', message: 'x' }) }), true],
      ['500', () => httpError(500, { status: 'error', message: 'x' }), false],
      ['400', () => httpError(400, { detail: 'x' }), false],
      ['422', () => httpError(422, { status: 'error', message: 'x', errors: [] }), false],
      ['timeout', () => timeoutError(), false],
    ])('%s renders inside the dialog and not as a toast', async (_label, outcome, resolves) => {
      if (resolves) postMock.mockResolvedValueOnce(outcome() as never)
      else postMock.mockRejectedValueOnce(outcome())
      await mountDialog()
      await fillValid()
      await clickSave()

      expect(dialogEl()!.contains(failureRegion())).toBe(true)
      expect(document.body.querySelectorAll('.el-message')).toHaveLength(0)
      expect(isOpen()).toBe(true)
    })

    it('success is a toast, and the dialog closes', async () => {
      postMock.mockResolvedValueOnce({ data: successBody() } as never)
      await mountDialog()
      await fillValid()
      await clickSave()

      expect(document.body.querySelectorAll('.el-message--success')).toHaveLength(1)
      expect(failureRegion()).toBeNull()
      expect(isOpen()).toBe(false)
    })
  })

  // ==================== I9 ====================

  describe('I9: the passphrase', () => {
    let consoleSpies: ReturnType<typeof vi.spyOn>[] = []

    beforeEach(() => {
      consoleSpies = (['log', 'info', 'debug', 'warn', 'error'] as const).map((level) =>
        vi.spyOn(console, level),
      )
    })

    afterEach(() => {
      consoleSpies.forEach((spy) => spy.mockRestore())
    })

    const passphraseInState = () => (wrapper!.vm as unknown as { passphrase: string }).passphrase

    /** Typed, and visible to `documentHolds` -- so its absence later means something. */
    const typeAndProveVisible = async () => {
      await fillValid()
      expect(passphraseInState()).toBe(SECRET)
      expect(documentHolds(SECRET), 'the check cannot see a passphrase that is there').toBe(true)
      // A field's value is not text: no markup carries it, even while typed.
      expect(document.documentElement.outerHTML).not.toContain(SECRET)
      expect(document.body.textContent).not.toContain(SECRET)
    }

    const expectGone = () => {
      expect(isOpen()).toBe(false)
      expect(passphraseInState()).toBe('')
      expect(documentHolds(SECRET)).toBe(false)
    }

    it('is cleared on cancel', async () => {
      await mountDialog()
      await typeAndProveVisible()

      await new DOMWrapper(cancelButton()).trigger('click')
      await flushPromises()

      expectGone()
    })

    it('is cleared on escape', async () => {
      await mountDialog()
      await typeAndProveVisible()

      dialogEl()!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
      )
      await flushPromises()

      expectGone()
    })

    it('is cleared on an overlay click', async () => {
      await mountDialog()
      await typeAndProveVisible()

      const overlay = q('.el-overlay-dialog')!
      for (const kind of ['mousedown', 'mouseup', 'click']) {
        overlay.dispatchEvent(new MouseEvent(kind, { bubbles: true }))
      }
      await flushPromises()

      expectGone()
    })

    it('is cleared by the header close button', async () => {
      await mountDialog()
      await typeAndProveVisible()

      await new DOMWrapper(q('.el-dialog__headerbtn')!).trigger('click')
      await flushPromises()

      expectGone()
    })

    it('is cleared on success', async () => {
      postMock.mockResolvedValueOnce({ data: successBody() } as never)
      await mountDialog()
      await typeAndProveVisible()

      await clickSave()

      expectGone()
    })

    it('is cleared when the parent closes the dialog', async () => {
      await mountDialog()
      await typeAndProveVisible()

      await wrapper!.setProps({ modelValue: false })
      await flushPromises()

      expectGone()
    })

    it('reaches no log line, on success or on any failure', async () => {
      postMock.mockRejectedValueOnce(httpError(500, { status: 'error', message: 'x' }))
      postMock.mockRejectedValueOnce(timeoutError())
      postMock.mockResolvedValueOnce({ data: successBody() } as never)
      await mountDialog()
      await fillValid()
      await clickSave()
      await clickSave()
      await clickSave()

      const printed = consoleSpies
        .flatMap((spy) => spy.mock.calls)
        .map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
        .join(' ')
      expect(printed).not.toContain(SECRET)
    })
  })

  // ==================== i18n ====================

  describe('every user-visible string comes from the message files', () => {
    /** Every English string that differs from its Traditional Chinese counterpart. */
    const englishOnly = () =>
      (Object.keys(strings) as (keyof typeof strings)[])
        .filter((key) => strings[key] !== zhTW.wifi.addNetwork[key])
        .map((key) => strings[key])

    it('renders the Traditional Chinese messages under that locale, with no English left behind', async () => {
      useUIStore().setLanguage('zh-TW')
      await mountDialog({ existingNetworksLoaded: false })
      await fillValid(' ZZ-SITE-B', 'Pässwörter')
      await chooseSecurity('WPA')

      const zh = zhTW.wifi.addNetwork
      const text = dialogEl()!.textContent!
      for (const label of [zh.title, zh.intro, zh.ssid, zh.security, zh.passphrase, zh.submit]) {
        expect(text).toContain(label)
      }
      expect(text).toContain(zhTW.common.cancel)
      expect(text).toContain(zh.storedCheckUnavailable)
      expect(text).toContain(zh.ssidWhitespace)
      expect(text).toContain(zh.passphraseNonAscii)

      for (const label of [...englishOnly(), en.common.cancel]) {
        // Tokens are filled at the call site, so compare the text before the first one.
        const fixed = label.split('{')[0]!
        expect(text, `English "${label}" survived the switch to zh-TW`).not.toContain(fixed)
      }
    })

    it('states a failure in the active locale', async () => {
      useUIStore().setLanguage('zh-TW')
      postMock.mockRejectedValueOnce(timeoutError())
      await mountDialog()
      await fillValid()
      await clickSave()

      expect(failureRegion()!.textContent).toContain(zhTW.wifi.addNetwork.timedOut)
      expect(failureRegion()!.textContent).toContain(zhTW.wifi.addNetwork.timedOutDetail)
      expect(failureRegion()!.textContent).not.toContain(strings.timedOut)
    })

    it('declares the same keys in both locales', () => {
      expect(Object.keys(zhTW.wifi.addNetwork).sort()).toEqual(
        Object.keys(en.wifi.addNetwork).sort(),
      )
      expect(Object.keys(en.wifi.addNetwork).length).toBeGreaterThan(0)
    })
  })

  // ==================== An existing entry saved as OPEN ====================
  //
  // Talos writes key_mgmt NONE and clears the psk, so the passphrase is removed,
  // not updated. Both messages branch on the security chosen in the dialog.

  describe('an existing entry saved as OPEN', () => {
    /** The non-OPEN wording's fixed part: the claim that must not be made for OPEN. */
    const PASSPHRASE_UPDATED = 'its passphrase was updated'
    const PASSPHRASE_REPLACED = 'Saving replaces its passphrase'

    it('created: false with OPEN says it became open and its passphrase was removed', async () => {
      postMock.mockResolvedValueOnce({
        data: successBody({ ssid: 'ZZ-SITE-A', created: false }),
      } as never)
      await mountDialog()
      await typeSsid('ZZ-SITE-A')
      await chooseSecurity('OPEN')
      await clickSave()

      expect(sentBody()).toEqual({ ssid: 'ZZ-SITE-A', security: 'OPEN' })
      expect(toasts()).toEqual([
        '"ZZ-SITE-A" already existed on wlan1; it was changed to an open network and its stored passphrase was removed. No connection was attempted.',
      ])
      expect(document.body.textContent).not.toContain(PASSPHRASE_UPDATED)
    })

    it('created: false with WPA2 still says the passphrase was updated', async () => {
      postMock.mockResolvedValueOnce({
        data: successBody({ ssid: 'ZZ-SITE-A', created: false }),
      } as never)
      await mountDialog()
      await fillValid('ZZ-SITE-A')
      await clickSave()

      expect(toasts()).toEqual([
        '"ZZ-SITE-A" already existed on wlan1; its passphrase was updated. No connection was attempted.',
      ])
      expect(document.body.textContent).not.toContain('changed to an open network')
    })

    it('names the security that was sent, not one chosen while the save was in flight', async () => {
      let release: (value: unknown) => void = () => {}
      postMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      await mountDialog()
      await typeSsid('ZZ-SITE-A')
      await chooseSecurity('OPEN')
      await clickSave()

      // The form stays editable; what counts is what was saved.
      await chooseSecurity('WPA2')
      release({ data: successBody({ ssid: 'ZZ-SITE-A', created: false }) })
      await flushPromises()

      expect(toasts()[0]).toContain('changed to an open network')
      expect(toasts()[0]).not.toContain(PASSPHRASE_UPDATED)
    })

    it('warns that saving makes a stored SSID open and removes its passphrase, and follows the security select', async () => {
      await mountDialog()
      await typeSsid('ZZ-SITE-A')
      expect(textOf('.ssid-warning')).toEqual([
        '"ZZ-SITE-A" is already stored on this gateway. Saving replaces its passphrase.',
      ])

      await chooseSecurity('OPEN')
      expect(textOf('.ssid-warning')).toEqual([
        '"ZZ-SITE-A" is already stored on this gateway. Saving changes it to an open network and removes its passphrase.',
      ])
      expect(dialogEl()!.textContent).not.toContain(PASSPHRASE_REPLACED)
      // Still a Tier 2 warning: submission stays allowed.
      expect(saveButton().disabled).toBe(false)

      await chooseSecurity('WPA2')
      expect(textOf('.ssid-warning')).toEqual([
        '"ZZ-SITE-A" is already stored on this gateway. Saving replaces its passphrase.',
      ])
    })

    it('declares all four existing-entry messages in both locales', () => {
      for (const key of [
        'savedUpdated',
        'savedUpdatedOpen',
        'ssidExists',
        'ssidExistsOpen',
      ] as const) {
        expect(en.wifi.addNetwork[key], `en ${key}`).toMatch(/\S/)
        expect(zhTW.wifi.addNetwork[key], `zh-TW ${key}`).toMatch(/\S/)
        expect(zhTW.wifi.addNetwork[key]).not.toBe(en.wifi.addNetwork[key])
      }
      expect(Object.keys(zhTW.wifi.addNetwork).sort()).toEqual(
        Object.keys(en.wifi.addNetwork).sort(),
      )
    })
  })
})
