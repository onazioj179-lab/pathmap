/**
 * PATHFINDER V39 — DEVICE LOCATION SERVICE
 * 
 * Real-time device GPS management with permission handling,
 * continuous location updates, and no mock data.
 */

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface LocationPermissionStatus {
  granted: boolean;
  denied: boolean;
  prompt: boolean;
  state: 'granted' | 'denied' | 'prompt' | 'unknown';
}

export interface LocationServiceConfig {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
  updateInterval: number; // milliseconds (1000-3000 for 1-3 sec updates)
  distanceFilter: number; // meters, minimum distance for update
}

type LocationListener = (location: DeviceLocation) => void;
type ErrorListener = (error: GeolocationPositionError) => void;

// =====================================================================
// DEVICE LOCATION SERVICE
// =====================================================================

export class DeviceLocationService {
  private static instance: DeviceLocationService;
  
  private watchId: number | null = null;
  private currentLocation: DeviceLocation | null = null;
  private permissionStatus: LocationPermissionStatus = {
    granted: false,
    denied: false,
    prompt: true,
    state: 'unknown',
  };
  
  private config: LocationServiceConfig = {
    enableHighAccuracy: true,
    timeout: 5000, // Faster timeout for high-frequency updates
    maximumAge: 0, // Always get fresh position
    updateInterval: 1500, // 1.5 seconds (1-2 sec target)
    distanceFilter: 3, // 3 meters for higher precision
  };
  
  private locationListeners: LocationListener[] = [];
  private errorListeners: ErrorListener[] = [];
  private permissionListeners: Array<(status: LocationPermissionStatus) => void> = [];
  
  private isActive: boolean = false;
  private lastUpdateTime: number = 0;
  private locationHistory: DeviceLocation[] = [];
  private maxHistoryLength: number = 100;

  private constructor() {
    console.log('[DeviceLocation] Service initialized');
  }

  static getInstance(): DeviceLocationService {
    if (!DeviceLocationService.instance) {
      DeviceLocationService.instance = new DeviceLocationService();
    }
    return DeviceLocationService.instance;
  }

  // =====================================================================
  // PERMISSION MANAGEMENT
  // =====================================================================

  async requestPermission(): Promise<LocationPermissionStatus> {
    console.log('[DeviceLocation] Requesting location permission (Safari compatible)...');

    // Check if Geolocation API is available
    if (!navigator.geolocation) {
      console.error('[DeviceLocation] Geolocation API not supported');
      this.permissionStatus = {
        granted: false,
        denied: true,
        prompt: false,
        state: 'denied',
      };
      this.notifyPermissionListeners();
      return this.permissionStatus;
    }

    // Safari/iOS compatible: Direct geolocation call (no Permissions API)
    // This MUST be called from a user gesture (button click)
    return new Promise((resolve) => {
      console.log('[DeviceLocation] Triggering permission prompt via getCurrentPosition...');
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Success: Permission granted
          this.permissionStatus = {
            granted: true,
            denied: false,
            prompt: false,
            state: 'granted',
          };
          
          // Store first location
          this.currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          };
          
          console.log('[DeviceLocation] Permission GRANTED');
          console.log('[DeviceLocation] Initial position:', position.coords.latitude, position.coords.longitude);
          this.notifyPermissionListeners();
          resolve(this.permissionStatus);
        },
        (error) => {
          // Error handling
          console.error('[DeviceLocation] Permission error:', error.message, 'Code:', error.code);
          
          if (error.code === error.PERMISSION_DENIED) {
            this.permissionStatus = {
              granted: false,
              denied: true,
              prompt: false,
              state: 'denied',
            };
            console.error('[DeviceLocation] Permission DENIED by user');
          } else if (error.code === error.TIMEOUT) {
            // Timeout doesn't mean permission denied
            this.permissionStatus = {
              granted: false,
              denied: false,
              prompt: true,
              state: 'prompt',
            };
            console.warn('[DeviceLocation] Timeout (may still have permission)');
          } else {
            // Position unavailable or other error
            this.permissionStatus = {
              granted: false,
              denied: false,
              prompt: true,
              state: 'prompt',
            };
            console.warn('[DeviceLocation] Position unavailable:', error.message);
          }
          
          this.notifyPermissionListeners();
          resolve(this.permissionStatus);
        },
        { 
          enableHighAccuracy: true, 
          timeout: 10000, // 10 seconds for initial request
          maximumAge: 0 
        }
      );
    });
  }

  getPermissionStatus(): LocationPermissionStatus {
    return { ...this.permissionStatus };
  }

  // =====================================================================
  // LOCATION TRACKING
  // =====================================================================

  async start(): Promise<boolean> {
    if (this.isActive) {
      console.warn('[DeviceLocation] Already active');
      return true;
    }

    // Check/request permission first
    const permissionStatus = await this.requestPermission();
    if (!permissionStatus.granted) {
      console.error('[DeviceLocation] Cannot start without permission');
      return false;
    }

    if (!navigator.geolocation) {
      console.error('[DeviceLocation] Geolocation not supported');
      return false;
    }

    console.log('[DeviceLocation] Starting location tracking...');

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handleLocationUpdate(position),
      (error) => this.handleLocationError(error),
      {
        enableHighAccuracy: this.config.enableHighAccuracy,
        timeout: this.config.timeout,
        maximumAge: this.config.maximumAge,
      }
    );

    this.isActive = true;
    console.log('[DeviceLocation] Location tracking started');
    return true;
  }

  stop(): void {
    if (!this.isActive) {
      return;
    }

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    this.isActive = false;
    console.log('[DeviceLocation] Location tracking stopped');
  }

  // =====================================================================
  // LOCATION UPDATE HANDLING
  // =====================================================================

  private handleLocationUpdate(position: GeolocationPosition): void {
    const now = Date.now();
    
    // Apply distance filter
    if (this.currentLocation) {
      const distance = this.calculateDistance(
        this.currentLocation.latitude,
        this.currentLocation.longitude,
        position.coords.latitude,
        position.coords.longitude
      );
      
      if (distance < this.config.distanceFilter) {
        // Too close to last position, skip update
        return;
      }
    }

    // Apply time filter
    if (now - this.lastUpdateTime < this.config.updateInterval) {
      // Too soon since last update
      return;
    }

    const location: DeviceLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      timestamp: position.timestamp,
    };

    this.currentLocation = location;
    this.lastUpdateTime = now;

    // Add to history
    this.locationHistory.push(location);
    if (this.locationHistory.length > this.maxHistoryLength) {
      this.locationHistory.shift();
    }

    console.log('[DeviceLocation] Location updated:', {
      lat: location.latitude.toFixed(6),
      lon: location.longitude.toFixed(6),
      accuracy: Math.round(location.accuracy),
      speed: location.speed ? location.speed.toFixed(1) : 'null',
      heading: location.heading ? Math.round(location.heading) : 'null',
    });

    // Notify listeners
    this.notifyLocationListeners(location);
  }

  private handleLocationError(error: GeolocationPositionError): void {
    console.error('[DeviceLocation] Location error:', error.message);
    
    if (error.code === error.PERMISSION_DENIED) {
      this.permissionStatus = {
        granted: false,
        denied: true,
        prompt: false,
        state: 'denied',
      };
      this.notifyPermissionListeners();
    }

    this.notifyErrorListeners(error);
  }

  // =====================================================================
  // LOCATION QUERIES
  // =====================================================================

  getCurrentLocation(): DeviceLocation | null {
    return this.currentLocation ? { ...this.currentLocation } : null;
  }

  async getLocationOnce(): Promise<DeviceLocation> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location: DeviceLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          };
          resolve(location);
        },
        (error) => reject(error),
        {
          enableHighAccuracy: this.config.enableHighAccuracy,
          timeout: this.config.timeout,
          maximumAge: this.config.maximumAge,
        }
      );
    });
  }

  getLocationHistory(count?: number): DeviceLocation[] {
    if (count && count < this.locationHistory.length) {
      return [...this.locationHistory.slice(-count)];
    }
    return [...this.locationHistory];
  }

  // =====================================================================
  // CONFIGURATION
  // =====================================================================

  updateConfig(updates: Partial<LocationServiceConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('[DeviceLocation] Configuration updated:', this.config);

    // Restart tracking if active to apply new config
    if (this.isActive) {
      this.stop();
      this.start();
    }
  }

  getConfig(): LocationServiceConfig {
    return { ...this.config };
  }

  // =====================================================================
  // LISTENERS
  // =====================================================================

  addLocationListener(listener: LocationListener): () => void {
    this.locationListeners.push(listener);
    
    // If we already have a location, notify immediately
    if (this.currentLocation) {
      listener(this.currentLocation);
    }
    
    // Return unsubscribe function
    return () => {
      const index = this.locationListeners.indexOf(listener);
      if (index > -1) {
        this.locationListeners.splice(index, 1);
      }
    };
  }

  addErrorListener(listener: ErrorListener): () => void {
    this.errorListeners.push(listener);
    return () => {
      const index = this.errorListeners.indexOf(listener);
      if (index > -1) {
        this.errorListeners.splice(index, 1);
      }
    };
  }

  addPermissionListener(listener: (status: LocationPermissionStatus) => void): () => void {
    this.permissionListeners.push(listener);
    
    // Notify immediately with current status
    listener(this.permissionStatus);
    
    return () => {
      const index = this.permissionListeners.indexOf(listener);
      if (index > -1) {
        this.permissionListeners.splice(index, 1);
      }
    };
  }

  private notifyLocationListeners(location: DeviceLocation): void {
    this.locationListeners.forEach(listener => {
      try {
        listener(location);
      } catch (error) {
        console.error('[DeviceLocation] Error in location listener:', error);
      }
    });
  }

  private notifyErrorListeners(error: GeolocationPositionError): void {
    this.errorListeners.forEach(listener => {
      try {
        listener(error);
      } catch (err) {
        console.error('[DeviceLocation] Error in error listener:', err);
      }
    });
  }

  private notifyPermissionListeners(): void {
    this.permissionListeners.forEach(listener => {
      try {
        listener(this.permissionStatus);
      } catch (error) {
        console.error('[DeviceLocation] Error in permission listener:', error);
      }
    });
  }

  // =====================================================================
  // UTILITIES
  // =====================================================================

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  getIsActive(): boolean {
    return this.isActive;
  }

  // =====================================================================
  // METRICS
  // =====================================================================

  getMetrics() {
    return {
      isActive: this.isActive,
      hasCurrentLocation: !!this.currentLocation,
      permissionGranted: this.permissionStatus.granted,
      historyLength: this.locationHistory.length,
      lastUpdateTime: this.lastUpdateTime,
      timeSinceLastUpdate: Date.now() - this.lastUpdateTime,
      listenerCounts: {
        location: this.locationListeners.length,
        error: this.errorListeners.length,
        permission: this.permissionListeners.length,
      },
    };
  }
}

// =====================================================================
// SINGLETON EXPORT
// =====================================================================

export const deviceLocationService = DeviceLocationService.getInstance();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).deviceLocationService = deviceLocationService;
}
