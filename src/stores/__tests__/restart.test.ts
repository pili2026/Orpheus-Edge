import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRestartStore } from '@/stores/restart'

describe('restart store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts clean with no banner', () => {
    const store = useRestartStore()
    expect(store.hasPending).toBe(false)
    expect(store.showBanner).toBe(false)
    expect(store.snapshotPending()).toEqual([])
  })

  it('markPending issues a fresh monotonic id every time and shows the banner', () => {
    const store = useRestartStore()
    store.markPending('modbus')
    const first = store.pendingScopes.get('modbus')
    store.markPending('modbus')
    const second = store.pendingScopes.get('modbus')

    expect(first).toBeTypeOf('number')
    expect(second).toBeGreaterThan(first!)
    expect(store.hasPending).toBe(true)
    expect(store.showBanner).toBe(true)
  })

  it('dismiss hides the banner but keeps pending state; the next mark shows it again', () => {
    const store = useRestartStore()
    store.markPending('system')
    store.dismiss()

    expect(store.showBanner).toBe(false)
    expect(store.hasPending).toBe(true)
    expect(store.snapshotPending()).toEqual([['system', expect.any(Number)]])

    store.markPending('instance')
    expect(store.showBanner).toBe(true)
  })

  it('snapshotPending returns [scope, markId] pairs for every pending scope', () => {
    const store = useRestartStore()
    store.markPending('modbus')
    store.markPending('instance')
    const snapshot = store.snapshotPending()

    expect(snapshot).toHaveLength(2)
    expect(snapshot).toEqual(
      expect.arrayContaining([
        ['modbus', store.pendingScopes.get('modbus')],
        ['instance', store.pendingScopes.get('instance')],
      ]),
    )
  })

  it('clearMatching clears only scopes whose current id still matches the snapshot', () => {
    const store = useRestartStore()
    store.markPending('modbus')
    store.markPending('system')
    const snapshot = store.snapshotPending()

    // re-marked after the snapshot: newer id, must survive
    store.markPending('modbus')
    // marked after the snapshot: not in it at all, must survive
    store.markPending('instance')

    store.clearMatching(snapshot)

    expect(store.pendingScopes.has('system')).toBe(false)
    expect(store.pendingScopes.has('modbus')).toBe(true)
    expect(store.pendingScopes.has('instance')).toBe(true)
    expect(store.showBanner).toBe(true)
  })

  it('clearMatching with an empty snapshot clears nothing', () => {
    const store = useRestartStore()
    const snapshot = store.snapshotPending()
    store.markPending('modbus')
    store.clearMatching(snapshot)
    expect(store.hasPending).toBe(true)
  })

  it('clearing every pending scope removes the banner', () => {
    const store = useRestartStore()
    store.markPending('modbus')
    store.clearMatching(store.snapshotPending())
    expect(store.hasPending).toBe(false)
    expect(store.showBanner).toBe(false)
  })
})
