import { describe, it, expect } from 'vitest'

import router from '../index'

describe('router', () => {
  it('resolves /device/:deviceId to the device-detail route', () => {
    const resolved = router.resolve('/device/TECO_VFD_2')

    expect(resolved.name).toBe('device-detail')
    expect(resolved.params.deviceId).toBe('TECO_VFD_2')
    expect(resolved.matched.length).toBeGreaterThan(0)
  })
})
