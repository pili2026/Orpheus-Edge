/**
 * WebSocket Service
 * Uses dynamic URL and automatically adapts to the deployment environment
 */

import type { ConnectionConfig, WebSocketMessage, WebSocketCommand } from '@/types'

export class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private isManualClose: boolean = false
  private shouldPreventReconnect: boolean = false

  // Event handlers
  public onOpen: (() => void) | null = null
  public onClose: (() => void) | null = null
  public onError: ((error: Event) => void) | null = null
  public onMessage: ((data: WebSocketMessage) => void) | null = null

  /**
   * Connect to WebSocket
   */
  connect(config: ConnectionConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = this.buildWebSocketUrl(config)

        this.ws = new WebSocket(url)
        this.isManualClose = false
        this.shouldPreventReconnect = false

        this.ws.onopen = () => {
          console.log('✓ WebSocket connected:', url)
          this.startHeartbeat()
          this.onOpen?.()
          resolve()
        }

        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason)
          this.stopHeartbeat()
          this.onClose?.()

          // Check prevent-reconnect flag
          if (!this.isManualClose && !this.shouldPreventReconnect && event.code !== 1000) {
            this.scheduleReconnect(config)
          } else if (this.shouldPreventReconnect) {
            console.log('Reconnection prevented due to critical error')
          }
        }

        this.ws.onerror = (error) => {
          console.error('✗ WebSocket error:', error)
          this.onError?.(error)
          reject(error)
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as WebSocketMessage
            this.onMessage?.(data)
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.isManualClose = true
    this.stopHeartbeat()
    this.clearReconnectTimer()

    if (this.ws) {
      this.ws.close(1000, 'User disconnected')
      this.ws = null
    }
  }

  /**
   * New: prevent reconnection (for critical errors)
   */
  preventReconnection(): void {
    this.shouldPreventReconnect = true
    this.clearReconnectTimer()
  }

  /**
   * New: allow reconnection (reset when reconnecting manually)
   */
  allowReconnection(): void {
    this.shouldPreventReconnect = false
  }

  /**
   * Send message
   */
  send(message: WebSocketCommand): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    this.ws.send(JSON.stringify(message))
  }

  /**
   * Check connection status
   */
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  /**
   * Build WebSocket URL
   */
  private buildWebSocketUrl(config: ConnectionConfig): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const baseUrl = `${protocol}//${host}`

    const mode = config.mode || (config.deviceId ? 'single' : config.deviceIds ? 'multiple' : null)

    if (mode === 'single' && config.deviceId) {
      let url = `${baseUrl}/api/monitoring/device/${config.deviceId}?interval=${config.interval || 1.0}`

      if (config.parameters && config.parameters.length > 0) {
        url += `&parameters=${config.parameters.join(',')}`
      }

      console.log('[WebSocket] Building single device URL:', url)
      return url
    } else if (mode === 'multiple' && config.deviceIds && config.deviceIds.length > 0) {
      let url = `${baseUrl}/api/monitoring/devices?device_ids=${config.deviceIds.join(',')}&interval=${config.interval || 1.0}`

      if (config.parameters && config.parameters.length > 0) {
        url += `&parameters=${config.parameters.join(',')}`
      }

      console.log('[WebSocket] Building multiple devices URL:', url)
      return url
    }

    console.error('[WebSocket] Invalid config:', {
      mode: config.mode,
      deviceId: config.deviceId,
      deviceIds: config.deviceIds,
    })

    throw new Error('Invalid connection configuration: must provide either deviceId or deviceIds')
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isConnected) {
        this.send({ action: 'ping' })
      }
    }, 30000)
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(config: ConnectionConfig): void {
    if (this.reconnectTimer !== null) {
      return
    }

    console.log('Scheduling reconnect in 5 seconds...')
    this.reconnectTimer = window.setTimeout(() => {
      console.log('Attempting to reconnect...')
      this.reconnectTimer = null
      this.connect(config).catch((error) => {
        console.error('Reconnect failed:', error)
      })
    }, 5000)
  }

  /**
   * Clear reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

// Singleton instance
export const websocketService = new WebSocketService()
