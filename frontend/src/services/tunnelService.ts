/**
 * PATHMAP - Encrypted Tunnel Client (protocol v2)
 * ===============================================
 * ECDH P-256 key exchange + HKDF-SHA256 + AES-256-GCM authenticated encryption.
 *
 * Live protocol (matches backend security/tunnel_engine.py + api/tunnel_api.py):
 *   1. POST /api/v1/tunnel/handshake { client_public_key } -> { session_id, server_public_key }
 *      Public keys are 65-byte uncompressed P-256 points (0x04 || X(32) || Y(32)).
 *   2. salt = SHA-256("pathmap-tunnel-v2" || clientPub(65) || serverPub(65))
 *      okm  = HKDF-SHA256(ikm=ECDH(sharedBits), salt, info="pathmap-tunnel-keys:0", 64 bytes)
 *      key_c2s = okm[0:32] (client->server), key_s2c = okm[32:64] (server->client)
 *   3. WS /api/v1/tunnel/ws/{session_id}. Each frame is a JSON envelope
 *      {"n": base64(nonce12), "ct": base64(ciphertext+tag)}, AES-256-GCM, AAD = utf8(session_id).
 *   4. First app message is { type: "tunnel_register", token } to bind the session to a user.
 *
 * Properties: perfect forward secrecy (ephemeral keys per connection; a reconnect
 * performs a fresh ECDH handshake), authenticated encryption, per-session AAD.
 * Mid-session key rotation is not negotiated with the browser (see backend
 * should_rotate_keys), so getSecurityState() reports ephemeral-per-session keys.
 */

import { getApiHttpBase, getApiWsBase } from './apiConfig';
import { eventBus } from './eventBus';

interface TunnelConfig {
  apiBase: string;
  wsBase: string;
  reconnectAttempts: number;
  reconnectDelay: number;
  maxReconnectDelay: number;
  heartbeatInterval: number;
  stealthMode: boolean;
}

/** Connection state broadcast on the `tunnel:state` event for HUD/indicators. */
export type TunnelConnState =
  | 'disconnected'
  | 'handshaking'
  | 'established'
  | 'reconnecting'
  | 'failed'
  | 'closed';

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
  reconnectAttempts: 8,
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  heartbeatInterval: 30000,
  stealthMode: true,
};

// Bound on the offline send buffer so a long outage can't grow memory without
// limit. Oldest frames are dropped first (newest position/route matters most).
const MAX_PENDING_MESSAGES = 500;

class TunnelService {
  private config: TunnelConfig;
  private session: TunnelSession | null = null;
  private keyPair: CryptoKeyPair | null = null;
  private ws: WebSocket | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempts = 0;
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  private pendingMessages: TunnelMessage[] = [];
  private registered = false;
  private reqCounter = 0;
  // Resilience state.
  private autoReconnect = true;
  private reconnecting = false;
  private lastToken: string | null = null;
  private connState: TunnelConnState = 'disconnected';

  constructor(config: Partial<TunnelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Broadcast a connection-state change once, on the `tunnel:state` event. */
  private setState(state: TunnelConnState): void {
    if (this.connState === state) return;
    this.connState = state;
    if (this.session) {
      // Keep the session view in sync for getStats()/getSecurityState().
      this.session.state =
        state === 'established'
          ? 'established'
          : state === 'closed'
            ? 'closed'
            : state === 'reconnecting'
              ? 'reconnecting'
              : 'disconnected';
    }
    eventBus.emit('tunnel:state', { state, registered: this.registered });
  }

  getConnState(): TunnelConnState {
    return this.connState;
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

      this.setState('handshaking');

      // Connect WebSocket
      await this.connectWebSocket();

      console.log('[TUNNEL] Secure tunnel established');
      return true;
    } catch (error) {
      console.error('[TUNNEL] Connection failed:', error);
      this.setState('disconnected');
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
        this.reconnectAttempts = 0;
        this.setState('established');
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
        this.registered = false;
        if (this.connState !== 'closed') {
          this.setState('disconnected');
          void this.attemptReconnect();
        }
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
      // Buffer in order while disconnected; drop the oldest if the outage is
      // long enough to exceed the cap (newest frames are the most relevant).
      this.pendingMessages.push(message);
      if (this.pendingMessages.length > MAX_PENDING_MESSAGES) {
        this.pendingMessages.shift();
      }
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
   * Reconnect after a drop. The server destroys the session on disconnect, so a
   * reconnect performs a FULL fresh ECDH handshake (not just a socket reopen)
   * and transparently re-registers the user. Backoff is exponential with full
   * jitter, capped at maxReconnectDelay. A single loop runs at a time.
   */
  private async attemptReconnect(): Promise<void> {
    if (!this.autoReconnect || this.reconnecting) return;
    if (this.reconnectAttempts >= this.config.reconnectAttempts) {
      console.log('[TUNNEL] Max reconnect attempts reached');
      this.setState('failed');
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;
    this.setState('reconnecting');

    // Exponential backoff with full jitter: random in [0, base], base capped.
    const base = Math.min(
      this.config.reconnectDelay * 2 ** (this.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );
    const delay = Math.floor(Math.random() * base);
    console.log(`[TUNNEL] Reconnecting (attempt ${this.reconnectAttempts}) in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));

    if (!this.autoReconnect) {
      this.reconnecting = false;
      return;
    }

    const ok = await this.connect();
    this.reconnecting = false;
    if (ok) {
      // Restore the authenticated association so persistence resumes silently.
      if (this.lastToken) await this.registerSession(this.lastToken);
    } else {
      void this.attemptReconnect();
    }
  }

  /** Manually (re)establish the tunnel, e.g. after coming back online. */
  async ensureConnected(): Promise<void> {
    this.autoReconnect = true;
    if (this.isConnected()) return;
    this.reconnectAttempts = 0;
    if (!this.reconnecting) await this.attemptReconnect();
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
   * Send a payload over the encrypted tunnel when it is established and
   * registered, otherwise invoke the provided HTTP fallback. This generalizes
   * the capability-check pattern so every caller (location, route, task) gets
   * the same "encrypt if possible, never drop the request" behaviour.
   */
  async sendOrFallback(
    type: string,
    payload: Record<string, unknown>,
    httpFallback: () => void | Promise<unknown>
  ): Promise<boolean> {
    if (this.isConnected() && this.isRegistered()) {
      const ok = await this.send({ type, ...payload });
      if (ok) return true;
    }
    try {
      await httpFallback();
    } catch (error) {
      console.error('[TUNNEL] Fallback failed:', error);
    }
    return false;
  }

  /**
   * Send a message and resolve with the correlated response (matched by reqId)
   * over the encrypted tunnel. Resolves null if the tunnel is unavailable or no
   * response arrives within timeoutMs, so callers can fall back to HTTP.
   */
  async request(
    type: string,
    payload: Record<string, unknown>,
    timeoutMs = 8000
  ): Promise<TunnelMessage | null> {
    if (!this.isConnected() || !this.isRegistered()) return null;
    const reqId = `${type}:${++this.reqCounter}`;
    return new Promise<TunnelMessage | null>(resolve => {
      const handler = (msg: TunnelMessage) => {
        if (msg && msg.reqId === reqId) {
          this.off('*', handler);
          clearTimeout(timer);
          resolve(msg);
        }
      };
      const timer = setTimeout(() => {
        this.off('*', handler);
        resolve(null);
      }, timeoutMs);
      this.on('*', handler);
      void this.send({ type, reqId, ...payload });
    });
  }

  /**
   * Request a route over the encrypted tunnel (origin/destination never travel
   * in plaintext). Resolves the route payload, or null when the tunnel can't
   * fulfil it so the caller can fall back to the HTTP route endpoint.
   */
  async sendRouteRequest(
    request: Record<string, unknown>,
    timeoutMs = 8000
  ): Promise<Record<string, unknown> | null> {
    const resp = await this.request('route_request', { request }, timeoutMs);
    if (resp && resp.ok && resp.route) return resp.route as Record<string, unknown>;
    return null;
  }

  /**
   * Send a tracking-target/task update through the encrypted tunnel, with HTTP
   * fallback. action is add | remove | update.
   */
  async sendTaskUpdate(
    action: 'add' | 'remove' | 'update',
    target: Record<string, unknown>,
    httpFallback: () => void | Promise<unknown>
  ): Promise<boolean> {
    return this.sendOrFallback(
      'task_update',
      { action, target, timestamp: Date.now() },
      httpFallback
    );
  }

  /**
   * Associate this established tunnel session with an authenticated user by
   * sending the bearer token over the encrypted channel. Must be called (and
   * resolve true) before location updates will be persisted server-side.
   */
  async registerSession(token: string): Promise<boolean> {
    if (!token || !this.isConnected()) return false;
    // Remember the token so a transparent reconnect can re-register without the
    // caller's involvement.
    this.lastToken = token;
    return new Promise<boolean>(resolve => {
      const cleanup = () => {
        clearTimeout(timer);
        this.off('tunnel_registered', onOk);
        this.off('tunnel_register_failed', onFail);
      };
      const onOk = () => {
        this.registered = true;
        eventBus.emit('tunnel:state', { state: this.connState, registered: true });
        cleanup();
        resolve(true);
      };
      const onFail = () => {
        cleanup();
        resolve(false);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 5000);
      this.on('tunnel_registered', onOk);
      this.on('tunnel_register_failed', onFail);
      this.send({ type: 'tunnel_register', token });
    });
  }

  isRegistered(): boolean {
    return this.registered;
  }

  /**
   * Compact security state for telemetry/UI. Keys are ephemeral per connection
   * (forward secrecy across sessions); mid-session rotation is not negotiated
   * with the browser, so rekeyedAt reflects the handshake/reconnect time.
   */
  getSecurityState(): {
    connected: boolean;
    registered: boolean;
    encrypted: boolean;
    cipher: string;
    keyExchange: string;
    sessionId: string | null;
    establishedAt: number | null;
    bytesTransferred: number;
    messagesTransferred: number;
  } {
    const s = this.session;
    return {
      connected: s?.state === 'established',
      registered: this.registered,
      encrypted: s?.state === 'established' && !!s?.sendKey,
      cipher: 'AES-256-GCM',
      keyExchange: 'ECDH P-256 + HKDF-SHA256',
      sessionId: s ? s.sessionId.slice(0, 8) + '...' : null,
      establishedAt: s?.createdAt ?? null,
      bytesTransferred: s?.bytesTransferred ?? 0,
      messagesTransferred: s?.messagesTransferred ?? 0,
    };
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
   * Close tunnel connection. Sends a best-effort encrypted "close" frame so the
   * server can tear the session down promptly, then zeroizes in-memory key
   * material. Call on logout and page unload.
   */
  close(): void {
    this.stopHeartbeat();
    // Prevent the onclose handler from trying to reconnect a deliberate close.
    this.autoReconnect = false;
    this.reconnecting = false;
    this.lastToken = null;

    // Send the close frame while the session is still established (before we
    // flip state, which would cause send() to buffer instead of transmit).
    if (this.session?.state === 'established' && this.ws) {
      try {
        void this.send({ type: 'close', timestamp: Date.now() });
      } catch {
        /* best effort */
      }
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.session) {
      // Zeroize key references so derived secrets are not retained after close.
      this.session.sendKey = null;
      this.session.recvKey = null;
    }
    this.setState('closed');

    this.keyPair = null;
    this.registered = false;
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

// Tear the tunnel down on page unload so the server frees the session promptly
// and in-memory key material is zeroized rather than left dangling.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => tunnelService.close());
}

// Dev-only handle so end-to-end test bots can drive the real client in-page
// (handshake + register + send) without re-implementing the crypto. Never ships
// in production builds because import.meta.env.DEV is false there.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __tunnel?: TunnelService }).__tunnel = tunnelService;
}
