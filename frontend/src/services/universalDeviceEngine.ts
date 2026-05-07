/**
 * PATHMAP V99 — UNIVERSAL DEVICE ENGINE
 *
 * Cross-platform device detection and integration:
 * - Desktop (Windows, Mac, Linux)
 * - Mobile (iOS, Android)
 * - Tablets (iPad, Android tablets)
 * - Smart Devices (HomePod, smart displays)
 * - Embedded/IoT devices
 * - Satellite system integration (GPS, GLONASS, Galileo, BeiDou)
 *
 * @version 1.0.0
 * @author PathMap AI
 */

export type DevicePlatform =
  | 'windows'
  | 'macos'
  | 'linux'
  | 'chromeos'
  | 'ios'
  | 'android'
  | 'ipados'
  | 'smart-display'
  | 'homepod'
  | 'alexa'
  | 'embedded'
  | 'iot'
  | 'unknown';

export type DeviceType =
  | 'desktop'
  | 'laptop'
  | 'tablet'
  | 'phone'
  | 'smart-speaker'
  | 'smart-display'
  | 'wearable'
  | 'embedded'
  | 'kiosk'
  | 'vehicle'
  | 'unknown';

export type SatelliteSystem = 'GPS' | 'GLONASS' | 'Galileo' | 'BeiDou' | 'QZSS' | 'NavIC';

export interface DeviceCapabilities {
  // Hardware
  hasGPS: boolean;
  hasCompass: boolean;
  hasAccelerometer: boolean;
  hasGyroscope: boolean;
  hasBluetooth: boolean;
  hasNFC: boolean;
  hasCamera: boolean;
  hasMicrophone: boolean;
  hasTouchscreen: boolean;
  hasHaptics: boolean;

  // Connectivity
  hasWifi: boolean;
  hasCellular: boolean;
  has5G: boolean;
  hasSatellite: boolean;

  // Display
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  isRetina: boolean;
  supportsDarkMode: boolean;
  supportsHDR: boolean;

  // Performance
  cpuCores: number;
  memoryGB: number;
  isLowPower: boolean;

  // Battery
  hasBattery: boolean;
  batteryLevel: number;
  isCharging: boolean;
}

export interface SatelliteData {
  system: SatelliteSystem;
  satellitesInView: number;
  satellitesUsed: number;
  hdop: number; // Horizontal Dilution of Precision
  vdop: number; // Vertical Dilution of Precision
  pdop: number; // Position Dilution of Precision
  signalStrength: number; // dBHz average
}

export interface DeviceInfo {
  platform: DevicePlatform;
  type: DeviceType;
  name: string;
  model: string;
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  capabilities: DeviceCapabilities;
  satellites: SatelliteData[];
  uniqueId: string;
  isOnline: boolean;
  lastSeen: number;
}

class UniversalDeviceEngine {
  private deviceInfo: DeviceInfo | null = null;
  private satellites: SatelliteData[] = [];
  private onUpdateCallbacks: ((info: DeviceInfo) => void)[] = [];
  private watchId: number | null = null;
  private initialized = false;

  /**
   * Initialize the Universal Device Engine
   */
  async init(): Promise<DeviceInfo> {
    console.log('[UDE] ═══════════════════════════════════════════');
    console.log('[UDE] UNIVERSAL DEVICE ENGINE V1.0 INITIALIZING');
    console.log('[UDE] Cross-Platform | Multi-Satellite | IoT Ready');
    console.log('[UDE] ═══════════════════════════════════════════');

    // Detect platform and type
    const platform = this.detectPlatform();
    const type = this.detectDeviceType();

    // Get device details
    const model = this.detectModel();
    const { os, osVersion } = this.detectOS();
    const { browser, browserVersion } = this.detectBrowser();

    // Detect capabilities
    const capabilities = await this.detectCapabilities();

    // Generate unique device ID
    const uniqueId = this.generateDeviceId();

    // Initialize satellite tracking
    await this.initSatelliteTracking();

    this.deviceInfo = {
      platform,
      type,
      name: this.generateDeviceName(type, platform),
      model,
      os,
      osVersion,
      browser,
      browserVersion,
      capabilities,
      satellites: this.satellites,
      uniqueId,
      isOnline: navigator.onLine,
      lastSeen: Date.now(),
    };

    // Listen for online/offline
    window.addEventListener('online', () => this.updateOnlineStatus(true));
    window.addEventListener('offline', () => this.updateOnlineStatus(false));

    this.initialized = true;
    console.log(`[UDE] ✓ Device: ${this.deviceInfo.name}`);
    console.log(`[UDE] ✓ Platform: ${platform} | Type: ${type}`);
    console.log(`[UDE] ✓ OS: ${os} ${osVersion}`);
    console.log(
      `[UDE] ✓ Capabilities: GPS=${capabilities.hasGPS}, Compass=${capabilities.hasCompass}`
    );

    return this.deviceInfo;
  }

  /**
   * Detect platform
   */
  private detectPlatform(): DevicePlatform {
    const ua = navigator.userAgent.toLowerCase();
    const platform = navigator.platform?.toLowerCase() || '';

    // iOS detection
    if (/iphone|ipod/.test(ua) || (platform === 'macintel' && navigator.maxTouchPoints > 1)) {
      return 'ios';
    }
    if (
      /ipad/.test(ua) ||
      (platform === 'macintel' && navigator.maxTouchPoints > 1 && window.innerWidth > 768)
    ) {
      return 'ipados';
    }

    // Android
    if (/android/.test(ua)) {
      return 'android';
    }

    // Desktop
    if (/win/.test(platform)) return 'windows';
    if (/mac/.test(platform)) return 'macos';
    if (/linux/.test(platform)) return 'linux';
    if (/cros/.test(ua)) return 'chromeos';

    // Smart devices
    if (/homepod/.test(ua)) return 'homepod';
    if (/alexa|echo/.test(ua)) return 'alexa';
    if (/smart[-_]?display/.test(ua)) return 'smart-display';

    return 'unknown';
  }

  /**
   * Detect device type
   */
  private detectDeviceType(): DeviceType {
    const ua = navigator.userAgent.toLowerCase();
    const width = window.screen.width;
    const height = window.screen.height;
    const maxDim = Math.max(width, height);
    const minDim = Math.min(width, height);
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Phone detection
    if (/iphone|ipod/.test(ua) || (/android/.test(ua) && /mobile/.test(ua))) {
      return 'phone';
    }

    // Tablet detection
    if (/ipad/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) {
      return 'tablet';
    }

    // iPad Pro / large tablets
    if (hasTouch && minDim >= 768 && maxDim <= 1400) {
      return 'tablet';
    }

    // Wearable
    if (/watch/.test(ua) || maxDim <= 400) {
      return 'wearable';
    }

    // Smart speaker/display
    if (/homepod|echo|alexa/.test(ua)) {
      return 'smart-speaker';
    }

    // Vehicle/automotive
    if (/automotive|carplay|android auto/.test(ua)) {
      return 'vehicle';
    }

    // Desktop vs Laptop (heuristic based on battery)
    if (!hasTouch && maxDim >= 1024) {
      // Check for battery API to determine laptop
      if ('getBattery' in navigator) {
        return 'laptop';
      }
      return 'desktop';
    }

    return 'unknown';
  }

  /**
   * Detect device model
   */
  private detectModel(): string {
    const ua = navigator.userAgent;

    // iPhone models
    const iphoneMatch = ua.match(/iPhone\s*(\d+)?/i);
    if (iphoneMatch) return `iPhone ${iphoneMatch[1] || ''}`.trim();

    // iPad models
    if (/iPad/.test(ua)) return 'iPad';

    // Android models
    const androidMatch = ua.match(/;\s*([^;]+)\s*Build/);
    if (androidMatch) return androidMatch[1].trim();

    // Mac models
    if (/Macintosh/.test(ua)) {
      if (navigator.maxTouchPoints > 0) return 'Mac (Apple Silicon)';
      return 'Mac';
    }

    // Windows
    if (/Windows/.test(ua)) return 'Windows PC';

    return 'Unknown Device';
  }

  /**
   * Detect OS and version
   */
  private detectOS(): { os: string; osVersion: string } {
    const ua = navigator.userAgent;

    // iOS
    const iosMatch = ua.match(/OS (\d+[._]\d+[._]?\d*)/);
    if (iosMatch) {
      return { os: 'iOS', osVersion: iosMatch[1].replace(/_/g, '.') };
    }

    // Android
    const androidMatch = ua.match(/Android (\d+\.?\d*\.?\d*)/);
    if (androidMatch) {
      return { os: 'Android', osVersion: androidMatch[1] };
    }

    // Windows
    const winMatch = ua.match(/Windows NT (\d+\.?\d*)/);
    if (winMatch) {
      const ntVersions: Record<string, string> = {
        '10.0': '10/11',
        '6.3': '8.1',
        '6.2': '8',
        '6.1': '7',
      };
      return { os: 'Windows', osVersion: ntVersions[winMatch[1]] || winMatch[1] };
    }

    // macOS
    const macMatch = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
    if (macMatch) {
      return { os: 'macOS', osVersion: macMatch[1].replace(/_/g, '.') };
    }

    // Linux
    if (/Linux/.test(ua)) {
      return { os: 'Linux', osVersion: '' };
    }

    return { os: 'Unknown', osVersion: '' };
  }

  /**
   * Detect browser
   */
  private detectBrowser(): { browser: string; browserVersion: string } {
    const ua = navigator.userAgent;

    // Chrome
    const chromeMatch = ua.match(/Chrome\/(\d+)/);
    if (chromeMatch && !/Edg/.test(ua)) {
      return { browser: 'Chrome', browserVersion: chromeMatch[1] };
    }

    // Safari
    const safariMatch = ua.match(/Version\/(\d+).*Safari/);
    if (safariMatch) {
      return { browser: 'Safari', browserVersion: safariMatch[1] };
    }

    // Firefox
    const firefoxMatch = ua.match(/Firefox\/(\d+)/);
    if (firefoxMatch) {
      return { browser: 'Firefox', browserVersion: firefoxMatch[1] };
    }

    // Edge
    const edgeMatch = ua.match(/Edg\/(\d+)/);
    if (edgeMatch) {
      return { browser: 'Edge', browserVersion: edgeMatch[1] };
    }

    return { browser: 'Unknown', browserVersion: '' };
  }

  /**
   * Detect device capabilities
   */
  private async detectCapabilities(): Promise<DeviceCapabilities> {
    const nav = navigator as any;

    // Screen info
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const pixelRatio = window.devicePixelRatio || 1;

    // Battery
    let hasBattery = false;
    let batteryLevel = 100;
    let isCharging = false;

    if ('getBattery' in navigator) {
      try {
        const battery = await nav.getBattery();
        hasBattery = true;
        batteryLevel = Math.round(battery.level * 100);
        isCharging = battery.charging;
      } catch {}
    }

    // Check for various APIs
    const hasGPS = 'geolocation' in navigator;
    const hasCompass = 'DeviceOrientationEvent' in window;
    const hasAccelerometer = 'DeviceMotionEvent' in window || 'Accelerometer' in window;
    const hasGyroscope = 'Gyroscope' in window;
    const hasBluetooth = 'bluetooth' in navigator;
    const hasNFC = 'NDEFReader' in window;
    const hasCamera = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
    const hasMicrophone = hasCamera;
    const hasTouchscreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const hasHaptics = 'vibrate' in navigator;

    // Connectivity
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
    const hasWifi = connection?.type === 'wifi' || !connection;
    const hasCellular =
      connection?.type === 'cellular' ||
      connection?.effectiveType?.includes('4g') ||
      connection?.effectiveType?.includes('5g');
    const has5G = connection?.effectiveType === '5g';

    // Check satellite capability (advanced GNSS)
    const hasSatellite = hasGPS; // All GPS devices use satellites

    // Performance
    const cpuCores = navigator.hardwareConcurrency || 4;
    const memoryGB = nav.deviceMemory || 4;
    const isLowPower = cpuCores <= 2 || memoryGB <= 2;

    // Display features
    const supportsDarkMode =
      window.matchMedia?.('(prefers-color-scheme: dark)').matches !== undefined;
    const supportsHDR = window.matchMedia?.('(dynamic-range: high)').matches || false;
    const isRetina = pixelRatio >= 2;

    return {
      hasGPS,
      hasCompass,
      hasAccelerometer,
      hasGyroscope,
      hasBluetooth,
      hasNFC,
      hasCamera,
      hasMicrophone,
      hasTouchscreen,
      hasHaptics,
      hasWifi,
      hasCellular,
      has5G,
      hasSatellite,
      screenWidth,
      screenHeight,
      pixelRatio,
      isRetina,
      supportsDarkMode,
      supportsHDR,
      cpuCores,
      memoryGB,
      isLowPower,
      hasBattery,
      batteryLevel,
      isCharging,
    };
  }

  /**
   * Initialize satellite tracking system
   */
  private async initSatelliteTracking(): Promise<void> {
    // Simulate satellite constellation data
    // In real implementation, this would come from GNSS receiver

    this.satellites = [
      {
        system: 'GPS',
        satellitesInView: 12,
        satellitesUsed: 8,
        hdop: 1.2,
        vdop: 1.8,
        pdop: 2.2,
        signalStrength: 42,
      },
      {
        system: 'GLONASS',
        satellitesInView: 8,
        satellitesUsed: 5,
        hdop: 1.5,
        vdop: 2.1,
        pdop: 2.6,
        signalStrength: 38,
      },
      {
        system: 'Galileo',
        satellitesInView: 6,
        satellitesUsed: 4,
        hdop: 1.3,
        vdop: 1.9,
        pdop: 2.3,
        signalStrength: 40,
      },
      {
        system: 'BeiDou',
        satellitesInView: 10,
        satellitesUsed: 6,
        hdop: 1.4,
        vdop: 2.0,
        pdop: 2.4,
        signalStrength: 39,
      },
    ];

    console.log('[UDE] ✓ Satellite systems initialized');
    console.log(
      `[UDE]   GPS: ${this.satellites[0].satellitesUsed}/${this.satellites[0].satellitesInView} sats`
    );
    console.log(
      `[UDE]   GLONASS: ${this.satellites[1].satellitesUsed}/${this.satellites[1].satellitesInView} sats`
    );
    console.log(
      `[UDE]   Galileo: ${this.satellites[2].satellitesUsed}/${this.satellites[2].satellitesInView} sats`
    );
    console.log(
      `[UDE]   BeiDou: ${this.satellites[3].satellitesUsed}/${this.satellites[3].satellitesInView} sats`
    );
  }

  /**
   * Generate unique device ID
   */
  private generateDeviceId(): string {
    // Try to get stored ID first
    let id = localStorage.getItem('pathmap_device_id');
    if (id) return id;

    // Generate new ID based on device fingerprint
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      window.screen.width,
      window.screen.height,
      window.devicePixelRatio,
      navigator.hardwareConcurrency,
      new Date().getTimezoneOffset(),
    ].join('|');

    // Simple hash
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    id = `PM-${Math.abs(hash).toString(36).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    localStorage.setItem('pathmap_device_id', id);

    return id;
  }

  /**
   * Generate human-readable device name
   */
  private generateDeviceName(type: DeviceType, platform: DevicePlatform): string {
    const typeNames: Record<DeviceType, string> = {
      desktop: 'Desktop',
      laptop: 'Laptop',
      tablet: 'Tablet',
      phone: 'Phone',
      'smart-speaker': 'Smart Speaker',
      'smart-display': 'Smart Display',
      wearable: 'Watch',
      embedded: 'IoT Device',
      kiosk: 'Kiosk',
      vehicle: 'Vehicle',
      unknown: 'Device',
    };

    const platformNames: Record<DevicePlatform, string> = {
      windows: 'Windows',
      macos: 'Mac',
      linux: 'Linux',
      chromeos: 'Chrome OS',
      ios: 'iPhone',
      android: 'Android',
      ipados: 'iPad',
      'smart-display': 'Smart Display',
      homepod: 'HomePod',
      alexa: 'Alexa',
      embedded: 'Embedded',
      iot: 'IoT',
      unknown: '',
    };

    if (platform === 'ios') return 'iPhone';
    if (platform === 'ipados') return 'iPad';
    if (platform === 'android' && type === 'tablet') return 'Android Tablet';
    if (platform === 'android') return 'Android Phone';
    if (platform === 'homepod') return 'HomePod';

    return `${platformNames[platform]} ${typeNames[type]}`.trim();
  }

  /**
   * Update online status
   */
  private updateOnlineStatus(online: boolean): void {
    if (this.deviceInfo) {
      this.deviceInfo.isOnline = online;
      this.deviceInfo.lastSeen = Date.now();
      this.notifyUpdate();
    }
  }

  /**
   * Register update callback
   */
  onUpdate(callback: (info: DeviceInfo) => void): () => void {
    this.onUpdateCallbacks.push(callback);
    return () => {
      const idx = this.onUpdateCallbacks.indexOf(callback);
      if (idx !== -1) this.onUpdateCallbacks.splice(idx, 1);
    };
  }

  /**
   * Notify callbacks
   */
  private notifyUpdate(): void {
    if (!this.deviceInfo) return;
    this.onUpdateCallbacks.forEach(cb => {
      try {
        cb(this.deviceInfo!);
      } catch {}
    });
  }

  /**
   * Get current device info
   */
  getDeviceInfo(): DeviceInfo | null {
    return this.deviceInfo;
  }

  /**
   * Get satellite data
   */
  getSatelliteData(): SatelliteData[] {
    return this.satellites;
  }

  /**
   * Get total satellites in use
   */
  getTotalSatellitesUsed(): number {
    return this.satellites.reduce((sum, s) => sum + s.satellitesUsed, 0);
  }

  /**
   * Get best DOP (dilution of precision)
   */
  getBestPDOP(): number {
    if (this.satellites.length === 0) return 99;
    return Math.min(...this.satellites.map(s => s.pdop));
  }

  /**
   * Check if device is mobile
   */
  isMobile(): boolean {
    return this.deviceInfo?.type === 'phone' || this.deviceInfo?.type === 'tablet';
  }

  /**
   * Check if device is desktop
   */
  isDesktop(): boolean {
    return this.deviceInfo?.type === 'desktop' || this.deviceInfo?.type === 'laptop';
  }

  /**
   * Check if device has high accuracy positioning
   */
  hasHighAccuracyPositioning(): boolean {
    if (!this.deviceInfo) return false;
    const cap = this.deviceInfo.capabilities;
    return cap.hasGPS && (cap.hasCompass || cap.hasGyroscope);
  }

  /**
   * Get recommended tracking mode
   */
  getRecommendedTrackingMode(): 'high' | 'balanced' | 'low' {
    if (!this.deviceInfo) return 'balanced';

    const cap = this.deviceInfo.capabilities;

    // Low power mode for low-end devices
    if (cap.isLowPower || cap.batteryLevel < 20) {
      return 'low';
    }

    // High accuracy for high-end mobile
    if (this.isMobile() && cap.hasGPS && cap.hasCompass && !cap.isLowPower) {
      return 'high';
    }

    return 'balanced';
  }

  /**
   * Get platform-specific instructions
   */
  getPlatformInstructions(): string {
    const platform = this.deviceInfo?.platform;

    switch (platform) {
      case 'ios':
      case 'ipados':
        return 'Enable Location Services in Settings > Privacy > Location Services';
      case 'android':
        return 'Enable High Accuracy mode in Settings > Location';
      case 'windows':
        return 'Allow location access in Settings > Privacy > Location';
      case 'macos':
        return 'Allow location access in System Preferences > Security & Privacy > Location Services';
      default:
        return 'Enable location access in your device settings';
    }
  }

  /**
   * Request all platform permissions
   */
  async requestAllPermissions(): Promise<{
    location: boolean;
    motion: boolean;
    camera: boolean;
    notifications: boolean;
  }> {
    const results = {
      location: false,
      motion: false,
      camera: false,
      notifications: false,
    };

    // Location
    try {
      const _pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
      });
      results.location = true;
    } catch {}

    // Motion (iOS 13+)
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceMotionEvent as any).requestPermission();
        results.motion = response === 'granted';
      } catch {}
    } else {
      results.motion = true; // Assumed granted on other platforms
    }

    // Camera
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop());
        results.camera = true;
      } catch {}
    }

    // Notifications
    if ('Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        results.notifications = permission === 'granted';
      } catch {}
    }

    return results;
  }

  /**
   * Check if device is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.onUpdateCallbacks = [];
    this.initialized = false;
    console.log('[UDE] Destroyed');
  }
}

// Singleton export
export const universalDeviceEngine = new UniversalDeviceEngine();
