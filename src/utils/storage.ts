/**
 * Local storage utility functions
 */

/** Storage item interface */
interface StorageItem<T> {
  value: T
  timestamp: number
  expiry?: number
}

/** Storage options */
interface StorageOptions {
  expiry?: number // Expiration time (milliseconds)
  encrypt?: boolean // Whether to "encrypt" (simple obfuscation)
}

/** Storage class */
class Storage {
  private prefix: string

  constructor(prefix: string = 'talos_') {
    this.prefix = prefix
  }

  /** Get the full key */
  private getKey(key: string): string {
    return `${this.prefix}${key}`
  }

  /** Simple obfuscation encode */
  private encode(value: string): string {
    return btoa(encodeURIComponent(value))
  }

  /** Simple obfuscation decode */
  private decode(value: string): string {
    try {
      return decodeURIComponent(atob(value))
    } catch {
      return value
    }
  }

  /** Set a value */
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

  /** Get a value */
  get<T>(key: string, defaultValue?: T): T | undefined {
    try {
      const fullKey = this.getKey(key)
      let stringValue = localStorage.getItem(fullKey)

      if (!stringValue) {
        return defaultValue
      }

      // Try decoding (if it is obfuscated)
      try {
        stringValue = this.decode(stringValue)
      } catch {
        // Not obfuscated; use original value
      }

      const item: StorageItem<T> = JSON.parse(stringValue)

      // Check expiration
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

  /** Remove a value */
  remove(key: string): boolean {
    try {
      localStorage.removeItem(this.getKey(key))
      return true
    } catch (error) {
      console.error(`Failed to remove storage item "${key}":`, error)
      return false
    }
  }

  /** Check whether a key exists */
  has(key: string): boolean {
    return localStorage.getItem(this.getKey(key)) !== null
  }

  /** Clear all items with the prefix */
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

  /** Get all keys (without the prefix) */
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

  /** Get storage size (approximate) */
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

  /** Get a human-readable size string */
  getSizeString(): string {
    const bytes = this.getSize()
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  /** Check whether localStorage is available */
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

// Create default storage instance
export const storage = new Storage('talos_')

// Export Storage class for custom usage
export { Storage }

/** User preferences manager */
export class PreferencesManager {
  private storage: Storage
  private key = 'user_preferences'

  constructor(storage: Storage) {
    this.storage = storage
  }

  /** Get all preferences */
  getAll(): Record<string, unknown> {
    return (this.storage.get(this.key) ?? {}) as Record<string, unknown>
  }

  /** Get a specific preference (overloads) */
  get<T>(key: string): T | undefined
  get<T>(key: string, defaultValue: T): T
  get<T>(key: string, defaultValue?: T): T | undefined {
    const prefs = this.getAll()
    const value = prefs?.[key] as T | undefined
    if (value !== undefined) return value
    return defaultValue
  }

  /** Set a preference */
  set(key: string, value: unknown): boolean {
    const prefs = this.getAll()
    ;(prefs as Record<string, unknown>)[key] = value
    return this.storage.set(this.key, prefs)
  }

  /** Batch set preferences */
  setMultiple(values: Record<string, unknown>): boolean {
    const prefs = this.getAll()
    Object.assign(prefs, values)
    return this.storage.set(this.key, prefs)
  }

  /** Remove a preference */
  remove(key: string): boolean {
    const prefs = this.getAll()
    delete (prefs as Record<string, unknown>)[key]
    return this.storage.set(this.key, prefs)
  }

  /** Clear all preferences */
  clear(): boolean {
    return this.storage.remove(this.key)
  }
}

// Create default preferences manager
export const preferences = new PreferencesManager(storage)

/** Cache manager */
export class CacheManager<T = unknown> {
  private storage: Storage
  private prefix: string
  private defaultTTL: number

  constructor(
    storage: Storage,
    prefix: string = 'cache_',
    defaultTTL: number = 3600000, // Default: 1 hour
  ) {
    this.storage = storage
    this.prefix = prefix
    this.defaultTTL = defaultTTL
  }

  /** Get the full key */
  private getCacheKey(key: string): string {
    return `${this.prefix}${key}`
  }

  /** Set cache */
  set(key: string, value: T, ttl?: number): boolean {
    return this.storage.set(this.getCacheKey(key), value, {
      expiry: ttl ?? this.defaultTTL,
    })
  }

  /** Get cache */
  get(key: string, defaultValue?: T): T | undefined {
    return this.storage.get<T>(this.getCacheKey(key), defaultValue)
  }

  /** Remove cache */
  remove(key: string): boolean {
    return this.storage.remove(this.getCacheKey(key))
  }

  /** Clear all cache */
  clear(): void {
    const keys = this.storage.keys().filter((k) => k.startsWith(this.prefix))
    keys.forEach((key) => this.storage.remove(key))
  }

  /** Get or set cache (run factory if missing) */
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

// Create default cache manager
export const cache = new CacheManager(storage)

/** Connection settings */
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

  /** Save connection settings */
  save(deviceId: string, settings: ConnectionSettings): boolean {
    const allSettings = this.preferences.get<Record<string, ConnectionSettings>>(this.key, {})
    allSettings[deviceId] = settings
    return this.preferences.set(this.key, allSettings)
  }

  /** Load connection settings */
  load(deviceId: string): ConnectionSettings | undefined {
    const allSettings = this.preferences.get<Record<string, ConnectionSettings>>(this.key, {})
    return allSettings[deviceId]
  }

  /** Remove connection settings */
  remove(deviceId: string): boolean {
    const allSettings = this.preferences.get<Record<string, ConnectionSettings>>(this.key, {})
    delete allSettings[deviceId]
    return this.preferences.set(this.key, allSettings)
  }

  /** Get all connection settings */
  getAll(): Record<string, ConnectionSettings> {
    return this.preferences.get<Record<string, ConnectionSettings>>(this.key, {})
  }

  /** Clear all connection settings */
  clear(): boolean {
    return this.preferences.remove(this.key)
  }
}

// Create default connection settings manager
export const connectionSettings = new ConnectionSettingsManager(preferences)

export default storage
