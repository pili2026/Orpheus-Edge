/**
 * Layout tier, driven by matchMedia and aligned with Element Plus's breakpoints
 * (sm >= 768, md >= 992, lg >= 1200; xl >= 1920 counts as lg).
 */
import { readonly, ref, type Ref } from 'vue'

export type BreakpointTier = 'xs' | 'sm' | 'md' | 'lg'

// min-width queries only: every width, fractional ones included, lands in exactly
// one tier. A max-width form (e.g. 767px) leaves a gap at 767.5px under zoom.
const TIER_QUERIES: ReadonlyArray<readonly [BreakpointTier, string]> = [
  ['sm', '(min-width: 768px)'],
  ['md', '(min-width: 992px)'],
  ['lg', '(min-width: 1200px)'],
]

let tier: Ref<BreakpointTier> | null = null

function createTier(): Ref<BreakpointTier> {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    throw new Error(
      'useBreakpoint: window.matchMedia is unavailable, so the layout tier cannot be determined',
    )
  }

  const lists = TIER_QUERIES.map(([name, query]) => [name, window.matchMedia(query)] as const)

  // The tier is the highest query that matches; none matching means xs.
  const current = (): BreakpointTier => {
    let result: BreakpointTier = 'xs'
    for (const [name, list] of lists) {
      if (list.matches) result = name
    }
    return result
  }

  const state = ref<BreakpointTier>(current())
  for (const [, list] of lists) {
    list.addEventListener('change', () => {
      state.value = current()
    })
  }
  return state
}

/**
 * Module singleton: the media queries are created on the first call, not at import,
 * so importing this module never throws. A failed first call leaves it uninitialised.
 */
export function useBreakpoint(): { tier: Readonly<Ref<BreakpointTier>> } {
  if (!tier) tier = createTier()
  return { tier: readonly(tier) }
}
