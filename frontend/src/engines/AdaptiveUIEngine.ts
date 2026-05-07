/**
 * PATHFINDER V51 — ADAPTIVE UI SCALING ENGINE (AUSE)
 * 
 * Automatically scales UI elements across all device sizes:
 * - Detects device dimensions and pixel density
 * - Applies scale factor (0.85 → 1.25)
 * - Ensures 44x44dp minimum touch zones
 * - Scales typography, padding, margins
 * - Maintains identical appearance across iOS/Android
 */

export interface DeviceProfile {
  width: number;
  height: number;
  pixelRatio: number;
  scaleFactor: number;
  category: 'small-phone' | 'phone' | 'large-phone' | 'tablet' | 'desktop';
  orientation: 'portrait' | 'landscape';
}

export interface ScalingRules {
  fontSize: number;
  buttonSize: number;
  iconSize: number;
  spacing: number;
  touchZoneMin: number;
}

export class AdaptiveUIEngine {
  private profile: DeviceProfile;
  private rules: ScalingRules;
  private baseSize = 16;
  private observers: Set<(profile: DeviceProfile, rules: ScalingRules) => void> = new Set();

  constructor() {
    this.profile = this.detectDevice();
    this.rules = this.calculateScalingRules(this.profile);
    this.applyGlobalStyles();
    this.attachResizeListener();
  }

  private detectDevice(): DeviceProfile {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = window.devicePixelRatio || 1;
    const orientation = width > height ? 'landscape' : 'portrait';

    let category: DeviceProfile['category'] = 'phone';
    let scaleFactor = 1.0;

    const physicalWidth = width * pixelRatio;
    const physicalHeight = height * pixelRatio;
    const diagonal = Math.sqrt(physicalWidth ** 2 + physicalHeight ** 2);

    if (diagonal < 1200) {
      category = 'small-phone';
      scaleFactor = 0.85;
    } else if (diagonal < 1800) {
      category = 'phone';
      scaleFactor = 1.0;
    } else if (diagonal < 2400) {
      category = 'large-phone';
      scaleFactor = 1.1;
    } else if (diagonal < 3500) {
      category = 'tablet';
      scaleFactor = 1.2;
    } else {
      category = 'desktop';
      scaleFactor = 1.25;
    }

    if (orientation === 'landscape' && category !== 'desktop') {
      scaleFactor *= 0.9;
    }

    return {
      width,
      height,
      pixelRatio,
      scaleFactor,
      category,
      orientation
    };
  }

  private calculateScalingRules(profile: DeviceProfile): ScalingRules {
    const baseFontSize = this.baseSize * profile.scaleFactor;
    const buttonSize = Math.max(44, 48 * profile.scaleFactor);
    const iconSize = Math.max(20, 24 * profile.scaleFactor);
    const spacing = Math.max(8, 12 * profile.scaleFactor);
    const touchZoneMin = 44;

    return {
      fontSize: baseFontSize,
      buttonSize,
      iconSize,
      spacing,
      touchZoneMin
    };
  }

  private applyGlobalStyles(): void {
    const root = document.documentElement;
    
    root.style.setProperty('--scale-factor', this.profile.scaleFactor.toString());
    root.style.setProperty('--font-size-base', `${this.rules.fontSize}px`);
    root.style.setProperty('--button-size', `${this.rules.buttonSize}px`);
    root.style.setProperty('--icon-size', `${this.rules.iconSize}px`);
    root.style.setProperty('--spacing-unit', `${this.rules.spacing}px`);
    root.style.setProperty('--touch-zone-min', `${this.rules.touchZoneMin}px`);

    root.style.setProperty('--font-size-sm', `${this.rules.fontSize * 0.875}px`);
    root.style.setProperty('--font-size-lg', `${this.rules.fontSize * 1.125}px`);
    root.style.setProperty('--font-size-xl', `${this.rules.fontSize * 1.25}px`);

    root.style.setProperty('--spacing-xs', `${this.rules.spacing * 0.5}px`);
    root.style.setProperty('--spacing-sm', `${this.rules.spacing * 0.75}px`);
    root.style.setProperty('--spacing-md', `${this.rules.spacing}px`);
    root.style.setProperty('--spacing-lg', `${this.rules.spacing * 1.5}px`);
    root.style.setProperty('--spacing-xl', `${this.rules.spacing * 2}px`);

    document.body.style.fontSize = `${this.rules.fontSize}px`;
  }

  private attachResizeListener(): void {
    let resizeTimeout: number | null = null;
    
    window.addEventListener('resize', () => {
      if (resizeTimeout !== null) {
        clearTimeout(resizeTimeout);
      }
      
      resizeTimeout = window.setTimeout(() => {
        this.handleResize();
        resizeTimeout = null;
      }, 150);
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.handleResize(), 200);
    });
  }

  private handleResize(): void {
    const oldCategory = this.profile.category;
    const oldOrientation = this.profile.orientation;
    
    this.profile = this.detectDevice();
    this.rules = this.calculateScalingRules(this.profile);
    this.applyGlobalStyles();

    if (oldCategory !== this.profile.category || oldOrientation !== this.profile.orientation) {
      this.notifyObservers();
    }
  }

  private notifyObservers(): void {
    this.observers.forEach(callback => {
      callback(this.profile, this.rules);
    });
  }

  public subscribe(callback: (profile: DeviceProfile, rules: ScalingRules) => void): () => void {
    this.observers.add(callback);
    callback(this.profile, this.rules);
    
    return () => {
      this.observers.delete(callback);
    };
  }

  public getProfile(): DeviceProfile {
    return { ...this.profile };
  }

  public getRules(): ScalingRules {
    return { ...this.rules };
  }

  public scaleValue(baseValue: number): number {
    return baseValue * this.profile.scaleFactor;
  }

  public ensureTouchZone(size: number): number {
    return Math.max(size, this.rules.touchZoneMin);
  }
}
