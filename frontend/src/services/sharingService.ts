/**
 * PATHMAP - Location Sharing Service
 * API client for location sharing features
 */

import { authService } from './authService';

export interface FriendLocation {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  precision: 'exact' | 'approximate' | 'city';
  expires_at?: number;
}

export interface SharingSession {
  session_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  precision: string;
  started_at: number;
  expires_at?: number;
}

export interface Geofence {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  trigger_type: 'enter' | 'exit' | 'both';
  is_active: boolean;
  user_count: number;
  created_at: number;
}

export interface GeofenceAlert {
  id: number;
  geofence_id: string;
  geofence_name: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  trigger_type: 'enter' | 'exit';
  latitude: number;
  longitude: number;
  timestamp: number;
  is_read: boolean;
}

export interface SavedLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  icon: string;
  created_at: number;
}

export interface PrivacySettings {
  data_retention_days: number;
  share_analytics: boolean;
  allow_tracking: boolean;
  discoverable: boolean;
  show_online_status: boolean;
  show_last_location: boolean;
}

class SharingService {
  private baseUrl = '/api/v1/social';
  private locationUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private locationWatchId: number | null = null;

  // ============== LOCATION SHARING ==============

  /**
   * Start sharing location with a friend
   */
  async startSharing(
    sharedWithId: string,
    precision: 'exact' | 'approximate' | 'city' = 'approximate',
    durationSeconds?: number
  ): Promise<string> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/sharing/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shared_with_id: sharedWithId,
        precision,
        duration_seconds: durationSeconds,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to start sharing');
    }

    const result = await response.json();
    return result.data.session_id;
  }

  /**
   * Stop sharing location with a friend
   */
  async stopSharing(sharedWithId: string): Promise<void> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/sharing/stop/${sharedWithId}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to stop sharing');
    }
  }

  /**
   * Stop sharing with everyone
   */
  async stopSharingAll(): Promise<number> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/sharing/stop-all`, {
      method: 'POST',
    });

    const result = await response.json();
    return result.data?.count || 0;
  }

  /**
   * Enable/disable ghost mode
   */
  async setGhostMode(enabled: boolean): Promise<void> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/sharing/ghost-mode?enable=${enabled}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to toggle ghost mode');
    }
  }

  /**
   * Update current location
   */
  async updateLocation(
    latitude: number,
    longitude: number,
    accuracy?: number,
    altitude?: number,
    speed?: number,
    heading?: number
  ): Promise<{ broadcasts: number; geofence_alerts: number }> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/sharing/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude,
        longitude,
        accuracy,
        altitude,
        speed,
        heading,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update location');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get locations of all friends sharing with you
   */
  async getFriendLocations(): Promise<FriendLocation[]> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/sharing/friends`);
    const result = await response.json();
    return result.data;
  }

  /**
   * Get your active sharing sessions (who you're sharing with)
   */
  async getActiveSessions(): Promise<SharingSession[]> {
    try {
      const response = await authService.authenticatedFetch(`${this.baseUrl}/sharing/sessions`);
      if (!response.ok) return [];
      const result = await response.json();
      return result.data || [];
    } catch {
      return [];
    }
  }

  /**
   * Get location of a specific friend
   */
  async getFriendLocation(friendId: string): Promise<FriendLocation | null> {
    try {
      const response = await authService.authenticatedFetch(
        `${this.baseUrl}/sharing/friend/${friendId}`
      );
      const result = await response.json();
      return result.data;
    } catch {
      return null;
    }
  }

  /**
   * Get all sharing sessions
   */
  async getSharingSessions(): Promise<{ incoming: SharingSession[]; outgoing: SharingSession[] }> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/sharing/sessions`);
    const result = await response.json();
    return result.data;
  }

  /**
   * Start automatic location updates
   */
  startLocationTracking(_intervalMs: number = 30000): void {
    if (this.locationWatchId !== null) {
      return; // Already tracking
    }

    // Use high-accuracy GPS watching
    if ('geolocation' in navigator) {
      this.locationWatchId = navigator.geolocation.watchPosition(
        async (position) => {
          try {
            await this.updateLocation(
              position.coords.latitude,
              position.coords.longitude,
              position.coords.accuracy,
              position.coords.altitude ?? undefined,
              position.coords.speed ?? undefined,
              position.coords.heading ?? undefined
            );
          } catch (e) {
            console.error('Failed to update location:', e);
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    }
  }

  /**
   * Stop automatic location updates
   */
  stopLocationTracking(): void {
    if (this.locationWatchId !== null) {
      navigator.geolocation.clearWatch(this.locationWatchId);
      this.locationWatchId = null;
    }

    if (this.locationUpdateInterval !== null) {
      clearInterval(this.locationUpdateInterval);
      this.locationUpdateInterval = null;
    }
  }

  // ============== GEOFENCES ==============

  /**
   * Get all geofences
   */
  async getGeofences(): Promise<Geofence[]> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/geofences`);
    const result = await response.json();
    return result.data;
  }

  /**
   * Create geofence
   */
  async createGeofence(data: {
    name: string;
    latitude: number;
    longitude: number;
    radius_meters?: number;
    trigger_type?: 'enter' | 'exit' | 'both';
    user_ids?: string[];
  }): Promise<string> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/geofences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create geofence');
    }

    const result = await response.json();
    return result.data.geofence_id;
  }

  /**
   * Delete geofence
   */
  async deleteGeofence(geofenceId: string): Promise<void> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/geofences/${geofenceId}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete geofence');
    }
  }

  /**
   * Get geofence alerts
   */
  async getGeofenceAlerts(limit: number = 50, unreadOnly: boolean = false): Promise<GeofenceAlert[]> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/geofences/alerts?limit=${limit}&unread_only=${unreadOnly}`
    );
    const result = await response.json();
    return result.data;
  }

  // ============== SAVED LOCATIONS ==============

  /**
   * Get saved locations
   */
  async getSavedLocations(): Promise<SavedLocation[]> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/locations`);
    const result = await response.json();
    return result.data;
  }

  /**
   * Save a location
   */
  async saveLocation(data: {
    name: string;
    latitude: number;
    longitude: number;
    address?: string;
    icon?: string;
  }): Promise<string> {
    const params = new URLSearchParams({
      name: data.name,
      latitude: data.latitude.toString(),
      longitude: data.longitude.toString(),
    });
    if (data.address) params.append('address', data.address);
    if (data.icon) params.append('icon', data.icon);

    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/locations?${params.toString()}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to save location');
    }

    const result = await response.json();
    return result.data.location_id;
  }

  /**
   * Delete saved location
   */
  async deleteSavedLocation(locationId: string): Promise<void> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/locations/${locationId}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete location');
    }
  }

  // ============== PRIVACY ==============

  /**
   * Get privacy settings
   */
  async getPrivacySettings(): Promise<PrivacySettings> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/privacy/settings`);
    const result = await response.json();
    return result.data;
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(settings: Partial<PrivacySettings>): Promise<void> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/privacy/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update privacy settings');
    }
  }

  /**
   * Request GDPR data export
   */
  async requestDataExport(): Promise<string> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/privacy/export`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to request data export');
    }

    const result = await response.json();
    return result.data.request_id;
  }

  /**
   * Request account deletion
   */
  async requestAccountDeletion(reason?: string): Promise<string> {
    const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/privacy/delete-account${params}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to request account deletion');
    }

    const result = await response.json();
    return result.data.request_id;
  }

  /**
   * Cancel account deletion
   */
  async cancelAccountDeletion(): Promise<void> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/privacy/cancel-deletion`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to cancel deletion');
    }
  }
}

// Export singleton instance
export const sharingService = new SharingService();
