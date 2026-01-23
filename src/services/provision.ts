import api from '@/services/api'
import type {
  ProvisionCurrentConfig,
  SetConfigRequest,
  ProvisionSetConfigResult,
  ProvisionRebootResult,
} from '@/types/provision'

class ProvisionService {
  /**
   * Get current system configuration
   */
  async getCurrentConfig(): Promise<ProvisionCurrentConfig> {
    const response = await api.get<ProvisionCurrentConfig>('/provision/config')
    return response.data
  }

  /**
   * Update system configuration
   */
  async setConfig(hostname: string, reversePort: number): Promise<ProvisionSetConfigResult> {
    const payload: SetConfigRequest = {
      hostname: hostname,
      reverse_port: reversePort,
    }

    const response = await api.post<ProvisionSetConfigResult>('/provision/config', payload)
    return response.data
  }

  /**
   * Trigger system reboot
   */
  async triggerReboot(): Promise<ProvisionRebootResult> {
    const response = await api.post<ProvisionRebootResult>('/provision/reboot')
    return response.data
  }
}

export const provisionService = new ProvisionService()
