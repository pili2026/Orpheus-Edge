import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import zhTW from '@/locales/zh-TW'
import { useConfigStore, type ModbusConfig } from '@/stores/modbus_config'

const { axiosGet, axiosPost, axiosDelete, elMessage } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  axiosDelete: vi.fn(),
  elMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

type FakeAxiosError = Error & { isAxiosError: true; response?: { data?: { detail?: unknown } } }

const axiosError = (detail?: unknown): FakeAxiosError =>
  Object.assign(new Error('request failed'), {
    isAxiosError: true as const,
    response: { data: { detail } },
  })

vi.mock('axios', () => ({
  default: {
    get: axiosGet,
    post: axiosPost,
    delete: axiosDelete,
    isAxiosError: (err: unknown) => !!(err as FakeAxiosError | null)?.isAxiosError,
  },
}))
vi.mock('element-plus', () => ({ ElMessage: elMessage }))

const CONFIG: ModbusConfig = {
  metadata: {
    generation: 7,
    source: 'manual',
    last_modified: '2026-01-02T03:04:05Z',
    last_modified_by: 'web-user',
    checksum: 'abcdef0123456789deadbeef',
    applied_at: null,
    cloud_sync_id: null,
  },
  buses: {
    bus0: { name: 'bus0', port: '/dev/ttyUSB0', baudrate: 9600, timeout: 1 },
    bus1: { name: 'bus1', port: '/dev/ttyUSB1', baudrate: 19200, timeout: 0.5 },
  },
  devices: [
    {
      model: 'TECO_VFD',
      type: 'vfd',
      model_file: 'teco.yaml',
      slave_id: 3,
      bus: 'bus0',
      modes: { name: 'Pump A' },
    },
  ],
}

const clone = (): ModbusConfig => JSON.parse(JSON.stringify(CONFIG)) as ModbusConfig

describe('modbus config store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    axiosGet.mockResolvedValue({ data: clone() })
    axiosPost.mockResolvedValue({ data: {} })
    axiosDelete.mockResolvedValue({ data: {} })
  })

  describe('fetchConfig', () => {
    it('populates config, metadata, buses, devices and busList', async () => {
      const store = useConfigStore()

      await store.fetchConfig()

      expect(axiosGet).toHaveBeenCalledWith('/api/config/modbus')
      expect(store.metadata?.generation).toBe(7)
      expect(Object.keys(store.buses)).toEqual(['bus0', 'bus1'])
      expect(store.devices).toHaveLength(1)
      expect(store.isLoading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('injects the record key as the bus name in busList', async () => {
      const store = useConfigStore()
      axiosGet.mockResolvedValueOnce({
        data: {
          ...clone(),
          // the server key is authoritative, not the embedded name
          buses: { busX: { name: 'stale', port: '/dev/ttyUSB9', baudrate: 9600, timeout: 1 } },
        },
      })

      await store.fetchConfig()

      expect(store.busList).toEqual([
        { name: 'busX', port: '/dev/ttyUSB9', baudrate: 9600, timeout: 1 },
      ])
    })

    it('surfaces the server detail, records the error and rethrows', async () => {
      const store = useConfigStore()
      axiosGet.mockRejectedValueOnce(axiosError('config file is unreadable'))

      await expect(store.fetchConfig()).rejects.toThrow()

      expect(elMessage.error).toHaveBeenCalledWith('config file is unreadable')
      expect(store.error).toBe('config file is unreadable')
      expect(store.isLoading).toBe(false)
    })

    it('falls back to the localized message when no detail is present', async () => {
      const store = useConfigStore()
      axiosGet.mockRejectedValueOnce(axiosError(undefined))

      await expect(store.fetchConfig()).rejects.toThrow()

      expect(elMessage.error).toHaveBeenCalledWith(zhTW.config.common.loadFailed)
    })
  })

  describe('fetchMetadata', () => {
    it('replaces only the metadata of an already-loaded config', async () => {
      const store = useConfigStore()
      await store.fetchConfig()

      const metadata = { ...clone().metadata, generation: 8 }
      axiosGet.mockResolvedValueOnce({ data: { metadata } })

      await expect(store.fetchMetadata()).resolves.toEqual(metadata)

      expect(axiosGet).toHaveBeenLastCalledWith('/api/config/modbus/metadata')
      expect(store.metadata?.generation).toBe(8)
      expect(store.devices).toHaveLength(1)
    })
  })

  describe('createOrUpdateDevice', () => {
    it('posts the device with X-User-Email and refetches', async () => {
      const store = useConfigStore()
      const device = clone().devices[0]!

      await store.createOrUpdateDevice(device, 'web-user')

      expect(axiosPost).toHaveBeenCalledWith('/api/config/modbus/devices', device, {
        headers: { 'X-User-Email': 'web-user' },
      })
      expect(axiosGet).toHaveBeenCalledWith('/api/config/modbus')
      expect(elMessage.success).toHaveBeenCalledWith(zhTW.config.device.saveSuccess)
    })

    it('omits the header when no user is supplied', async () => {
      const store = useConfigStore()

      await store.createOrUpdateDevice(clone().devices[0]!)

      expect(axiosPost).toHaveBeenCalledWith('/api/config/modbus/devices', expect.anything(), {
        headers: {},
      })
    })

    it('toasts the server detail and rethrows without refetching', async () => {
      const store = useConfigStore()
      axiosPost.mockRejectedValueOnce(axiosError('slave_id 3 already used on bus0'))

      await expect(store.createOrUpdateDevice(clone().devices[0]!, 'web-user')).rejects.toThrow()

      expect(elMessage.error).toHaveBeenCalledWith('slave_id 3 already used on bus0')
      expect(axiosGet).not.toHaveBeenCalled()
      expect(store.isLoading).toBe(false)
    })
  })

  describe('deleteDevice', () => {
    it('deletes by model and slave id, then refetches', async () => {
      const store = useConfigStore()

      await store.deleteDevice('TECO_VFD', 3, 'web-user')

      expect(axiosDelete).toHaveBeenCalledWith('/api/config/modbus/devices/TECO_VFD/3', {
        headers: { 'X-User-Email': 'web-user' },
      })
      expect(axiosGet).toHaveBeenCalledWith('/api/config/modbus')
      expect(elMessage.success).toHaveBeenCalledWith(zhTW.config.device.deleteSuccess)
    })

    it('toasts the server detail and rethrows', async () => {
      const store = useConfigStore()
      axiosDelete.mockRejectedValueOnce(axiosError('device is referenced by an instance'))

      await expect(store.deleteDevice('TECO_VFD', 3, 'web-user')).rejects.toThrow()

      expect(elMessage.error).toHaveBeenCalledWith('device is referenced by an instance')
      expect(axiosGet).not.toHaveBeenCalled()
    })
  })

  describe('createOrUpdateBus', () => {
    it('posts the bus body to the named bus route, then refetches', async () => {
      const store = useConfigStore()
      const bus = { port: '/dev/ttyUSB0', baudrate: 9600, timeout: 1 }

      await store.createOrUpdateBus('bus0', bus, 'web-user')

      expect(axiosPost).toHaveBeenCalledWith('/api/config/modbus/buses/bus0', bus, {
        headers: { 'X-User-Email': 'web-user' },
      })
      expect(axiosGet).toHaveBeenCalledWith('/api/config/modbus')
      expect(elMessage.success).toHaveBeenCalledWith(zhTW.config.bus.saveSuccess)
    })

    it('toasts the server detail and rethrows', async () => {
      const store = useConfigStore()
      axiosPost.mockRejectedValueOnce(axiosError('port already claimed'))

      await expect(
        store.createOrUpdateBus('bus0', { port: 'p', baudrate: 9600, timeout: 1 }, 'web-user'),
      ).rejects.toThrow()

      expect(elMessage.error).toHaveBeenCalledWith('port already claimed')
      expect(axiosGet).not.toHaveBeenCalled()
    })
  })

  describe('deleteBus', () => {
    it('deletes the named bus, then refetches', async () => {
      const store = useConfigStore()

      await store.deleteBus('bus1', 'web-user')

      expect(axiosDelete).toHaveBeenCalledWith('/api/config/modbus/buses/bus1', {
        headers: { 'X-User-Email': 'web-user' },
      })
      expect(axiosGet).toHaveBeenCalledWith('/api/config/modbus')
      expect(elMessage.success).toHaveBeenCalledWith(zhTW.config.bus.deleteSuccess)
    })

    it('toasts the server detail and rethrows', async () => {
      const store = useConfigStore()
      axiosDelete.mockRejectedValueOnce(axiosError('bus still has devices'))

      await expect(store.deleteBus('bus1', 'web-user')).rejects.toThrow()

      expect(elMessage.error).toHaveBeenCalledWith('bus still has devices')
      expect(axiosGet).not.toHaveBeenCalled()
    })
  })

  describe('getDeviceDisplayName', () => {
    it('prefers modes.name and falls back to model_slaveId', () => {
      const store = useConfigStore()
      const device = clone().devices[0]!

      expect(store.getDeviceDisplayName(device)).toBe('Pump A')
      expect(store.getDeviceDisplayName({ ...device, modes: {} })).toBe('TECO_VFD_3')
      expect(store.getDeviceDisplayName({ ...device, modes: { name: '  ' } })).toBe('TECO_VFD_3')
    })
  })
})
