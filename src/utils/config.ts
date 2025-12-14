/**
 * Configuration Manager
 * Dynamically handles API and WebSocket URLs
 */

class ConfigManager {
  /**
   * Get API base URL
   * Uses a relative path and automatically resolves to the current page host
   */
  get apiBaseUrl(): string {
    return '/api'
  }

  /**
   * Build WebSocket URL
   * @param path WebSocket path (e.g. /api/monitoring/device/xxx)
   * @returns Full WebSocket URL
   */
  getWebSocketUrl(path: string): string {
    // Dynamically determine protocol and host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host

    // Ensure the path starts with '/'
    const normalizedPath = path.startsWith('/') ? path : `/${path}`

    return `${protocol}//${host}${normalizedPath}`
  }

  /**
   * Get current environment information
   */
  get environment(): {
    protocol: string
    host: string
    isDevelopment: boolean
    isProduction: boolean
  } {
    return {
      protocol: window.location.protocol,
      host: window.location.host,
      isDevelopment: import.meta.env.DEV,
      isProduction: import.meta.env.PROD,
    }
  }
}

// Export singleton instance
export default new ConfigManager()
