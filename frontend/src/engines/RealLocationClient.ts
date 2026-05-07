/**
 * PATHFINDER V48 - REAL LOCATION CLIENT
 * 
 * Client-side GPS tracking with:
 * - Secure context validation (HTTPS enforcement)
 * - User-triggered permission flow
 * - Real-time position updates
 * - Map integration
 * - Stats panel updates
 */

interface LocationPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

interface RLEState {
  active: boolean;
  watch_id: number | null;
  update_count: number;
  error_count: number;
  last_error: string | null;
  permission_granted: boolean;
  secure_context: boolean;
  last_position: LocationPosition | null;
}

interface RLECallbacks {
  onPositionUpdate?: (position: LocationPosition, stats: any) => void;
  onError?: (error: any) => void;
  onStatusChange?: (status: string) => void;
}

export class RealLocationClient {
  private watchId: number | null = null;
  private active: boolean = false;
  private callbacks: RLECallbacks;
  private apiBase: string;
  
  constructor(apiBase: string = 'http://localhost:8000', callbacks: RLECallbacks = {}) {
    this.apiBase = apiBase;
    this.callbacks = callbacks;
  }
  
  /**
   * Validate secure context before starting GPS
   */
  async validateSecureContext(): Promise<boolean> {
    const origin = window.location.origin;
    
    try {
      const response = await fetch(`${this.apiBase}/api/v48/validate-secure-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin })
      });
      
      const result = await response.json();
      
      if (!result.secure) {
        console.error('[V48 RLE] Insecure context:', result.message);
        if (this.callbacks.onError) {
          this.callbacks.onError({
            type: 'INSECURE_CONTEXT',
            message: result.message,
            guidance: result.guidance
          });
        }
        return false;
      }
      
      console.log('[V48 RLE] Secure context validated');
      return true;
    } catch (error) {
      console.error('[V48 RLE] Secure context validation failed:', error);
      return false;
    }
  }
  
  /**
   * Start GPS tracking (must be called from user interaction)
   */
  async startTracking(): Promise<boolean> {
    // Check if already active
    if (this.active) {
      console.warn('[V48 RLE] Tracking already active');
      return true;
    }
    
    // Validate secure context
    const isSecure = await this.validateSecureContext();
    if (!isSecure) {
      return false;
    }
    
    // Notify backend
    try {
      const origin = window.location.origin;
      const response = await fetch(`${this.apiBase}/api/v48/start-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin })
      });
      
      const result = await response.json();
      
      if (result.status !== 'started') {
        console.error('[V48 RLE] Failed to start tracking:', result);
        return false;
      }
    } catch (error) {
      console.error('[V48 RLE] Failed to notify backend:', error);
      return false;
    }
    
    // Start browser geolocation watch
    if (!navigator.geolocation) {
      console.error('[V48 RLE] Geolocation not supported');
      if (this.callbacks.onError) {
        this.callbacks.onError({
          type: 'NOT_SUPPORTED',
          message: 'Geolocation not supported by browser'
        });
      }
      return false;
    }
    
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handlePositionSuccess(position),
      (error) => this.handlePositionError(error),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
    
    this.active = true;
    
    if (this.callbacks.onStatusChange) {
      this.callbacks.onStatusChange('tracking_started');
    }
    
    console.log('[V48 RLE] GPS tracking started');
    return true;
  }
  
  /**
   * Stop GPS tracking
   */
  async stopTracking(): Promise<void> {
    if (!this.active) {
      return;
    }
    
    // Stop browser watch
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    
    // Notify backend
    try {
      await fetch(`${this.apiBase}/api/v48/stop-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('[V48 RLE] Failed to notify backend of stop:', error);
    }
    
    this.active = false;
    
    if (this.callbacks.onStatusChange) {
      this.callbacks.onStatusChange('tracking_stopped');
    }
    
    console.log('[V48 RLE] GPS tracking stopped');
  }
  
  /**
   * Handle successful position update
   */
  private async handlePositionSuccess(position: GeolocationPosition): Promise<void> {
    const locationData: LocationPosition = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      timestamp: position.timestamp
    };
    
    // Send to backend
    try {
      const response = await fetch(`${this.apiBase}/api/v48/update-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locationData)
      });
      
      const result = await response.json();
      
      if (result.success && this.callbacks.onPositionUpdate) {
        this.callbacks.onPositionUpdate(
          locationData,
          result.position.statistics
        );
      }
    } catch (error) {
      console.error('[V48 RLE] Failed to send position update:', error);
    }
  }
  
  /**
   * Handle position error
   */
  private async handlePositionError(error: GeolocationPositionError): Promise<void> {
    console.error('[V48 RLE] Position error:', error.message);
    
    // Send to backend
    try {
      await fetch(`${this.apiBase}/api/v48/handle-gps-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error_code: error.code,
          error_message: error.message
        })
      });
    } catch (err) {
      console.error('[V48 RLE] Failed to send error to backend:', err);
    }
    
    if (this.callbacks.onError) {
      this.callbacks.onError({
        type: 'GPS_ERROR',
        code: error.code,
        message: error.message
      });
    }
  }
  
  /**
   * Get current RLE state from backend
   */
  async getState(): Promise<RLEState | null> {
    try {
      const response = await fetch(`${this.apiBase}/api/v48/rle-state`);
      const result = await response.json();
      return result.rle_state;
    } catch (error) {
      console.error('[V48 RLE] Failed to get state:', error);
      return null;
    }
  }
  
  /**
   * Check if tracking is active
   */
  isActive(): boolean {
    return this.active;
  }
}

/**
 * Create a user-triggered GPS enable button
 */
export function createGPSEnableButton(
  rleClient: RealLocationClient,
  onSuccess?: () => void,
  onError?: (error: any) => void
): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = 'Enable Location';
  button.className = 'bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors';
  
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Starting GPS...';
    
    const success = await rleClient.startTracking();
    
    if (success) {
      button.textContent = 'GPS Active';
      button.className = 'bg-green-600 text-white px-6 py-3 rounded-lg font-semibold';
      if (onSuccess) onSuccess();
    } else {
      button.textContent = 'GPS Failed - Retry';
      button.className = 'bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors';
      button.disabled = false;
      if (onError) onError({ message: 'Failed to start GPS' });
    }
  });
  
  return button;
}

/**
 * Detect if current context is secure
 */
export function isSecureContext(): boolean {
  const origin = window.location.origin;
  
  if (origin.startsWith('https://')) return true;
  if (origin.includes('localhost')) return true;
  if (origin.includes('127.0.0.1')) return true;
  
  return false;
}

/**
 * Show secure context warning if needed
 */
export function showSecureContextWarning(): void {
  if (isSecureContext()) return;
  
  const warning = document.createElement('div');
  warning.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
  warning.innerHTML = `
    <div class="flex items-center gap-3">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>
      <div>
        <div class="font-semibold">Secure Connection Required</div>
        <div class="text-sm">Access via HTTPS or localhost to enable GPS</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(warning);
  
  setTimeout(() => {
    warning.remove();
  }, 8000);
}
