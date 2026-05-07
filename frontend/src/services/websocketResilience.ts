/**
 * PATHMAP V97 - WebSocket Resilience Service
 * ==========================================
 * Handles WebSocket connections with exponential backoff
 * and automatic reconnection.
 */

export interface WebSocketConfig {
  url: string;
  protocols?: string[];
  maxRetries?: number;
  onMessage?: (data: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onReconnecting?: (attempt: number, delay: number) => void;
}

interface BackoffState {
  attempts: number;
  baseDelay: number;
  maxDelay: number;
  multiplier: number;
  jitter: number;
}

class WebSocketResilience {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig | null = null;
  private backoff: BackoffState = {
    attempts: 0,
    baseDelay: 1000,
    maxDelay: 30000,
    multiplier: 2,
    jitter: 0.1,
  };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private intentionallyClosed = false;

  /**
   * Connect to WebSocket with automatic reconnection
   */
  connect(config: WebSocketConfig): WebSocket {
    this.config = config;
    this.intentionallyClosed = false;
    return this.createConnection();
  }

  /**
   * Calculate backoff delay with jitter
   */
  private calculateDelay(): number {
    const delay = Math.min(
      this.backoff.baseDelay * Math.pow(this.backoff.multiplier, this.backoff.attempts),
      this.backoff.maxDelay
    );
    const jitter = delay * this.backoff.jitter * (Math.random() - 0.5);
    return Math.round(delay + jitter);
  }

  /**
   * Reset backoff state after successful connection
   */
  private resetBackoff(): void {
    this.backoff.attempts = 0;
    console.log('[WS] Backoff reset');
  }

  /**
   * Increment backoff and return delay
   */
  private incrementBackoff(): number {
    this.backoff.attempts++;
    const delay = this.calculateDelay();
    console.log(`[WS] Backoff attempt ${this.backoff.attempts}, delay ${delay}ms`);
    return delay;
  }

  /**
   * Create WebSocket connection with event handlers
   */
  private createConnection(): WebSocket {
    if (this.isConnecting || !this.config) {
      return this.ws!;
    }

    this.isConnecting = true;
    const {
      url,
      protocols,
      onMessage,
      onOpen,
      onClose,
      onError,
      onReconnecting,
      maxRetries = 10,
    } = this.config;

    try {
      this.ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.isConnecting = false;
        this.resetBackoff();
        onOpen?.();
      };

      this.ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          onMessage?.(data);
        } catch {
          onMessage?.(event.data);
        }
      };

      this.ws.onclose = event => {
        console.log('[WS] Closed:', event.code, event.reason);
        this.isConnecting = false;
        onClose?.();

        // Attempt reconnection if not intentionally closed
        if (!this.intentionallyClosed && this.backoff.attempts < maxRetries) {
          this.scheduleReconnect(onReconnecting);
        } else if (this.backoff.attempts >= maxRetries) {
          console.warn('[WS] Max reconnection attempts reached');
        }
      };

      this.ws.onerror = error => {
        console.error('[WS] Error:', error);
        this.isConnecting = false;
        onError?.(error);
      };

      return this.ws;
    } catch (error) {
      console.error('[WS] Connection failed:', error);
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(onReconnecting?: (attempt: number, delay: number) => void): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = this.incrementBackoff();
    onReconnecting?.(this.backoff.attempts, delay);

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.backoff.attempts})`);

    this.reconnectTimer = setTimeout(() => {
      if (!this.intentionallyClosed) {
        this.createConnection();
      }
    }, delay);
  }

  /**
   * Send data through WebSocket
   */
  send(data: any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot send - not connected');
      return false;
    }

    try {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(payload);
      return true;
    } catch (error) {
      console.error('[WS] Send failed:', error);
      return false;
    }
  }

  /**
   * Close WebSocket connection intentionally
   */
  close(code?: number, reason?: string): void {
    this.intentionallyClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(code || 1000, reason || 'Client closed');
      this.ws = null;
    }

    this.resetBackoff();
  }

  /**
   * Get current connection state
   */
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current attempt count
   */
  get attempts(): number {
    return this.backoff.attempts;
  }

  /**
   * Force immediate reconnect (resets backoff)
   */
  reconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
    this.resetBackoff();
    this.intentionallyClosed = false;
    this.createConnection();
  }
}

// Singleton instance
export const wsResilience = new WebSocketResilience();

// Factory for multiple connections
export function createResilientWebSocket(config: WebSocketConfig): WebSocketResilience {
  const instance = new WebSocketResilience();
  instance.connect(config);
  return instance;
}
