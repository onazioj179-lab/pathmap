/**
 * PathMap JavaScript Client SDK
 *
 * Provides encrypted location tracking with X25519 key exchange and AES-256-GCM.
 * Works in browsers with Web Crypto API support.
 */

// Type definitions
interface PathMapConfig {
  serverUrl: string;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  locationUpdateInterval?: number;
}

interface AuthResponse {
  user_id: string;
  access_token: string;
  refresh_token?: string;
}

interface Location {
  lat: number;
  lon: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

interface Geofence {
  id: string;
  name: string;
  type: 'circle' | 'polygon';
  center?: { lat: number; lon: number };
  radius_m?: number;
  vertices?: Array<{ lat: number; lon: number }>;
  trigger: 'enter' | 'exit' | 'both';
  color: string;
}

interface TunnelStats {
  connected: boolean;
  session_id?: string;
  messages_sent: number;
  messages_received: number;
  bytes_sent: number;
  bytes_received: number;
  last_key_rotation?: number;
}

type EventHandler<T> = (data: T) => void;

/**
 * Crypto utilities for E2E encryption
 */
class PathMapCrypto {
  private privateKey: CryptoKey | null = null;
  private publicKey: Uint8Array | null = null;
  private sharedSecret: CryptoKey | null = null;

  /**
   * Generate X25519 key pair
   */
  async generateKeyPair(): Promise<Uint8Array> {
    const keyPair = (await crypto.subtle.generateKey({ name: 'X25519' } as Algorithm, true, [
      'deriveBits',
    ])) as CryptoKeyPair;

    this.privateKey = keyPair.privateKey;

    // Export public key
    const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    this.publicKey = new Uint8Array(publicKeyBuffer);

    return this.publicKey;
  }

  /**
   * Derive shared secret from server's public key
   */
  async deriveSharedSecret(serverPublicKeyBase64: string): Promise<void> {
    if (!this.privateKey) {
      throw new Error('Key pair not generated');
    }

    const serverPublicKeyBytes = this.base64ToBytes(serverPublicKeyBase64);
    const serverPublicKey = await crypto.subtle.importKey(
      'raw',
      serverPublicKeyBytes.buffer as ArrayBuffer,
      { name: 'X25519' } as Algorithm,
      false,
      []
    );

    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'X25519', public: serverPublicKey } as EcdhKeyDeriveParams,
      this.privateKey,
      256
    );

    // Derive AES key using HKDF
    const sharedKeyMaterial = await crypto.subtle.importKey(
      'raw',
      sharedBits,
      { name: 'HKDF' } as Algorithm,
      false,
      ['deriveKey']
    );

    this.sharedSecret = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),
        info: new TextEncoder().encode('pathmap-tunnel'),
      } as HkdfParams,
      sharedKeyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  async encrypt(plaintext: string): Promise<string> {
    if (!this.sharedSecret) {
      throw new Error('Shared secret not derived');
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintextBytes = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.sharedSecret,
      plaintextBytes
    );

    // Prepend IV to ciphertext
    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv);
    result.set(new Uint8Array(ciphertext), iv.length);

    return this.bytesToBase64(result);
  }

  /**
   * Decrypt data with AES-256-GCM
   */
  async decrypt(encryptedBase64: string): Promise<string> {
    if (!this.sharedSecret) {
      throw new Error('Shared secret not derived');
    }

    const encryptedBytes = this.base64ToBytes(encryptedBase64);
    const iv = encryptedBytes.slice(0, 12);
    const ciphertext = encryptedBytes.slice(12);

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.sharedSecret,
      ciphertext
    );

    return new TextDecoder().decode(plaintext);
  }

  getPublicKeyBase64(): string {
    if (!this.publicKey) {
      throw new Error('Key pair not generated');
    }
    return this.bytesToBase64(this.publicKey);
  }

  private bytesToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
  }

  private base64ToBytes(base64: string): Uint8Array {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  }
}

/**
 * PathMap Client SDK
 */
class PathMapClient {
  private config: Required<PathMapConfig>;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private _userId: string | null = null;

  // Getter for userId (readonly externally)
  get userId(): string | null {
    return this._userId;
  }

  private ws: WebSocket | null = null;
  private crypto: PathMapCrypto;
  private reconnectAttempts = 0;
  private locationWatchId: number | null = null;

  private stats: TunnelStats = {
    connected: false,
    messages_sent: 0,
    messages_received: 0,
    bytes_sent: 0,
    bytes_received: 0,
  };

  // Event handlers
  private eventHandlers: Map<string, Set<EventHandler<any>>> = new Map();

  constructor(config: PathMapConfig) {
    this.config = {
      serverUrl: config.serverUrl.replace(/\/$/, ''),
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelay: config.reconnectDelay ?? 3000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      locationUpdateInterval: config.locationUpdateInterval ?? 2000,
    };

    this.crypto = new PathMapCrypto();
  }

  // ============== Authentication ==============

  /**
   * Register a new user
   */
  async register(username: string, password: string, email: string): Promise<AuthResponse> {
    const response = await this.request('POST', '/api/v1/social/register', {
      username,
      password,
      email,
    });

    this.setAuth(response);
    return response;
  }

  /**
   * Login with username and password
   */
  async login(username: string, password: string): Promise<AuthResponse> {
    const response = await this.request('POST', '/api/v1/social/login', {
      username,
      password,
    });

    this.setAuth(response);
    return response;
  }

  /**
   * Logout and revoke tokens
   */
  async logout(): Promise<void> {
    if (this.refreshToken) {
      try {
        await this.request('POST', '/api/v1/social/logout', {
          refresh_token: this.refreshToken,
        });
      } catch (e) {
        // Ignore logout errors
      }
    }

    this.accessToken = null;
    this.refreshToken = null;
    this._userId = null;
    this.disconnect();
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await this.request('POST', '/api/v1/social/refresh', {
      refresh_token: this.refreshToken,
    });

    this.accessToken = response.access_token;
    return this.accessToken || '';
  }

  private setAuth(response: AuthResponse): void {
    this.accessToken = response.access_token;
    this.refreshToken = response.refresh_token || null;
    this._userId = response.user_id;
  }

  // ============== Encrypted Tunnel ==============

  /**
   * Connect to encrypted tunnel
   */
  async connect(): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    // Generate key pair
    await this.crypto.generateKeyPair();

    const wsUrl = this.config.serverUrl.replace('http://', 'ws://').replace('https://', 'wss://');

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${wsUrl}/api/v1/tunnel/connect`);

      this.ws.onopen = () => {
        // Send handshake
        this.sendRaw({
          type: 'handshake',
          token: this.accessToken,
          public_key: this.crypto.getPublicKeyBase64(),
        });
      };

      this.ws.onmessage = async event => {
        try {
          const message = JSON.parse(event.data);
          this.stats.messages_received++;
          this.stats.bytes_received += event.data.length;

          await this.handleMessage(message, resolve, reject);
        } catch (e) {
          console.error('Failed to handle message:', e);
        }
      };

      this.ws.onerror = error => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
        reject(error);
      };

      this.ws.onclose = event => {
        this.stats.connected = false;
        this.stats.session_id = undefined;
        this.emit('disconnected', { code: event.code, reason: event.reason });

        if (
          this.config.autoReconnect &&
          this.reconnectAttempts < this.config.maxReconnectAttempts
        ) {
          this.reconnectAttempts++;
          setTimeout(() => this.connect(), this.config.reconnectDelay);
        }
      };
    });
  }

  /**
   * Disconnect from tunnel
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopLocationTracking();
  }

  private async handleMessage(
    message: any,
    resolve?: () => void,
    reject?: (err: Error) => void
  ): Promise<void> {
    switch (message.type) {
      case 'handshake_complete':
        await this.crypto.deriveSharedSecret(message.server_public_key);
        this.stats.connected = true;
        this.stats.session_id = message.session_id;
        this.reconnectAttempts = 0;
        this.emit('connected', { session_id: message.session_id });
        resolve?.();
        break;

      case 'handshake_failed':
        reject?.(new Error(message.reason || 'Handshake failed'));
        break;

      case 'location':
        // Decrypt location from other user
        const decrypted = await this.crypto.decrypt(message.payload);
        const location = JSON.parse(decrypted);
        this.emit('location', { from: message.from, location });
        break;

      case 'geofence_alert':
        this.emit('geofence_alert', message);
        break;

      case 'key_rotation':
        await this.crypto.deriveSharedSecret(message.new_public_key);
        this.stats.last_key_rotation = Date.now();
        this.emit('key_rotation', {});
        break;

      case 'error':
        this.emit('error', new Error(message.message));
        break;
    }
  }

  private sendRaw(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const json = JSON.stringify(data);
      this.ws.send(json);
      this.stats.messages_sent++;
      this.stats.bytes_sent += json.length;
    }
  }

  /**
   * Send encrypted location update
   */
  async sendLocation(location: Location): Promise<void> {
    if (!this.stats.connected) {
      throw new Error('Not connected');
    }

    const encrypted = await this.crypto.encrypt(JSON.stringify(location));
    this.sendRaw({
      type: 'location',
      payload: encrypted,
    });
  }

  // ============== Location Tracking ==============

  /**
   * Start automatic location tracking
   */
  startLocationTracking(): void {
    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported');
    }

    this.locationWatchId = navigator.geolocation.watchPosition(
      async position => {
        const location: Location = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude ?? undefined,
          heading: position.coords.heading ?? undefined,
          speed: position.coords.speed ?? undefined,
          timestamp: position.timestamp,
        };

        try {
          await this.sendLocation(location);
          this.emit('location_sent', location);
        } catch (e) {
          console.error('Failed to send location:', e);
        }
      },
      error => {
        this.emit('location_error', error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: this.config.locationUpdateInterval,
        timeout: 10000,
      }
    );
  }

  /**
   * Stop automatic location tracking
   */
  stopLocationTracking(): void {
    if (this.locationWatchId !== null) {
      navigator.geolocation.clearWatch(this.locationWatchId);
      this.locationWatchId = null;
    }
  }

  // ============== Geofences ==============

  /**
   * Create a circular geofence
   */
  async createCircleGeofence(
    name: string,
    centerLat: number,
    centerLon: number,
    radiusM: number,
    trigger: 'enter' | 'exit' | 'both' = 'both'
  ): Promise<Geofence> {
    return this.request('POST', '/api/v1/geofences', {
      name,
      type: 'circle',
      center_lat: centerLat,
      center_lon: centerLon,
      radius_m: radiusM,
      trigger,
    });
  }

  /**
   * Create a polygon geofence
   */
  async createPolygonGeofence(
    name: string,
    vertices: Array<{ lat: number; lon: number }>,
    trigger: 'enter' | 'exit' | 'both' = 'both'
  ): Promise<Geofence> {
    return this.request('POST', '/api/v1/geofences', {
      name,
      type: 'polygon',
      vertices: vertices.map(v => [v.lat, v.lon]),
      trigger,
    });
  }

  /**
   * List user's geofences
   */
  async listGeofences(): Promise<Geofence[]> {
    return this.request('GET', '/api/v1/geofences');
  }

  /**
   * Delete a geofence
   */
  async deleteGeofence(geofenceId: string): Promise<void> {
    return this.request('DELETE', `/api/v1/geofences/${geofenceId}`);
  }

  // ============== Location Sharing ==============

  /**
   * Start sharing location with another user
   */
  async startSharing(
    recipientId: string,
    precision: 'exact' | 'approximate' | 'city' = 'exact',
    expiresInMinutes?: number
  ): Promise<{ session_id: string; share_code: string }> {
    return this.request('POST', '/api/v1/sharing/start', {
      recipient_id: recipientId,
      precision,
      expires_in_minutes: expiresInMinutes,
    });
  }

  /**
   * Stop sharing location
   */
  async stopSharing(sessionId: string): Promise<void> {
    return this.request('POST', `/api/v1/sharing/${sessionId}/stop`);
  }

  /**
   * Accept sharing invitation via code
   */
  async acceptSharing(shareCode: string): Promise<{ session_id: string }> {
    return this.request('POST', '/api/v1/sharing/accept', {
      share_code: shareCode,
    });
  }

  // ============== Events ==============

  /**
   * Subscribe to events
   */
  on<T>(event: string, handler: EventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unsubscribe from events
   */
  off<T>(event: string, handler: EventHandler<T>): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private emit<T>(event: string, data: T): void {
    this.eventHandlers.get(event)?.forEach(handler => {
      try {
        handler(data);
      } catch (e) {
        console.error(`Error in event handler for ${event}:`, e);
      }
    });
  }

  // ============== Utilities ==============

  /**
   * Get tunnel statistics
   */
  getStats(): TunnelStats {
    return { ...this.stats };
  }

  /**
   * Check server health
   */
  async healthCheck(): Promise<{ status: string; version: string }> {
    return this.request('GET', '/v1/health');
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.config.serverUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 && this.refreshToken) {
      // Try to refresh token
      await this.refreshAccessToken();
      headers['Authorization'] = `Bearer ${this.accessToken}`;

      const retryResponse = await fetch(`${this.config.serverUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!retryResponse.ok) {
        throw new Error(`HTTP ${retryResponse.status}: ${await retryResponse.text()}`);
      }

      return retryResponse.json();
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PathMapClient, PathMapCrypto };
}

export { PathMapClient, PathMapCrypto };
export type { PathMapConfig, AuthResponse, Location, Geofence, TunnelStats };
