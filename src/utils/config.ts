/**
 * 配置管理器
 * 動態處理 API 和 WebSocket URL
 */

class ConfigManager {
  /**
   * 取得 API 基礎 URL
   * 使用相對路徑，會自動使用當前網頁的 host
   */
  get apiBaseUrl(): string {
    return '/api'
  }

  /**
   * 建構 WebSocket URL
   * @param path WebSocket 路徑（例如：/api/monitoring/device/xxx）
   * @returns 完整的 WebSocket URL
   */
  getWebSocketUrl(path: string): string {
    // 動態獲取協議和 host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host

    // 確保路徑以 / 開頭
    const normalizedPath = path.startsWith('/') ? path : `/${path}`

    return `${protocol}//${host}${normalizedPath}`
  }

  /**
   * 取得當前環境資訊
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

// 匯出單例
export default new ConfigManager()
