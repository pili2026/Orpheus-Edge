import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMatchMedia, type MatchMediaStub } from '@/test-utils/matchMedia'

// useBreakpoint is a module singleton, so every test imports a fresh copy.
async function freshUseBreakpoint() {
  vi.resetModules()
  return (await import('@/composables/useBreakpoint')).useBreakpoint
}

let stub: MatchMediaStub | null = null

function install(width: number): MatchMediaStub {
  stub = installMatchMedia(width)
  return stub
}

afterEach(() => {
  stub?.uninstall()
  stub = null
})

describe('useBreakpoint', () => {
  it.each([
    [390, 'xs'],
    [767, 'xs'],
    [767.5, 'xs'],
    [768, 'sm'],
    [820, 'sm'],
    [991.5, 'sm'],
    [992, 'md'],
    [1199, 'md'],
    [1200, 'lg'],
    [1366, 'lg'],
    [1920, 'lg'],
    [2560, 'lg'],
  ] as const)('resolves %spx to %s', async (width, expected) => {
    install(width)
    const useBreakpoint = await freshUseBreakpoint()

    expect(useBreakpoint().tier.value).toBe(expected)
  })

  it('follows the viewport up through 768, 992 and 1200', async () => {
    const media = install(767)
    const { tier } = (await freshUseBreakpoint())()

    const seen = [tier.value]
    for (const width of [768, 991, 992, 1199, 1200]) {
      media.setWidth(width)
      seen.push(tier.value)
    }

    expect(seen).toEqual(['xs', 'sm', 'sm', 'md', 'md', 'lg'])
  })

  it('follows the viewport down through 1200, 992 and 768', async () => {
    const media = install(1200)
    const { tier } = (await freshUseBreakpoint())()

    const seen = [tier.value]
    for (const width of [1199, 992, 991, 768, 767]) {
      media.setWidth(width)
      seen.push(tier.value)
    }

    expect(seen).toEqual(['lg', 'md', 'md', 'sm', 'sm', 'xs'])
  })

  it('jumps straight across several tiers in one change', async () => {
    const media = install(390)
    const { tier } = (await freshUseBreakpoint())()

    media.setWidth(1366)
    expect(tier.value).toBe('lg')
    media.setWidth(390)
    expect(tier.value).toBe('xs')
  })

  it('shares one tier between callers', async () => {
    const media = install(390)
    const useBreakpoint = await freshUseBreakpoint()
    const first = useBreakpoint().tier
    const second = useBreakpoint().tier

    media.setWidth(1000)

    expect(first.value).toBe('md')
    expect(second.value).toBe('md')
  })

  it('exposes tier as readonly', async () => {
    install(390)
    const { tier } = (await freshUseBreakpoint())()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    ;(tier as { value: string }).value = 'lg'

    expect(tier.value).toBe('xs')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('throws, naming the cause, when matchMedia is unavailable', async () => {
    expect(typeof window.matchMedia).toBe('undefined')
    const useBreakpoint = await freshUseBreakpoint()

    expect(() => useBreakpoint()).toThrow(/window\.matchMedia is unavailable/)
  })

  it('does not throw on import alone', async () => {
    expect(typeof window.matchMedia).toBe('undefined')

    await expect(freshUseBreakpoint()).resolves.toBeTypeOf('function')
  })

  it('stays uninitialised after a failed first call', async () => {
    const useBreakpoint = await freshUseBreakpoint()
    expect(() => useBreakpoint()).toThrow()

    install(1000)

    expect(useBreakpoint().tier.value).toBe('md')
  })
})
