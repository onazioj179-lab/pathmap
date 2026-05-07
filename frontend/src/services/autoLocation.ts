/**
 * V96: AUTO LOCATION SERVICE
 * Reliable location detection with GPS priority + IP fallback
 */

export interface LocationData {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  source: 'ip' | 'gps';
  accuracy?: number;
}

class AutoLocationService {
  private currentLocation: LocationData | null = null;
  private listeners: Array<(location: LocationData) => void> = [];
  private watchId: number | null = null;

  /**
   * Auto-detect location with GPS first, then IP fallback
   */
  async autoDetect(): Promise<LocationData | null> {
    console.log('[AutoLocation] Starting location detection...');
    
    // 1) Try browser GPS (if available)
    const gps = await this.tryGeolocation(10000).catch((e) => {
      console.warn('[AutoLocation] GPS failed:', e);
      return null;
    });
    
    if (gps) {
      console.log('[AutoLocation] GPS location acquired:', gps.latitude, gps.longitude);
      this.currentLocation = gps;
      this.notifyListeners();
      return this.currentLocation;
    }

    // 2) Fallback to IP-based geolocation (no permission needed)
    console.log('[AutoLocation] Falling back to IP geolocation...');
    try {
      const response = await fetch('https://ipapi.co/json/', {
        signal: AbortSignal.timeout(5000)
      });
      const data = await response.json();

      this.currentLocation = {
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.city || 'Unknown',
        country: data.country_name || 'Unknown',
        source: 'ip',
        accuracy: 5000 // IP is roughly city-level
      };

      console.log('[AutoLocation] IP location acquired:', this.currentLocation.city);
      this.notifyListeners();
      return this.currentLocation;
    } catch (error) {
      console.warn('[AutoLocation] IP detection failed:', error);
      
      // 3) Last resort: default to a known location
      this.currentLocation = {
        latitude: 9.0820,
        longitude: 7.4900,
        city: 'Default',
        country: 'Nigeria',
        source: 'ip',
        accuracy: 50000
      };
      console.log('[AutoLocation] Using default location');
      this.notifyListeners();
      return this.currentLocation;
    }
  }

  /**
   * Start continuous GPS tracking
   */
  startTracking(): void {
    if (this.watchId !== null || !('geolocation' in navigator)) return;
    
    console.log('[AutoLocation] Starting GPS tracking...');
    
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.currentLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          city: 'LIVE',
          country: 'GPS',
          source: 'gps',
          accuracy: pos.coords.accuracy
        };
        console.log('[AutoLocation] GPS update:', pos.coords.latitude, pos.coords.longitude, 'accuracy:', pos.coords.accuracy);
        this.notifyListeners();
      },
      (err) => {
        console.warn('[AutoLocation] GPS tracking error:', err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  }

  /**
   * Stop GPS tracking
   */
  stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      console.log('[AutoLocation] GPS tracking stopped');
    }
  }

  private tryGeolocation(timeoutMs: number): Promise<LocationData | null> {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        console.log('[AutoLocation] Geolocation not supported');
        resolve(null);
        return;
      }

      console.log('[AutoLocation] Requesting GPS permission...');

      const onSuccess = (pos: GeolocationPosition) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          city: 'CURRENT',
          country: 'GPS',
          source: 'gps',
          accuracy: pos.coords.accuracy
        });
      };
      
      const onError = (err: GeolocationPositionError) => {
        console.warn('[AutoLocation] GPS error:', err.code, err.message);
        resolve(null); // Resolve with null to allow fallback
      };

      navigator.geolocation.getCurrentPosition(
        onSuccess,
        onError,
        { 
          enableHighAccuracy: true, 
          timeout: timeoutMs, 
          maximumAge: 30000 // Allow cached positions up to 30s old
        }
      );
    });
  }

  /**
   * Get current location
   */
  getLocation(): LocationData | null {
    return this.currentLocation;
  }

  /**
   * Subscribe to location updates
   */
  addListener(callback: (location: LocationData) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notifyListeners(): void {
    if (this.currentLocation) {
      this.listeners.forEach(cb => cb(this.currentLocation!));
    }
  }
}

// Singleton instance
const autoLocationService = new AutoLocationService();
export default autoLocationService;
