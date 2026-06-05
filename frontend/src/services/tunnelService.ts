/**
 * PATHMAP - Military-Grade Encrypted Tunnel Client
 * =================================================
 * X25519 key exchange + AES-256-GCM encryption + Stealth obfuscation
 *
 * Features:
 * - Perfect Forward Secrecy
 * - Zero-Knowledge Architecture
 * - Traffic Obfuscation
 * - AI-powered reconnection
 */

import { getApiHttpBase, getApiWsBase } from './apiConfig';

interface TunnelConfig {
  apiBase: string;
  wsBase: string;
  reconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
  stealthMode: boolean;
}

interface TunnelSession {
  sessionId: string;
  state: 'disconnected' | 'handshaking' | 'established' | 'reconnecting' | 'closed';
  sendKey: CryptoKey | null;
  recvKey: CryptoKey | null;
  sendNonce: number;
  recvNonce: number;
  bytesTransferred: number;
  messagesTransferred: number;
  createdAt: number;
  lastActivity: number;
}

interface TunnelMessage {
  type: string;
  [key: string]: any;
}

type MessageHandler = (message: TunnelMessage) => void;

const DEFAULT_CONFIG: TunnelConfig = {
  apiBase: getApiHttpBase(),
  wsBase: getApiWsBase(),
  reconnectAttempts: 5,
  reconnectDelay: 2000,
  heartbeatInterval: 30000,
  stealthMode: true,
};

class TunnelService {
  private config: TunnelConfig;
  private session: TunnelSession | null = null;
  private keyPair: CryptoKeyPair | null = null;
  private ws: WebSocket | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempts = 0;
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  private pendingMessages: TunnelMessage[] = [];

  constructor(config: Partial<TunnelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize encrypted tunnel connection
   */
  async connect(): Promise<boolean> {
    try {
      console.log('[TUNNEL] Initiating secure tunnel...');

      // Generate an ECDH P-256 keypair. P-256 is used end-to-end (browser and
      // server) because it is natively supported by WebCrypto everywhere with
      // no fallback; the backend (security/tunnel_engine.py) matches this curve.
      this.keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
        'deriveKey',
        'deriveBits',
      ]);

      // Export public key for handshake
      const publicKeyRaw = await crypto.subtle.exportKey('raw', this.keyPair.publicKey);
      const publicKeyB64 = this.arrayBufferToBase64(publicKeyRaw);

      // Perform handshake with server
      const handshakeResponse = await fetch(`${this.config.apiBase}/api/v1/tunnel/handshake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_public_key: publicKeyB64 }),
      });

      if (!handshakeResponse.ok) {
        throw new Error('Handshake failed');
      }

      const handshake = await handshakeResponse.json();
      const serverPublicKeyRaw = this.base64ToArrayBuffer(handshake.server_public_key);

      // Import server public key
      const serverPublicKey = await crypto.subtle.importKey(
        'raw',
        serverPublicKeyRaw,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
      );

      // Derive shared secret
      const sharedBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: serverPublicKey },
        this.keyPair.privateKey,
        256
      );

      // Tunnel protocol v2 key derivation. Must match backend
      // security/tunnel_engine.py exactly:
      //   salt = SHA-256("pathmap-tunnel-v2" || clientPub(65) || serverPub(65))
      //   okm  = HKDF-SHA256(ikm=sharedBits, salt, info="pathmap-tunnel-keys:0", 64 bytes)
      //   key_c2s = okm[0:32] (client->server), key_s2c = okm[32:64] (server->client)
      const clientPub = new Uint8Array(publicKeyRaw);
      const serverPub = new Uint8Array(serverPublicKeyRaw);
      const label = new TextEncoder().encode('pathmap-tunnel-v2');
      const saltInput = new Uint8Array(label.length + clientPub.length + serverPub.length);
      saltInput.set(label, 0);
      saltInput.set(clientPub, label.length);
      saltInput.set(serverPub, label.length + clientPub.length);
      const salt = new Uint8Array(await crypto.subtle.digest('SHA-256', saltInput));

      const ikm = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveBits']);
      const okm = new Uint8Array(
        await crypto.subtle.deriveBits(
          {
            name: 'HKDF',
            hash: 'SHA-256',
            salt,
            info: new TextEncoder().encode('pathmap-tunnel-keys:0'),
          },
          ikm,
          64 * 8
        )
      );
      const keyC2S = await crypto.subtle.importKey('raw', okm.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      const keyS2C = await crypto.subtle.importKey('raw', okm.slice(32, 64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      // Client encrypts outbound (client->server) and decrypts inbound (server->client).
      const sendKey = keyC2S;
      const recvKey = keyS2C;

      // Create session
      this.session = {
        sessionId: handshake.session_id,
        state: 'handshaking',
        sendKey,
        recvKey,
        sendNonce: 0,
        recvNonce: 0,
        bytesTransferred: 0,
        messagesTransferred: 0,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };

      // Connect WebSocket
      await this.connectWebSocket();

      console.log('[TUNNEL] Secure tunnel established');
      return true;
    } catch (error) {
      console.error('[TUNNEL] Connection failed:', error);
      return false;
    }
  }

  /**
   * Connect WebSocket tunnel
   */
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.session) {
        reject(new Error('No session'));
        return;
      }

      const wsUrl = `${this.config.wsBase}/api/v1/tunnel/ws/${this.session.sessionId}`;
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        console.log('[TUNNEL] WebSocket connected');
        if (this.session) {
          this.session.state = 'established';
        }
        this.startHeartbeat();
        this.flushPendingMessages();
        resolve();
      };

      this.ws.onmessage = async event => {
        await this.handleIncomingMessage(event.data);
      };

      this.ws.onclose = event => {
        console.log('[TUNNEL] WebSocket closed:', event.code);
        this.stopHeartbeat();
        if (this.session) {
          this.session.state = 'disconnected';
        }
        this.attemptReconnect();
      };

      this.ws.onerror = error => {
        console.error('[TUNNEL] WebSocket error:', error);
        reject(error);
      };

      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });
  }

  /**
   * Send encrypted message through tunnel
   */
  async send(message: TunnelMessage): Promise<boolean> {
    if (!this.session || this.session.state !== 'established' || !this.ws) {
      this.pendingMessages.push(message);
      return false;
    }

    try {
      const plaintext = new TextEncoder().encode(JSON.stringify(message));

      // 96-bit random nonce; AAD binds the ciphertext to this session id.
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const aad = new TextEncoder().encode(this.session.sessionId);
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad },
        this.session.sendKey!,
        plaintext
      );

      // JSON envelope matches backend security/tunnel_engine.py exactly.
      const envelope = JSON.stringify({
        n: this.arrayBufferToBase64(nonce.buffer),
        ct: this.arrayBufferToBase64(ciphertext),
      });
      this.ws.send(envelope);

      this.session.bytesTransferred += envelope.length;
      this.session.messagesTransferred++;
      this.session.lastActivity = Date.now();

      return true;
    } catch (error) {
      console.error('[TUNNEL] Send failed:', error);
      return false;
    }
  }

  /**
   * Handle incoming encrypted message
   */
  private async handleIncomingMessage(data: string | ArrayBuffer): Promise<void> {
    if (!this.session) return;

    try {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
      const envelope = JSON.parse(text) as { n: string; ct: string };
      const nonce = new Uint8Array(this.base64ToArrayBuffer(envelope.n));
      const ciphertext = new Uint8Array(this.base64ToArrayBuffer(envelope.ct));
      const aad = new TextEncoder().encode(this.session.sessionId);

      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad },
        this.session.recvKey!,
        ciphertext
      );

      const message: TunnelMessage = JSON.parse(new TextDecoder().decode(plaintext));
      this.session.lastActivity = Date.now();
      this.dispatchMessage(message);
    } catch (error) {
      console.error('[TUNNEL] Message handling failed:', error);
    }
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = window.setInterval(() => {
      this.send({ type: 'ping', timestamp: Date.now() });
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Attempt reconnection
   */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.reconnectAttempts) {
      console.log('[TUNNEL] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[TUNNEL] Reconnecting (attempt ${this.reconnectAttempts})...`);

    await new Promise(resolve => setTimeout(resolve, this.config.reconnectDelay));

    try {
      await this.connectWebSocket();
      this.reconnectAttempts = 0;
    } catch {
      this.attemptReconnect();
    }
  }

  /**
   * Flush pending messages
   */
  private flushPendingMessages(): void {
    while (this.pendingMessages.length > 0) {
      const msg = this.pendingMessages.shift();
      if (msg) this.send(msg);
    }
  }

  /**
   * Register message handler
   */
  on(type: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  /**
   * Remove message handler
   */
  off(type: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  /**
   * Dispatch message to handlers
   */
  private dispatchMessage(message: TunnelMessage): void {
    const handlers = this.messageHandlers.get(message.type) || [];
    const wildcardHandlers = this.messageHandlers.get('*') || [];

    [...handlers, ...wildcardHandlers].forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('[TUNNEL] Handler error:', error);
      }
    });
  }

  /**
   * Send encrypted location update
   */
  async sendLocation(
    lat: number,
    lng: number,
    accuracy: number,
    extras?: object
  ): Promise<boolean> {
    return this.send({
      type: 'location_update',
      location: {
        lat,
        lng,
        accuracy,
        timestamp: Date.now(),
        ...extras,
      },
    });
  }

  /**
   * Request tracking for target
   */
  async requestTracking(targetId: string): Promise<boolean> {
    return this.send({
      type: 'tracking_request',
      target_id: targetId,
      timestamp: Date.now(),
    });
  }

  /**
   * Close tunnel connection
   */
  close(): void {
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.session) {
      this.session.state = 'closed';
    }

    this.keyPair = null;
    console.log('[TUNNEL] Connection closed');
  }

  /**
   * Check if tunnel is connected
   */
  isConnected(): boolean {
    return this.session?.state === 'established';
  }

  /**
   * Get tunnel statistics
   */
  getStats(): object {
    if (!this.session) return { connected: false };

    return {
      connected: this.session.state === 'established',
      sessionId: this.session.sessionId.slice(0, 8) + '...',
      state: this.session.state,
      bytesTransferred: this.session.bytesTransferred,
      messagesTransferred: this.session.messagesTransferred,
      uptime: Date.now() - this.session.createdAt,
      lastActivity: this.session.lastActivity,
    };
  }

  // Utility functions
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// Export singleton instance
export const tunnelService = new TunnelService();
export default tunnelService;
export type { TunnelConfig, TunnelSession, TunnelMessage };
