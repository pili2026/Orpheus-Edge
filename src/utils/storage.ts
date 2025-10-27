/**
 * 本地儲存工具函數
 */

/** 儲存項目介面 */
interface StorageItem<T> {
  value: T
  timestamp: number
  expiry?: number
}

/** 儲存選項 */
interface StorageOptions {
  expiry?: number // 過期時間（毫秒）
  encrypt?: boolean // 是否加密（簡單混淆）
}

/** Storage 類別 */
class Storage {
  private prefix: string

  constructor(prefix: string = 'talos_') {
    this.prefix = prefix
  }

  /** 取得完整的 key */
  private getKey(key: string): string {
    return `${this.prefix}${key}`
  }

  /** 簡單的混淆編碼 */
  private encode(value: string): string {
    return btoa(encodeURIComponent(value))
  }

  /** 簡單的混淆解碼 */
  private decode(value: string): string {
    try {
      return decodeURIComponent(atob(value))
    } catch {
      return value
    }
  }

  /** 設定值 */
  set<T>(key: string, value: T, options?: StorageOptions): boolean {
    try {
      const item: StorageItem<T> = {
        value,
        timestamp: Date.now(),
        expiry: options?.expiry,
      }

      let stringValue = JSON.stringify(item)

      if (options?.encrypt) {
        stringValue = this.encode(stringValue)
      }

      localStorage.setItem(this.getKey(key), stringValue)
      return true
    } catch (error) {
      console.error(`Failed to set storage item "${key}":`, error)
      return false
    }
  }

  /** 取得值 */
  get<T>(key: string, defaultValue?: T): T | undefined {
    try {
      const fullKey = this.getKey(key)
      let stringValue = localStorage.getItem(fullKey)

      if (!stringValue) {
        return defaultValue
      }

      // 嘗試解码（如果是加密的）
      try {
        stringValue = this.decode(stringValue)
      } catch {
        // 不是加密的，使用原值
      }

      const item: StorageItem<T> = JSON.parse(stringValue)

      // 檢查是否過期
      if (item.expiry) {
        const now = Date.now()
        if (now - item.timestamp > item.expiry) {
          this.remove(key)
          return defaultValue
        }
      }

      return item.value
    } catch (error) {
      console.error(`Failed to get storage item "${key}":`, error)
      return defaultValue
    }
  }

  /** 移除值 */
  remove(key: string): boolean {
    try {
      localStorage.removeItem(this.getKey(key))
      return true
    } catch (error) {
      console.error(`Failed to remove storage item "${key}":`, error)
      return false
    }
  }

  /** 檢查 key 是否存在 */
  has(key: string): boolean {
    return localStorage.getItem(this.getKey(key)) !== null
  }

  /** 清除所有帶前綴的項目 */
  clear(): void {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(this.prefix)) {
          keys.push(key)
        }
      }
      keys.forEach((key) => localStorage.removeItem(key))
    } catch (error) {
      console.error('Failed to clear storage:', error)
    }
  }

  /** 取得所有 keys（去掉自身前綴） */
  keys(): string[] {
    const keys: string[] = []
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(this.prefix)) {
          keys.push(key.substring(this.prefix.length))
        }
      }
    } catch (error) {
      console.error('Failed to get storage keys:', error)
    }
    return keys
  }

  /** 取得儲存的大小（概估） */
  getSize(): number {
    let size = 0
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(this.prefix)) {
          const value = localStorage.getItem(key)
          if (value) {
            size += key.length + value.length
          }
        }
      }
    } catch (error) {
      console.error('Failed to calculate storage size:', error)
    }
    return size
  }

  /** 取得可讀的大小字串 */
  getSizeString(): string {
    const bytes = this.getSize()
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  /** 檢查 localStorage 是否可用 */
  static isAvailable(): boolean {
    try {
      const test = '__storage_test__'
      localStorage.setItem(test, test)
      localStorage.removeItem(test)
      return true
    } catch {
      return false
    }
  }
}

// 建立預設的 storage 實例
export const storage = new Storage('talos_')

// 匯出 Storage 類別供自訂使用
export { Storage }

/** 使用者偏好設定管理 */
export class PreferencesManager {
  private storage: Storage
  private key = 'user_preferences'

  constructor(storage: Storage) {
    this.storage = storage
  }

  /** 取得所有偏好設定 */
  getAll(): Record<string, unknown> {
    return (this.storage.get(this.key) ?? {}) as Record<string, unknown>
  }

  /** 取得特定偏好設定（多載） */
  get<T>(key: string): T | undefined
  get<T>(key: string, defaultValue: T): T
  get<T>(key: string, defaultValue?: T): T | undefined {
    const prefs = this.getAll()
    const value = prefs?.[key] as T | undefined
    if (value !== undefined) return value
    return defaultValue
  }

  /** 設定偏好設定 */
  set(key: string, value: unknown): boolean {
    const prefs = this.getAll()
    ;(prefs as Record<string, unknown>)[key] = value
    return this.storage.set(this.key, prefs)
  }

  /** 批次設定偏好設定 */
  setMultiple(values: Record<string, unknown>): boolean {
    const prefs = this.getAll()
    Object.assign(prefs, values)
    return this.storage.set(this.key, prefs)
  }

  /** 移除偏好設定 */
  remove(key: string): boolean {
    const prefs = this.getAll()
    delete (prefs as Record<string, unknown>)[key]
    return this.storage.set(this.key, prefs)
  }

  /** 清除所有偏好設定 */
  clear(): boolean {
    return this.storage.remove(this.key)
  }
}

// 建立預設的偏好設定管理器
export const preferences = new PreferencesManager(storage)

/** 快取管理器 */
export class CacheManager<T = unknown> {
  private storage: Storage
  private prefix: string
  private defaultTTL: number

  constructor(
    storage: Storage,
    prefix: string = 'cache_',
    defaultTTL: number = 3600000, // 預設 1 小時
  ) {
    this.storage = storage
    this.prefix = prefix
    this.defaultTTL = defaultTTL
  }

  /** 取得完整的 key */
  private getCacheKey(key: string): string {
    return `${this.prefix}${key}`
  }

  /** 設定快取 */
  set(key: string, value: T, ttl?: number): boolean {
    return this.storage.set(this.getCacheKey(key), value, {
      expiry: ttl ?? this.defaultTTL,
    })
  }

  /** 取得快取 */
  get(key: string, defaultValue?: T): T | undefined {
    return this.storage.get<T>(this.getCacheKey(key), defaultValue)
  }

  /** 移除快取 */
  remove(key: string): boolean {
    return this.storage.remove(this.getCacheKey(key))
  }

  /** 清除所有快取 */
  clear(): void {
    const keys = this.storage.keys().filter((k) => k.startsWith(this.prefix))
    keys.forEach((key) => this.storage.remove(key))
  }

  /** 取得或設定快取（如果不存在則執行 factory） */
  async getOrSet(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key)
    if (cached !== undefined) {
      return cached
    }
    const value = await factory()
    this.set(key, value, ttl)
    return value
  }
}

// 建立預設的快取管理器
export const cache = new CacheManager(storage)

/** 連接設定管理 */
export interface ConnectionSettings {
  deviceId: string
  interval: number
  parameters: string[]
  autoReconnect: boolean
}

export class ConnectionSettingsManager {
  private preferences: PreferencesManager
  private key = 'connection_settings'

  constructor(preferences: PreferencesManager) {
    this.preferences = preferences
  }

  /** 儲存連接設定 */
  save(deviceId: string, settings: ConnectionSettings): boolean {
    const allSettings = this.preferences.get<Record<string, ConnectionSettings>>(this.key, {})
    allSettings[deviceId] = settings
    return this.preferences.set(this.key, allSettings)
  }

  /** 載入連接設定 */
  load(deviceId: string): ConnectionSettings | undefined {
    const allSettings = this.preferences.get<Record<string, ConnectionSettings>>(this.key, {})
    return allSettings[deviceId]
  }

  /** 移除連接設定 */
  remove(deviceId: string): boolean {
    const allSettings = this.preferences.get<Record<string, ConnectionSettings>>(this.key, {})
    delete allSettings[deviceId]
    return this.preferences.set(this.key, allSettings)
  }

  /** 取得所有連接設定 */
  getAll(): Record<string, ConnectionSettings> {
    return this.preferences.get<Record<string, ConnectionSettings>>(this.key, {})
  }

  /** 清除所有連接設定 */
  clear(): boolean {
    return this.preferences.remove(this.key)
  }
}

// 建立預設的連接設定管理器
export const connectionSettings = new ConnectionSettingsManager(preferences)

export default storage
