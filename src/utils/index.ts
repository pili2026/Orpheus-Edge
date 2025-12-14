/**
 * Unified Utils Export
 *
 * This file provides a single entry point for all utility functions
 */

// API utilities
export * from './api'

// Formatting utilities
export * from './formatter'

// Validation utilities
export * from './validator'

// Logging utilities
export * from './logger'

// Storage utilities
export * from './storage'

/**
 * Usage examples:
 *
 * // Option 1: Import directly from utils
 * import { formatTimestamp, validateDeviceId, logger, storage } from '@/utils'
 *
 * // Option 2: Import from specific modules
 * import { formatTimestamp } from '@/utils/formatter'
 * import { validateDeviceId } from '@/utils/validator'
 * import { logger } from '@/utils/logger'
 * import { storage } from '@/utils/storage'
 */
