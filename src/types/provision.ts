/**
 * Current configuration
 */
export interface ProvisionCurrentConfig {
  hostname: string
  reverse_port: number
  port_source: 'service' | 'config'
}

/**
 * Set configuration request
 */
export interface SetConfigRequest {
  hostname: string
  reverse_port: number
}

/**
 * Result of setting configuration
 */
export interface ProvisionSetConfigResult {
  success: boolean
  requires_reboot: boolean
  changes: string[]
  message: string
}

/**
 * Result of rebooting the system
 */
export interface ProvisionRebootResult {
  success: boolean
  message: string
}
