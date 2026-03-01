/**
 * useApi - Config Builder API Composable
 * Unified API calls for config builder: devices, pins, YAML generate/validate, diagram
 */
import api from '@/services/api'
import type {
  ConfigDevice,
  DevicePins,
  ValidateResponse,
  GenerateYamlResponse,
  DiagramResponse,
  GenerateControlPayload,
  GenerateAlertPayload,
} from '@/types/config-builder'

export function useApi() {
  /** GET /api/devices → 回傳已配置設備清單 */
  async function getConfigDevices(): Promise<ConfigDevice[]> {
    const response = await api.get<ConfigDevice[]>('/devices')
    return response.data
  }

  /** GET /api/devices/{model}/pins → 回傳該 model 的 pin 清單 */
  async function getDevicePins(model: string): Promise<DevicePins> {
    const response = await api.get<DevicePins>(`/devices/${encodeURIComponent(model)}/pins`)
    return response.data
  }

  /** POST /api/config/control/validate → 驗證 control_condition YAML */
  async function validateControlYaml(yaml: string): Promise<ValidateResponse> {
    const response = await api.post<ValidateResponse>('/config/control/validate', { yaml })
    return response.data
  }

  /** POST /api/config/alert/validate → 驗證 alert_condition YAML */
  async function validateAlertYaml(yaml: string): Promise<ValidateResponse> {
    const response = await api.post<ValidateResponse>('/config/alert/validate', { yaml })
    return response.data
  }

  /** POST /api/config/control/generate → 產出 control_condition YAML */
  async function generateControlYaml(payload: GenerateControlPayload): Promise<GenerateYamlResponse> {
    const response = await api.post<GenerateYamlResponse>('/config/control/generate', payload)
    return response.data
  }

  /** POST /api/config/alert/generate → 產出 alert_condition YAML */
  async function generateAlertYaml(payload: GenerateAlertPayload): Promise<GenerateYamlResponse> {
    const response = await api.post<GenerateYamlResponse>('/config/alert/generate', payload)
    return response.data
  }

  /** POST /api/diagram/generate → 產出 Mermaid flowchart 字串 */
  async function generateDiagram(yaml: string): Promise<DiagramResponse> {
    const response = await api.post<DiagramResponse>('/diagram/generate', { yaml })
    return response.data
  }

  return {
    getConfigDevices,
    getDevicePins,
    validateControlYaml,
    validateAlertYaml,
    generateControlYaml,
    generateAlertYaml,
    generateDiagram,
  }
}
