/**
 * Utils 統一匯出
 *
 * 這個檔案提供所有工具函數的統一入口
 */

// API 工具
export * from './api'

// 格式化工具
export * from './formatter'

// 驗證工具
export * from './validator'

// 日誌工具
export * from './logger'

// 儲存工具
export * from './storage'

/**
 * 使用範例：
 *
 * // 方式 1: 直接從 utils 匯入
 * import { formatTimestamp, validateDeviceId, logger, storage } from '@/utils'
 *
 * // 方式 2: 從特定模組匯入
 * import { formatTimestamp } from '@/utils/formatter'
 * import { validateDeviceId } from '@/utils/validator'
 * import { logger } from '@/utils/logger'
 * import { storage } from '@/utils/storage'
 */
