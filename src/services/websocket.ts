/**
 * WebSocket Service
 * 使用動態 URL，自動適應部署環境
 * ✅ 改進：自動判斷 single/multiple 模式
 */

import type { ConnectionConfig, WebSocketMessage, WebSocketCommand } from '@/types'

export class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private isManualClose: boolean = false

  // 事件處理器
  public onOpen: (() => void) | null = null
  public onClose: (() => void) | null = null
  public onError: ((error: Event) => void) | null = null
  public onMessage: ((data: WebSocketMessage) => void) | null = null

  /**
   * 連接 WebSocket
   */
  connect(config: ConnectionConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = this.buildWebSocketUrl(config)

        this.ws = new WebSocket(url)
        this.isManualClose = false

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

          // 如果不是手動關閉，嘗試重連
          if (!this.isManualClose && event.code !== 1000) {
            this.scheduleReconnect(config)
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
   * 中斷連接
   */
  disconnect(): void {
    this.isManualClose = true
    this.stopHeartbeat()
    this.clearReconnectTimer()

    if (this.ws) {
      // 使用正常關閉碼
      this.ws.close(1000, 'User disconnected')
      this.ws = null
    }
  }

  /**
   * 發送訊息
   */
  send(message: WebSocketCommand): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    this.ws.send(JSON.stringify(message))
  }

  /**
   * 檢查連接狀態
   */
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  /**
   * 建立 WebSocket URL
   * ✅ 改進：自動判斷 single/multiple 模式
   */
  private buildWebSocketUrl(config: ConnectionConfig): string {
    // 動態獲取協議和 host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const baseUrl = `${protocol}//${host}`

    // ✅ 自動判斷模式
    const mode = config.mode || (config.deviceId ? 'single' : config.deviceIds ? 'multiple' : null)

    if (mode === 'single' && config.deviceId) {
      // 單設備模式
      let url = `${baseUrl}/api/monitoring/device/${config.deviceId}?interval=${config.interval || 1.0}`

      if (config.parameters && config.parameters.length > 0) {
        url += `&parameters=${config.parameters.join(',')}`
      }

      console.log('[WebSocket] Building single device URL:', url)
      return url
    } else if (mode === 'multiple' && config.deviceIds && config.deviceIds.length > 0) {
      // 多設備模式
      let url = `${baseUrl}/api/monitoring/devices?device_ids=${config.deviceIds.join(',')}&interval=${config.interval || 1.0}`

      if (config.parameters && config.parameters.length > 0) {
        url += `&parameters=${config.parameters.join(',')}`
      }

      console.log('[WebSocket] Building multiple devices URL:', url)
      return url
    }

    // 提供更詳細的錯誤訊息
    console.error('[WebSocket] Invalid config:', {
      mode: config.mode,
      deviceId: config.deviceId,
      deviceIds: config.deviceIds,
      hasDeviceId: !!config.deviceId,
      hasDeviceIds: !!config.deviceIds,
    })

    throw new Error(
      'Invalid connection configuration: ' +
        'must provide either deviceId (single mode) or deviceIds (multiple mode)',
    )
  }

  /**
   * 啟動心跳檢測
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isConnected) {
        this.send({ action: 'ping' })
      }
    }, 30000) // 每 30 秒發送一次 ping
  }

  /**
   * 停止心跳檢測
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * 安排重連
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
   * 清除重連計時器
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

// 單例模式
export const websocketService = new WebSocketService()
