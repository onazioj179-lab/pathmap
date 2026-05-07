/**
 * PATHFINDER V59 — HAPTIC FEEDBACK ENGINE (HFE)
 * 
 * Provides tactile feedback for user interactions across iOS and Android.
 * All haptics are optional and respect OS-level permissions.
 */

type HapticImpact = 'light' | 'medium' | 'rigid' | 'selection';

class HapticFeedbackEngine {
  private isSupported: boolean = false;

  constructor() {
    this.detectSupport();
  }

  /**
   * Detect if haptic feedback is available on this device
   */
  private detectSupport(): void {
    if (typeof window === 'undefined') {
      this.isSupported = false;
      return;
    }

    // Check for Vibration API (Android, most browsers)
    if ('vibrate' in navigator) {
      this.isSupported = true;
      return;
    }

    // Check for iOS-specific haptics (via webkit)
    if ('ontouchstart' in window) {
      this.isSupported = true;
      return;
    }

    this.isSupported = false;
  }

  /**
   * Trigger haptic feedback with specified impact level
   */
  public trigger(impact: HapticImpact = 'light'): void {
    if (!this.isSupported) return;

    try {
      // Use Vibration API (Android, Web)
      if ('vibrate' in navigator) {
        const patterns: Record<HapticImpact, number | number[]> = {
          light: 10,
          medium: 20,
          rigid: 30,
          selection: [5, 10, 5],
        };

        const pattern = patterns[impact] || 10;
        navigator.vibrate(pattern);
      }

      // Note: iOS Safari doesn't expose haptic APIs to web
      // Haptics are triggered automatically by system on certain interactions
    } catch (error) {
      // Silently fail - haptics are optional enhancement
      console.debug('[HFE] Haptic trigger failed:', error);
    }
  }

  /**
   * Trigger light haptic for button taps
   */
  public tapLight(): void {
    this.trigger('light');
  }

  /**
   * Trigger medium haptic for important actions
   */
  public tapMedium(): void {
    this.trigger('medium');
  }

  /**
   * Trigger rigid haptic for errors or warnings
   */
  public tapRigid(): void {
    this.trigger('rigid');
  }

  /**
   * Trigger selection haptic for tab switches
   */
  public tapSelection(): void {
    this.trigger('selection');
  }

  /**
   * Check if haptics are supported
   */
  public isAvailable(): boolean {
    return this.isSupported;
  }
}

// =====================================================================
// SINGLETON INSTANCE
// =====================================================================

export const hapticFeedback = new HapticFeedbackEngine();
// Production: no global debug exposure (HEPS)
