/**
 * PathMap Tracking Service
 * Complete device tracking API client with real-time WebSocket support
 * Integrated with Military-Grade Encrypted Tunnel
 */

import { tunnelService } from './tunnelService';
import { authService } from './authService';
import { getApiHttpBase, getApiWsBase } from './apiConfig';

const API_BASE = `${getApiHttpBase()}/api/v1/tracking`;
const WS_BASE = `${getApiWsBase()}/api/v1/tracking`;

// Types
export interface TrackedDevice {
  id: string;
  name: string;
  type: 'phone' | 'tablet' | 'laptop' | 'watch' | 'other';
  platform?: string;
  is_primary: boolean;
  created_at: string;
  last_seen?: string;
  battery_level?: number;
  is_charging?: boolean;
}

export interface LocationData {
  lat: number;
  lng: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  source: 'gps' | 'wifi' | 'cellular' | 'bluetooth' | 'ip' | 'fused';
  timestamp: string;
}

export interface Geofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  type: 'home' | 'work' | 'safe' | 'alert' | 'custom';
  notify_on_enter: boolean;
  notify_on_exit: boolean;
  active: boolean;
  created_at: string;
}

export interface ShareLink {
  id: string;
  token: string;
  device_id: string;
  expires_at: string;
  created_at: string;
  view_count: number;
  url: string;
}

export interface LocationHistory {
  device_id: string;
  locations: LocationData[];
  total: number;
  from_date: string;
  to_date: string;
}

// Storage keys
const TOKEN_KEY = 'pathmap_tracking_token';
const USER_KEY = 'pathmap_tracking_user';
const DEVICE_ID_KEY = 'pathmap_device_id';

// Auth state change callback
type AuthCallback = (authenticated: boolean) => void;

class TrackingService {
  private token: string | null = null;
  private userId: string | null = null;
  private deviceId: string | null = null;
  private ws: WebSocket | null = null;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authCallbacks: Set<AuthCallback> = new Set();
  private locationCallbacks: Set<(location: LocationData) => void> = new Set();
  private geofenceCallbacks: Set<(event: { type: string; geofence: Geofence }) => void> = new Set();
  private tunnelEnabled: boolean = true; // Encrypted tunnel mode

  constructor() {
    this.loadFromStorage();
    this.initTunnel(); // Initialize encrypted tunnel
  }

  // Initialize encrypted tunnel connection
  private async initTunnel(): Promise<void> {
    if (this.tunnelEnabled) {
      console.log('[TrackingService] Initializing encrypted tunnel...');
      const connected = await tunnelService.connect();
      if (connected) {
        console.log('[TrackingService] Encrypted tunnel ACTIVE - all location data protected');

        // Associate the tunnel with the signed-in user so location updates are
        // attributed and persisted. Register now if already authenticated, and
        // again whenever the user logs in while the tunnel is connected.
        const registerIfPossible = () => {
          const token = authService.getAccessToken();
          if (token && tunnelService.isConnected() && !tunnelService.isRegistered()) {
            void tunnelService.registerSession(token);
          }
        };
        registerIfPossible();
        authService.onAuthChange(isAuth => {
          if (isAuth) registerIfPossible();
        });

        // Register tunnel message handlers
        tunnelService.on('location_update', msg => {
          if (msg.location) {
            this.locationCallbacks.forEach(cb => cb(msg.location as LocationData));
          }
        });

        tunnelService.on('geofence_enter', msg => {
          this.geofenceCallbacks.forEach(cb => cb(msg as { type: string; geofence: Geofence }));
        });

        tunnelService.on('geofence_exit', msg => {
          this.geofenceCallbacks.forEach(cb => cb(msg as { type: string; geofence: Geofence }));
        });
      } else {
        console.warn('[TrackingService] Tunnel connection failed - using standard WebSocket');
        this.tunnelEnabled = false;
      }
    }
  }

  // Check if encrypted tunnel is active
  isTunnelActive(): boolean {
    return this.tunnelEnabled && tunnelService.isConnected();
  }

  // Get tunnel statistics
  getTunnelStats(): object {
    return tunnelService.getStats();
  }

  // ============ STORAGE ============

  private loadFromStorage(): void {
    this.token = localStorage.getItem(TOKEN_KEY);
    this.userId = localStorage.getItem(USER_KEY);
    this.deviceId = localStorage.getItem(DEVICE_ID_KEY);
  }

  private saveToStorage(): void {
    if (this.token) localStorage.setItem(TOKEN_KEY, this.token);
    if (this.userId) localStorage.setItem(USER_KEY, this.userId);
    if (this.deviceId) localStorage.setItem(DEVICE_ID_KEY, this.deviceId);
  }

  private clearStorage(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
    this.token = null;
    this.userId = null;
    this.deviceId = null;
  }

  // ============ AUTH CALLBACKS ============

  onAuthChange(callback: AuthCallback): () => void {
    this.authCallbacks.add(callback);
    callback(this.isAuthenticated());
    return () => this.authCallbacks.delete(callback);
  }

  private notifyAuthChange(): void {
    const isAuth = this.isAuthenticated();
    this.authCallbacks.forEach(cb => cb(isAuth));
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  getToken(): string | null {
    return this.token;
  }

  getUserId(): string | null {
    return this.userId;
  }

  getDeviceId(): string | null {
    return this.deviceId;
  }

  // ============ HTTP HELPERS ============

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ============ AUTH ============

  async register(email: string, password: string, name: string): Promise<void> {
    const data = await this.request<{ token: string; user_id: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });

    this.token = data.token;
    this.userId = data.user_id;
    this.saveToStorage();
    this.notifyAuthChange();
  }

  async login(email: string, password: string): Promise<void> {
    const data = await this.request<{ token: string; user_id: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.token = data.token;
    this.userId = data.user_id;
    this.saveToStorage();
    this.notifyAuthChange();

    // Connect WebSocket after login
    this.connectWebSocket();
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore errors on logout
    }
    this.disconnectWebSocket();
    this.clearStorage();
    this.notifyAuthChange();
  }

  async getCurrentUser(): Promise<{ email: string; name: string; created_at: string }> {
    return this.request('/auth/me');
  }

  // ============ DEVICES ============

  async registerDevice(name: string, type: TrackedDevice['type']): Promise<TrackedDevice> {
    const platform = navigator.platform || 'Unknown';
    const userAgent = navigator.userAgent;

    const device = await this.request<TrackedDevice>('/devices/register', {
      method: 'POST',
      body: JSON.stringify({ name, type, platform, user_agent: userAgent }),
    });

    this.deviceId = device.id;
    this.saveToStorage();
    return device;
  }

  async getDevices(): Promise<TrackedDevice[]> {
    return this.request('/devices');
  }

  async getDevice(deviceId: string): Promise<TrackedDevice> {
    return this.request(`/devices/${deviceId}`);
  }

  async updateDevice(deviceId: string, updates: Partial<TrackedDevice>): Promise<TrackedDevice> {
    return this.request(`/devices/${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteDevice(deviceId: string): Promise<void> {
    await this.request(`/devices/${deviceId}`, { method: 'DELETE' });
  }

  // ============ LOCATION ============

  async updateLocation(location: Omit<LocationData, 'timestamp'>): Promise<{ success: boolean }> {
    const deviceId = this.deviceId;
    if (!deviceId) throw new Error('No device registered');

    // Route through encrypted tunnel if active
    if (this.isTunnelActive()) {
      const success = await tunnelService.sendLocation(
        location.lat,
        location.lng,
        location.accuracy,
        {
          altitude: location.altitude,
          speed: location.speed,
          heading: location.heading,
          source: location.source,
          device_id: deviceId,
        }
      );
      return { success };
    }

    // Fallback to standard HTTP
    return this.request('/location/update', {
      method: 'POST',
      body: JSON.stringify({
        device_id: deviceId,
        ...location,
      }),
    });
  }

  async getDeviceLocation(deviceId: string): Promise<LocationData | null> {
    try {
      return await this.request(`/location/${deviceId}`);
    } catch {
      return null;
    }
  }

  async getLocationHistory(
    deviceId: string,
    startDate?: Date,
    endDate?: Date,
    limit?: number
  ): Promise<LocationHistory> {
    const params = new URLSearchParams();
    if (startDate) params.set('start', startDate.toISOString());
    if (endDate) params.set('end', endDate.toISOString());
    if (limit) params.set('limit', limit.toString());

    return this.request(`/location/${deviceId}/history?${params}`);
  }

  // ============ GEOFENCES ============

  async createGeofence(geofence: Omit<Geofence, 'id' | 'created_at'>): Promise<Geofence> {
    return this.request('/geofences', {
      method: 'POST',
      body: JSON.stringify(geofence),
    });
  }

  async getGeofences(): Promise<Geofence[]> {
    return this.request('/geofences');
  }

  async updateGeofence(geofenceId: string, updates: Partial<Geofence>): Promise<Geofence> {
    return this.request(`/geofences/${geofenceId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteGeofence(geofenceId: string): Promise<void> {
    await this.request(`/geofences/${geofenceId}`, { method: 'DELETE' });
  }

  // ============ SHARING ============

  async createShareLink(deviceId: string, expiresInHours: number = 24): Promise<ShareLink> {
    return this.request('/share', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, expires_in_hours: expiresInHours }),
    });
  }

  async getShareLinks(): Promise<ShareLink[]> {
    return this.request('/share');
  }

  async revokeShareLink(linkId: string): Promise<void> {
    await this.request(`/share/${linkId}`, { method: 'DELETE' });
  }

  async getSharedLocation(token: string): Promise<LocationData> {
    return this.request(`/share/view/${token}`);
  }

  // ============ GDPR / DATA EXPORT ============

  async exportData(): Promise<Blob> {
    const response = await fetch(`${API_BASE}/data/export`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });
    return response.blob();
  }

  async deleteAllData(): Promise<void> {
    await this.request('/data/delete', { method: 'DELETE' });
    this.clearStorage();
    this.notifyAuthChange();
  }

  // ============ WEBSOCKET ============

  onLocationUpdate(callback: (location: LocationData) => void): () => void {
    this.locationCallbacks.add(callback);
    return () => this.locationCallbacks.delete(callback);
  }

  onGeofenceEvent(callback: (event: { type: string; geofence: Geofence }) => void): () => void {
    this.geofenceCallbacks.add(callback);
    return () => this.geofenceCallbacks.delete(callback);
  }

  connectWebSocket(): void {
    if (!this.userId || !this.token) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(`${WS_BASE}/ws/${this.userId}?token=${this.token}`);

      this.ws.onopen = () => {
        console.log('[TrackingService] WebSocket connected');
        if (this.wsReconnectTimer) {
          clearTimeout(this.wsReconnectTimer);
          this.wsReconnectTimer = null;
        }
      };

      this.ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'location_update') {
            this.locationCallbacks.forEach(cb => cb(data.location));
          } else if (data.type === 'geofence_enter' || data.type === 'geofence_exit') {
            this.geofenceCallbacks.forEach(cb => cb(data));
          }
        } catch (error) {
          console.error('[TrackingService] WebSocket message error:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('[TrackingService] WebSocket closed');
        this.scheduleReconnect();
      };

      this.ws.onerror = error => {
        console.error('[TrackingService] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[TrackingService] WebSocket connection failed:', error);
      this.scheduleReconnect();
    }
  }

  disconnectWebSocket(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.wsReconnectTimer) return;
    if (!this.isAuthenticated()) return;

    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.connectWebSocket();
    }, 5000);
  }

  // ============ BACKGROUND TRACKING ============

  async startBackgroundTracking(): Promise<void> {
    // Request background sync permission
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register('location-sync');
    }

    // Request periodic background sync if available
    if ('periodicSync' in ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready;
      try {
        await (registration as any).periodicSync.register('location-update', {
          minInterval: 15 * 60 * 1000, // 15 minutes
        });
      } catch {
        console.log('[TrackingService] Periodic sync not available');
      }
    }
  }

  async stopBackgroundTracking(): Promise<void> {
    if ('periodicSync' in ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready;
      try {
        await (registration as any).periodicSync.unregister('location-update');
      } catch {
        // Ignore
      }
    }
  }

  // ============ GEOLOCATION HELPERS ============

  async getCurrentPosition(): Promise<LocationData> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        position => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude || undefined,
            speed: position.coords.speed || undefined,
            heading: position.coords.heading || undefined,
            source: 'gps',
            timestamp: new Date().toISOString(),
          });
        },
        error => {
          reject(new Error(`Geolocation error: ${error.message}`));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }

  watchPosition(callback: (location: LocationData) => void): number {
    return navigator.geolocation.watchPosition(
      position => {
        callback({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude || undefined,
          speed: position.coords.speed || undefined,
          heading: position.coords.heading || undefined,
          source: 'gps',
          timestamp: new Date().toISOString(),
        });
      },
      error => {
        console.error('[TrackingService] Watch position error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );
  }

  clearWatch(watchId: number): void {
    navigator.geolocation.clearWatch(watchId);
  }
}

// Export singleton instance
export const trackingService = new TrackingService();
export default trackingService;
