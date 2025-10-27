/**
 * 格式化工具函數
 */

/**
 * 格式化數值，保留指定小數位數
 */
export function formatNumber(value: number, decimals: number = 2): string {
  if (typeof value !== 'number' || isNaN(value)) {
    return 'N/A'
  }
  return value.toFixed(decimals)
}

/**
 * 格式化數值並加上單位
 */
export function formatValueWithUnit(value: number, unit?: string, decimals: number = 2): string {
  const formattedValue = formatNumber(value, decimals)
  return unit ? `${formattedValue} ${unit}` : formattedValue
}

/**
 * 格式化時間戳記為可讀格式
 */
export function formatTimestamp(timestamp: string | number | Date): string {
  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) {
      return 'Invalid Date'
    }

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  } catch (error) {
    console.error('Failed to format timestamp:', error)
    return 'Invalid Date'
  }
}

/**
 * 格式化時間為短格式 (HH:MM:SS)
 */
export function formatTimeShort(timestamp: string | number | Date): string {
  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) {
      return 'Invalid Time'
    }

    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return `${hours}:${minutes}:${seconds}`
  } catch (error) {
    console.error('Failed to format time:', error)
    return 'Invalid Time'
  }
}

/**
 * 格式化相對時間 (幾秒前、幾分鐘前)
 */
export function formatRelativeTime(timestamp: string | number | Date): string {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)

    if (diffSeconds < 0) {
      return '未來'
    }

    if (diffSeconds < 60) {
      return `${diffSeconds} 秒前`
    }

    const diffMinutes = Math.floor(diffSeconds / 60)
    if (diffMinutes < 60) {
      return `${diffMinutes} 分鐘前`
    }

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) {
      return `${diffHours} 小時前`
    }

    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 30) {
      return `${diffDays} 天前`
    }

    return formatTimestamp(timestamp)
  } catch (error) {
    console.error('Failed to format relative time:', error)
    return 'Unknown'
  }
}

/**
 * 格式化布林值為中文
 */
export function formatBoolean(value: boolean | number): string {
  if (typeof value === 'number') {
    return value === 0 ? '關閉' : '開啟'
  }
  return value ? '開啟' : '關閉'
}

/**
 * 格式化設備狀態
 */
export function formatDeviceStatus(status: string): { text: string; color: string } {
  const statusMap: Record<string, { text: string; color: string }> = {
    online: { text: '線上', color: 'success' },
    offline: { text: '離線', color: 'danger' },
    connecting: { text: '連接中', color: 'warning' },
    error: { text: '錯誤', color: 'danger' },
    unknown: { text: '未知', color: 'info' },
  }

  return statusMap[status.toLowerCase()] || { text: status, color: 'info' }
}

/**
 * 格式化檔案大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * 格式化百分比
 */
export function formatPercentage(value: number, total: number, decimals: number = 1): string {
  if (total === 0) return '0%'
  const percentage = (value / total) * 100
  return `${percentage.toFixed(decimals)}%`
}

/**
 * 格式化 Modbus 暫存器位址
 */
export function formatRegisterAddress(address: number, prefix: string = '0x'): string {
  return `${prefix}${address.toString(16).toUpperCase().padStart(4, '0')}`
}

/**
 * 格式化設備 ID
 */
export function formatDeviceId(deviceId: string): string {
  // 如果是 "IMA_C_5" 格式，轉換為更友善的顯示
  return deviceId.replace(/_/g, ' ')
}

/**
 * 截斷長文字並加上省略號
 */
export function truncate(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * 格式化錯誤訊息
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return '未知錯誤'
}

/**
 * 格式化連接資訊
 */
export function formatConnectionInfo(
  deviceId: string,
  parameters?: string[],
  interval?: number,
): string {
  let info = `設備: ${deviceId}`

  if (parameters && parameters.length > 0) {
    info += ` | 參數: ${parameters.join(', ')}`
  }

  if (interval) {
    info += ` | 間隔: ${interval}s`
  }

  return info
}

export default {
  formatNumber,
  formatValueWithUnit,
  formatTimestamp,
  formatTimeShort,
  formatRelativeTime,
  formatBoolean,
  formatDeviceStatus,
  formatFileSize,
  formatPercentage,
  formatRegisterAddress,
  formatDeviceId,
  truncate,
  formatErrorMessage,
  formatConnectionInfo,
}
