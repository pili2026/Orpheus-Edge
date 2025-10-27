/**
 * 日誌工具函數
 */

/**
 * 日誌等級
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * 日誌類型
 */
export type LogType = 'debug' | 'info' | 'success' | 'warn' | 'error'

/**
 * 日誌項目介面
 */
export interface LogEntry {
  timestamp: Date
  level: LogLevel
  type: LogType
  message: string
  data?: any
  source?: string
}

/**
 * Logger 配置
 */
interface LoggerConfig {
  level: LogLevel
  maxLogs: number
  enableConsole: boolean
  enableStorage: boolean
  storageKey: string
}

/**
 * Logger 類別
 */
class Logger {
  private config: LoggerConfig
  private logs: LogEntry[] = []
  private listeners: Set<(entry: LogEntry) => void> = new Set()

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: LogLevel.INFO,
      maxLogs: 1000,
      enableConsole: true,
      enableStorage: false,
      storageKey: 'talos_logs',
      ...config,
    }

    // 載入已儲存的日誌
    if (this.config.enableStorage) {
      this.loadLogs()
    }
  }

  /**
   * 設定日誌等級
   */
  setLevel(level: LogLevel): void {
    this.config.level = level
  }

  /**
   * 取得目前日誌等級
   */
  getLevel(): LogLevel {
    return this.config.level
  }

  /**
   * 記錄 DEBUG 訊息
   */
  debug(message: string, data?: any, source?: string): void {
    this.log(LogLevel.DEBUG, 'debug', message, data, source)
  }

  /**
   * 記錄 INFO 訊息
   */
  info(message: string, data?: any, source?: string): void {
    this.log(LogLevel.INFO, 'info', message, data, source)
  }

  /**
   * 記錄 SUCCESS 訊息
   */
  success(message: string, data?: any, source?: string): void {
    this.log(LogLevel.INFO, 'success', message, data, source)
  }

  /**
   * 記錄 WARN 訊息
   */
  warn(message: string, data?: any, source?: string): void {
    this.log(LogLevel.WARN, 'warn', message, data, source)
  }

  /**
   * 記錄 ERROR 訊息
   */
  error(message: string, error?: any, source?: string): void {
    const errorData =
      error instanceof Error ? { message: error.message, stack: error.stack } : error
    this.log(LogLevel.ERROR, 'error', message, errorData, source)
  }

  /**
   * 核心日誌方法
   */
  private log(level: LogLevel, type: LogType, message: string, data?: any, source?: string): void {
    // 檢查日誌等級
    if (level < this.config.level) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      type,
      message,
      data,
      source,
    }

    // 加入日誌陣列
    this.logs.push(entry)

    // 限制日誌數量
    if (this.logs.length > this.config.maxLogs) {
      this.logs.shift()
    }

    // 輸出到 console
    if (this.config.enableConsole) {
      this.logToConsole(entry)
    }

    // 儲存到 localStorage
    if (this.config.enableStorage) {
      this.saveLogs()
    }

    // 通知監聽器
    this.notifyListeners(entry)
  }

  /**
   * 輸出到 console
   */
  private logToConsole(entry: LogEntry): void {
    const prefix = `[${this.formatTimestamp(entry.timestamp)}]`
    const source = entry.source ? `[${entry.source}]` : ''
    const fullMessage = `${prefix}${source} ${entry.message}`

    switch (entry.type) {
      case 'debug':
        console.debug(fullMessage, entry.data)
        break
      case 'info':
      case 'success':
        console.info(fullMessage, entry.data)
        break
      case 'warn':
        console.warn(fullMessage, entry.data)
        break
      case 'error':
        console.error(fullMessage, entry.data)
        break
    }
  }

  /**
   * 格式化時間戳記
   */
  private formatTimestamp(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    const ms = String(date.getMilliseconds()).padStart(3, '0')
    return `${hours}:${minutes}:${seconds}.${ms}`
  }

  /**
   * 取得所有日誌
   */
  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  /**
   * 取得過濾後的日誌
   */
  getFilteredLogs(filter?: {
    level?: LogLevel
    type?: LogType
    source?: string
    startTime?: Date
    endTime?: Date
  }): LogEntry[] {
    if (!filter) return this.getLogs()

    return this.logs.filter((entry) => {
      if (filter.level !== undefined && entry.level !== filter.level) {
        return false
      }
      if (filter.type && entry.type !== filter.type) {
        return false
      }
      if (filter.source && entry.source !== filter.source) {
        return false
      }
      if (filter.startTime && entry.timestamp < filter.startTime) {
        return false
      }
      if (filter.endTime && entry.timestamp > filter.endTime) {
        return false
      }
      return true
    })
  }

  /**
   * 清除所有日誌
   */
  clear(): void {
    this.logs = []
    if (this.config.enableStorage) {
      localStorage.removeItem(this.config.storageKey)
    }
  }

  /**
   * 註冊監聽器
   */
  subscribe(callback: (entry: LogEntry) => void): () => void {
    this.listeners.add(callback)
    // 返回取消訂閱函數
    return () => {
      this.listeners.delete(callback)
    }
  }

  /**
   * 通知所有監聽器
   */
  private notifyListeners(entry: LogEntry): void {
    this.listeners.forEach((callback) => {
      try {
        callback(entry)
      } catch (error) {
        console.error('Error in log listener:', error)
      }
    })
  }

  /**
   * 儲存日誌到 localStorage
   */
  private saveLogs(): void {
    try {
      const logsToSave = this.logs.map((entry) => ({
        ...entry,
        timestamp: entry.timestamp.toISOString(),
      }))
      localStorage.setItem(this.config.storageKey, JSON.stringify(logsToSave))
    } catch (error) {
      console.error('Failed to save logs to storage:', error)
    }
  }

  /**
   * 從 localStorage 載入日誌
   */
  private loadLogs(): void {
    try {
      const saved = localStorage.getItem(this.config.storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        this.logs = parsed.map((entry: any) => ({
          ...entry,
          timestamp: new Date(entry.timestamp),
        }))
      }
    } catch (error) {
      console.error('Failed to load logs from storage:', error)
    }
  }

  /**
   * 匯出日誌為 JSON
   */
  exportJSON(): string {
    return JSON.stringify(this.logs, null, 2)
  }

  /**
   * 匯出日誌為 CSV
   */
  exportCSV(): string {
    const headers = ['Timestamp', 'Level', 'Type', 'Source', 'Message', 'Data']
    const rows = this.logs.map((entry) => [
      entry.timestamp.toISOString(),
      LogLevel[entry.level],
      entry.type,
      entry.source || '',
      entry.message,
      entry.data ? JSON.stringify(entry.data) : '',
    ])

    return [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join(
      '\n',
    )
  }

  /**
   * 匯出日誌為純文字
   */
  exportText(): string {
    return this.logs
      .map((entry) => {
        const timestamp = entry.timestamp.toISOString()
        const level = LogLevel[entry.level]
        const source = entry.source ? `[${entry.source}]` : ''
        let line = `[${timestamp}] [${level}] ${source} ${entry.message}`
        if (entry.data) {
          line += `\n  Data: ${JSON.stringify(entry.data, null, 2)}`
        }
        return line
      })
      .join('\n\n')
  }
}

// 建立預設的 logger 實例
export const logger = new Logger({
  level: LogLevel.INFO,
  enableConsole: true,
  enableStorage: false,
})

// 匯出 Logger 類別供自訂使用
export { Logger }

// 便利函數
export const debug = logger.debug.bind(logger)
export const info = logger.info.bind(logger)
export const success = logger.success.bind(logger)
export const warn = logger.warn.bind(logger)
export const error = logger.error.bind(logger)

export default logger
