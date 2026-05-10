import api from '@/services/api'

export interface MqttConfig {
  enabled: boolean
  broker: {
    host: string
    port: number
    tls: {
      enabled: boolean
      ca_cert_path: string
      insecure_skip_verify: boolean
    }
  }
  credentials: {
    username?: string | null
    password_configured?: boolean
    gateway_id?: string | null
    registered?: boolean
  }
  client: {
    client_id: string
    clean_session: boolean
    keepalive_sec: number
  }
  reconnect: Record<string, unknown>
  qos: Record<string, unknown>
  topics: {
    base_prefix: string
  }
  outbox: Record<string, unknown>
  status: Record<string, unknown>
  event: { enabled: boolean }
  telemetry: { enabled: boolean }
}

export type MqttConfigPatch = Partial<Omit<MqttConfig, 'credentials'>>

export interface MqttStatus {
  registered: boolean
  connected: boolean
  service_registered?: boolean
  last_connect_time?: string | null
  last_disconnect_time?: string | null
  last_status_publish_time?: string | null
  last_status_publish_error?: string | null
  last_connection_error?: string | null
}

export interface OrionConnectionResult {
  ok?: boolean | null
  orion_reachable?: boolean | null
  reachable?: boolean | null
  message?: string
  latency_ms?: number | null
  restart_required?: boolean
}

export interface RegisterGatewayResult {
  success?: boolean
  message?: string
  restart_required?: boolean
}

export const getMqttConfig = async () => (await api.get<MqttConfig>('/mqtt/config')).data
export const patchMqttConfig = async (payload: MqttConfigPatch) =>
  (await api.patch<MqttConfig>('/mqtt/config', payload)).data
export const getMqttStatus = async () => (await api.get<MqttStatus>('/mqtt/status')).data
export const restartMqttService = async () => api.post('/mqtt/restart')
export const testOrionConnection = async () =>
  (await api.post<OrionConnectionResult>('/mqtt/test-orion')).data
export const registerMqttGateway = async () =>
  (await api.post<RegisterGatewayResult>('/mqtt/register-gateway')).data
