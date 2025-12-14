/**
 * Logging utility functions
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Log types
 */
export type LogType = 'debug' | 'info' | 'success' | 'warn' | 'error'

/**
 * Log entry interface
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
 * Logger configuration
 */
interface LoggerConfig {
  level: LogLevel
  maxLogs: number
  enableConsole: boolean
  enableStorage: boolean
  storageKey: string
}

/**
 * Logger class
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

    // Load persisted logs
    if (this.config.enableStorage) {
      this.loadLogs()
    }
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level
  }

  /**
   * Log DEBUG message
   */
  debug(message: string, data?: any, source?: string): void {
    this.log(LogLevel.DEBUG, 'debug', message, data, source)
  }

  /**
   * Log INFO message
   */
  info(message: string, data?: any, source?: string): void {
    this.log(LogLevel.INFO, 'info', message, data, source)
  }

  /**
   * Log SUCCESS message
   */
  success(message: string, data?: any, source?: string): void {
    this.log(LogLevel.INFO, 'success', message, data, source)
  }

  /**
   * Log WARN message
   */
  warn(message: string, data?: any, source?: string): void {
    this.log(LogLevel.WARN, 'warn', message, data, source)
  }

  /**
   * Log ERROR message
   */
  error(message: string, error?: any, source?: string): void {
    const errorData =
      error instanceof Error ? { message: error.message, stack: error.stack } : error
    this.log(LogLevel.ERROR, 'error', message, errorData, source)
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, type: LogType, message: string, data?: any, source?: string): void {
    // Check log level
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

    // Append to log list
    this.logs.push(entry)

    // Enforce max log size
    if (this.logs.length > this.config.maxLogs) {
      this.logs.shift()
    }

    // Output to console
    if (this.config.enableConsole) {
      this.logToConsole(entry)
    }

    // Persist to localStorage
    if (this.config.enableStorage) {
      this.saveLogs()
    }

    // Notify subscribers
    this.notifyListeners(entry)
  }

  /**
   * Output to console
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
   * Format timestamp
   */
  private formatTimestamp(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    const ms = String(date.getMilliseconds()).padStart(3, '0')
    return `${hours}:${minutes}:${seconds}.${ms}`
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  /**
   * Get filtered logs
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
   * Clear all logs
   */
  clear(): void {
    this.logs = []
    if (this.config.enableStorage) {
      localStorage.removeItem(this.config.storageKey)
    }
  }

  /**
   * Register a listener
   */
  subscribe(callback: (entry: LogEntry) => void): () => void {
    this.listeners.add(callback)
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback)
    }
  }

  /**
   * Notify all listeners
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
   * Save logs to localStorage
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
   * Load logs from localStorage
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
   * Export logs as JSON
   */
  exportJSON(): string {
    return JSON.stringify(this.logs, null, 2)
  }

  /**
   * Export logs as CSV
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
   * Export logs as plain text
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

// Create default logger instance
export const logger = new Logger({
  level: LogLevel.INFO,
  enableConsole: true,
  enableStorage: false,
})

// Export Logger class for custom usage
export { Logger }

// Convenience functions
export const debug = logger.debug.bind(logger)
export const info = logger.info.bind(logger)
export const success = logger.success.bind(logger)
export const warn = logger.warn.bind(logger)
export const error = logger.error.bind(logger)

export default logger
