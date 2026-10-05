/**
 * Controllable window.matchMedia stub for jsdom, which has none.
 *
 * Tests install it explicitly; it is deliberately not registered in vitest setupFiles,
 * so code that needs matchMedia fails loudly in any test that forgot to install it.
 * Only `(min-width: Npx)` queries are understood; anything else throws.
 */

export interface MatchMediaStub {
  /** Change the simulated viewport width and fire `change` on every query whose result flips. */
  setWidth(width: number): void
  /** Restore whatever window.matchMedia was before install. */
  uninstall(): void
}

type ChangeListener = (event: MediaQueryListEvent) => void

const MIN_WIDTH = /^\(min-width:\s*(\d+(?:\.\d+)?)px\)$/

export function installMatchMedia(initialWidth: number): MatchMediaStub {
  let width = initialWidth
  const lists: Array<{ list: MediaQueryList; minWidth: number; listeners: Set<ChangeListener> }> =
    []

  const hadOwn = Object.prototype.hasOwnProperty.call(window, 'matchMedia')
  const previous = window.matchMedia

  const matchMedia = (query: string): MediaQueryList => {
    const parsed = MIN_WIDTH.exec(query.trim())
    if (!parsed) throw new Error(`matchMedia stub: unsupported query "${query}"`)
    const minWidth = Number(parsed[1])
    const listeners = new Set<ChangeListener>()

    const list = {
      media: query,
      get matches() {
        return width >= minWidth
      },
      onchange: null as ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null,
      addEventListener: (type: string, listener: ChangeListener) => {
        if (type === 'change') listeners.add(listener)
      },
      removeEventListener: (type: string, listener: ChangeListener) => {
        if (type === 'change') listeners.delete(listener)
      },
      addListener: (listener: ChangeListener) => listeners.add(listener),
      removeListener: (listener: ChangeListener) => listeners.delete(listener),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList

    lists.push({ list, minWidth, listeners })
    return list
  }

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  })

  return {
    setWidth(next: number) {
      const before = lists.map(({ minWidth }) => width >= minWidth)
      width = next
      lists.forEach(({ list, minWidth, listeners }, i) => {
        const matches = width >= minWidth
        if (matches === before[i]) return
        const event = { matches, media: list.media } as MediaQueryListEvent
        listeners.forEach((listener) => listener(event))
        list.onchange?.call(list, event)
      })
    },
    uninstall() {
      if (hadOwn) {
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          writable: true,
          value: previous,
        })
      } else {
        delete (window as { matchMedia?: unknown }).matchMedia
      }
    },
  }
}
