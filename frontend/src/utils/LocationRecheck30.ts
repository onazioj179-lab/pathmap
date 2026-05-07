/**
 * PATHFINDER V54 — LOCATION RECHECK 30 (LR30)
 * ============================================
 * 
 * Purpose:
 *   Automatically recheck location permission every 30 minutes.
 *   Silently re-enable live tracking if permission becomes available.
 *   Handle app resume from background.
 *   
 * Features:
 *   - 30-minute periodic check
 *   - App resume detection (Page Visibility API)
 *   - Silent permission recheck (no modals)
 *   - Auto-enable tracking when permission granted
 *   - Network reconnect detection
 *   - Tile reload trigger
 */

export interface LR30Config {
  intervalMinutes: number;
  enableAppResumeCheck: boolean;
  enableNetworkCheck: boolean;
  onPermissionGranted?: (position: GeolocationPosition) => void;
  onPermissionDenied?: () => void;
  onLocationUpdate?: (position: GeolocationPosition) => void;
}

export class LocationRecheck30 {
  private config: LR30Config;
  private intervalId: number | null = null;
  private lastCheckTime: number = 0;
  private appWasHidden: boolean = false;
  
  constructor(config: Partial<LR30Config> = {}) {
    this.config = {
      intervalMinutes: 30,
      enableAppResumeCheck: true,
      enableNetworkCheck: true,
      ...config
    };
  }
  
  /**
   * Start periodic location recheck
   */
  start(): void {
    // Initial check
    this.checkLocation();
    
    // Set up 30-minute interval
    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    this.intervalId = window.setInterval(() => {
      this.checkLocation();
    }, intervalMs);
    
    // Set up app resume detection
    if (this.config.enableAppResumeCheck) {
      this.setupAppResumeDetection();
    }
    
    // Set up network reconnect detection
    if (this.config.enableNetworkCheck) {
      this.setupNetworkDetection();
    }
    
    console.log(`[LR30] Started - checking every ${this.config.intervalMinutes} minutes`);
  }
  
  /**
   * Stop periodic location recheck
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log('[LR30] Stopped');
  }
  
  /**
   * Check location permission and update position
   */
  private async checkLocation(): Promise<void> {
    this.lastCheckTime = Date.now();
    
    console.log('[LR30] Checking location permission...');
    
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      console.warn('[LR30] Geolocation not supported');
      return;
    }
    
    // Try to get current position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('[LR30] Location permission granted');
        
        if (this.config.onPermissionGranted) {
          this.config.onPermissionGranted(position);
        }
        
        if (this.config.onLocationUpdate) {
          this.config.onLocationUpdate(position);
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          console.log('[LR30] Location permission denied');
          
          if (this.config.onPermissionDenied) {
            this.config.onPermissionDenied();
          }
        } else {
          console.warn('[LR30] Location error:', error.message);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }
  
  /**
   * Set up app resume detection using Page Visibility API
   */
  private setupAppResumeDetection(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // App went to background
        this.appWasHidden = true;
        console.log('[LR30] App hidden (background)');
      } else {
        // App returned from background
        if (this.appWasHidden) {
          console.log('[LR30] App resumed from background - rechecking location');
          this.checkLocation();
          this.appWasHidden = false;
        }
      }
    });
    
    // Also check on focus
    window.addEventListener('focus', () => {
      console.log('[LR30] Window focused - rechecking location');
      this.checkLocation();
    });
  }
  
  /**
   * Set up network reconnect detection
   */
  private setupNetworkDetection(): void {
    window.addEventListener('online', () => {
      console.log('[LR30] Network reconnected - rechecking location');
      this.checkLocation();
    });
  }
  
  /**
   * Force an immediate location check
   */
  forceCheck(): void {
    console.log('[LR30] Forcing immediate location check');
    this.checkLocation();
  }
  
  /**
   * Get time since last check in seconds
   */
  getTimeSinceLastCheck(): number {
    if (this.lastCheckTime === 0) return 0;
    return Math.floor((Date.now() - this.lastCheckTime) / 1000);
  }
  
  /**
   * Get next check time in seconds
   */
  getTimeUntilNextCheck(): number {
    if (this.lastCheckTime === 0) return 0;
    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    const elapsed = Date.now() - this.lastCheckTime;
    const remaining = intervalMs - elapsed;
    return Math.max(0, Math.floor(remaining / 1000));
  }
  
  /**
   * Get LR30 statistics
   */
  getStats(): {
    active: boolean;
    intervalMinutes: number;
    lastCheckTime: number;
    timeSinceLastCheckSeconds: number;
    timeUntilNextCheckSeconds: number;
  } {
    return {
      active: this.intervalId !== null,
      intervalMinutes: this.config.intervalMinutes,
      lastCheckTime: this.lastCheckTime,
      timeSinceLastCheckSeconds: this.getTimeSinceLastCheck(),
      timeUntilNextCheckSeconds: this.getTimeUntilNextCheck()
    };
  }
}

/**
 * Global LR30 instance
 */
let globalLR30: LocationRecheck30 | null = null;

/**
 * Initialize and start global LR30
 */
export function startLR30(config: Partial<LR30Config> = {}): LocationRecheck30 {
  if (globalLR30) {
    console.warn('[LR30] Already running, stopping existing instance');
    globalLR30.stop();
  }
  
  globalLR30 = new LocationRecheck30(config);
  globalLR30.start();
  
  return globalLR30;
}

/**
 * Stop global LR30
 */
export function stopLR30(): void {
  if (globalLR30) {
    globalLR30.stop();
    globalLR30 = null;
  }
}

/**
 * Get global LR30 instance
 */
export function getLR30(): LocationRecheck30 | null {
  return globalLR30;
}
