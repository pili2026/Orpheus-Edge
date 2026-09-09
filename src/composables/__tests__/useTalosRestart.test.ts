import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useTalosRestart } from '@/composables/useTalosRestart'
import { useRestartStore } from '@/stores/restart'

const { axiosGet, axiosPost, confirm, elMessage } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  confirm: vi.fn(),
  elMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock('axios', () => ({ default: { get: axiosGet, post: axiosPost } }))
vi.mock('element-plus', () => ({ ElMessage: elMessage, ElMessageBox: { confirm } }))

type RestartApi = ReturnType<typeof useTalosRestart>

/**
 * Stands in for a config view: the composable is used inside a component, and
 * unmounting the component is how a user navigates away from that screen.
 */
const mountView = (scope: Parameters<typeof useTalosRestart>[0]) => {
  let api!: RestartApi
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useTalosRestart(scope)
        return () => h('div')
      },
    }),
  )
  return { api, wrapper }
}

describe('useTalosRestart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    confirm.mockRejectedValue('cancel')
    axiosGet.mockResolvedValue({ data: {} })
    axiosPost.mockResolvedValue({ data: { success: true } })
  })

  it('delegates every action to the shared store with its own scope', async () => {
    const { api } = mountView('instance')
    const store = useRestartStore()

    api.markPending()
    expect(store.pendingScopeList).toEqual(['instance'])

    api.promptRestart()
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(1)

    api.confirmRestart()
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(2)

    await api.restartNow()
    expect(axiosPost).toHaveBeenCalledWith('/api/provision/service/restart')

    api.cancelRestartFlow()
    expect(store.isRestarting).toBe(false)

    api.dismissAlert()
    expect(store.hasPending).toBe(false)
  })

  it('exposes the store state, not a private copy', () => {
    const { api } = mountView('modbus')
    const store = useRestartStore()

    store.markPending('modbus')
    expect(api.hasPending.value).toBe(true)

    store.restartProgress = 42
    expect(api.restartProgress.value).toBe(42)
  })

  it('a scope marked on one screen is visible from another', () => {
    const modbus = mountView('modbus')
    const system = mountView('system')

    modbus.api.markPending()

    expect(system.api.hasPending.value).toBe(true)
    expect(useRestartStore().pendingScopeList).toEqual(['modbus'])
  })

  it('pending state survives leaving and re-entering the screen', () => {
    const first = mountView('modbus')
    first.api.markPending()
    first.wrapper.unmount()

    const second = mountView('modbus')

    expect(second.api.hasPending.value).toBe(true)
  })

  it('an in-flight restart is not cancelled by navigating away', async () => {
    vi.useFakeTimers()
    try {
      const { api, wrapper } = mountView('modbus')
      await api.restartNow()
      await flushPromises()
      expect(api.showRestartingDialog.value).toBe(true)

      wrapper.unmount()
      await vi.advanceTimersByTimeAsync(3000)

      // the poll still runs: the restart belongs to the app, not to the screen
      expect(axiosGet).toHaveBeenCalledWith('/api/provision/config', { timeout: 2000 })
    } finally {
      vi.useRealTimers()
    }
  })
})
