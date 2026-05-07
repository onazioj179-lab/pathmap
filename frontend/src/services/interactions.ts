/**
 * PATHFINDER V59 — MICRO-INTERACTIONS + HAPTICS + ANIMATION POLISH
 * 
 * Micro-Interaction Engine (MIE)
 * Haptic Feedback Engine (HFE)
 * Animation Polish Layer (APL)
 */

/**
 * ================================================================
 * MICRO-INTERACTION ENGINE (MIE)
 * ================================================================
 */

export class MicroInteractionEngine {
  private static instance: MicroInteractionEngine;
  private activeInteractions: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {}

  public static getInstance(): MicroInteractionEngine {
    if (!MicroInteractionEngine.instance) {
      MicroInteractionEngine.instance = new MicroInteractionEngine();
    }
    return MicroInteractionEngine.instance;
  }

  /**
   * Apply press feedback: scale down + opacity shift
   */
  public applyPressEffect(element: HTMLElement, intensity: 'light' | 'medium' = 'medium'): void {
    if (!element) return;

    const scale = intensity === 'light' ? 0.98 : 0.97;
    const opacity = intensity === 'light' ? 0.85 : 0.8;

    element.style.transform = `scale(${scale})`;
    element.style.opacity = String(opacity);
    element.style.transition = 'transform 100ms cubic-bezier(0.25, 0.1, 0.25, 1.0), opacity 100ms ease-out';

    // Clear any existing timeout
    const key = element.dataset.mieKey || `mie-${Date.now()}`;
    element.dataset.mieKey = key;
    
    if (this.activeInteractions.has(key)) {
      clearTimeout(this.activeInteractions.get(key)!);
    }

    // Release after 150ms
    const timeout = setTimeout(() => {
      element.style.transform = 'scale(1.0)';
      element.style.opacity = '1.0';
      this.activeInteractions.delete(key);
    }, 150);

    this.activeInteractions.set(key, timeout);
  }

  /**
   * Apply hover effect: subtle shadow + opacity boost
   */
  public applyHoverEffect(element: HTMLElement, entering: boolean): void {
    if (!element) return;

    if (entering) {
      element.style.opacity = '1.0';
      element.style.filter = 'brightness(1.05)';
      element.style.transition = 'opacity 120ms ease-out, filter 120ms ease-out';
    } else {
      element.style.opacity = '';
      element.style.filter = '';
    }
  }

  /**
   * Apply ripple effect (for Android-style feedback)
   */
  public applyRipple(element: HTMLElement, x: number, y: number): void {
    if (!element) return;

    const ripple = document.createElement('div');
    ripple.className = 'v59-ripple';
    
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const relX = x - rect.left - size / 2;
    const relY = y - rect.top - size / 2;

    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${relX}px`;
    ripple.style.top = `${relY}px`;

    element.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);
  }

  /**
   * Cleanup all active interactions
   */
  public cleanup(): void {
    this.activeInteractions.forEach(timeout => clearTimeout(timeout));
    this.activeInteractions.clear();
  }
}

/**
 * ================================================================
 * HAPTIC FEEDBACK ENGINE (HFE)
 * ================================================================
 */

export type HapticIntensity = 'light' | 'medium' | 'rigid' | 'selection';

export class HapticFeedbackEngine {
  private static instance: HapticFeedbackEngine;
  private enabled: boolean = true;
  private supportsVibration: boolean = false;

  private constructor() {
    this.supportsVibration = 'vibrate' in navigator;
    
    // Check localStorage for user preference
    const savedPref = localStorage.getItem('v59-haptics-enabled');
    if (savedPref !== null) {
      this.enabled = savedPref === 'true';
    }
  }

  public static getInstance(): HapticFeedbackEngine {
    if (!HapticFeedbackEngine.instance) {
      HapticFeedbackEngine.instance = new HapticFeedbackEngine();
    }
    return HapticFeedbackEngine.instance;
  }

  /**
   * Trigger haptic feedback based on intensity
   */
  public trigger(intensity: HapticIntensity): void {
    if (!this.enabled || !this.supportsVibration) return;

    const patterns: Record<HapticIntensity, number | number[]> = {
      light: 10,
      medium: 20,
      rigid: [15, 10, 15],
      selection: 5
    };

    const pattern = patterns[intensity];
    
    if (typeof pattern === 'number') {
      navigator.vibrate(pattern);
    } else {
      navigator.vibrate(pattern);
    }
  }

  /**
   * Toggle haptic feedback
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    localStorage.setItem('v59-haptics-enabled', String(enabled));
  }

  /**
   * Check if haptics are enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * ================================================================
 * ANIMATION POLISH LAYER (APL)
 * ================================================================
 */

export const AnimationCurves = {
  quickTap: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)',
  panelSlide: 'cubic-bezier(0.20, 0.6, 0.2, 1)',
  mapCameraEase: 'cubic-bezier(0.16, 0.84, 0.44, 1)',
  panelFade: 'ease-out',
  searchReveal: 'ease-in-out'
} as const;

export const AnimationDurations = {
  instant: 100,
  quick: 150,
  base: 220,
  smooth: 260,
  slow: 320
} as const;

export class AnimationPolishLayer {
  /**
   * Animate element with specified curve and duration
   */
  public static animate(
    element: HTMLElement,
    properties: Partial<CSSStyleDeclaration>,
    duration: number,
    curve: string
  ): Promise<void> {
    return new Promise((resolve) => {
      element.style.transition = Object.keys(properties)
        .map(prop => `${this.camelToKebab(prop)} ${duration}ms ${curve}`)
        .join(', ');

      Object.assign(element.style, properties);

      setTimeout(() => {
        resolve();
      }, duration);
    });
  }

  /**
   * Stagger animation for multiple elements
   */
  public static stagger(
    elements: HTMLElement[],
    animationFn: (el: HTMLElement) => void,
    delayMs: number
  ): void {
    elements.forEach((el, index) => {
      setTimeout(() => {
        animationFn(el);
      }, index * delayMs);
    });
  }

  /**
   * Convert camelCase to kebab-case for CSS properties
   */
  private static camelToKebab(str: string): string {
    return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
  }

  /**
   * Smooth scroll with custom easing
   */
  public static smoothScroll(
    element: HTMLElement,
    targetY: number,
    duration: number = AnimationDurations.smooth
  ): void {
    const startY = element.scrollTop;
    const distance = targetY - startY;
    const startTime = performance.now();

    const easeInOutCubic = (t: number): number => {
      return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    const scroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(progress);

      element.scrollTop = startY + distance * eased;

      if (progress < 1) {
        requestAnimationFrame(scroll);
      }
    };

    requestAnimationFrame(scroll);
  }
}

/**
 * ================================================================
 * UNIFIED INTERACTION HOOKS
 * ================================================================
 */

export function useButtonInteraction(element: HTMLElement | null): void {
  if (!element) return;

  const mie = MicroInteractionEngine.getInstance();
  const hfe = HapticFeedbackEngine.getInstance();

  const handlePointerDown = (e: PointerEvent) => {
    mie.applyPressEffect(element, 'medium');
    hfe.trigger('light');
    
    if (e.pointerType === 'touch') {
      mie.applyRipple(element, e.clientX, e.clientY);
    }
  };

  const handlePointerEnter = () => {
    mie.applyHoverEffect(element, true);
  };

  const handlePointerLeave = () => {
    mie.applyHoverEffect(element, false);
  };

  element.addEventListener('pointerdown', handlePointerDown);
  element.addEventListener('pointerenter', handlePointerEnter);
  element.addEventListener('pointerleave', handlePointerLeave);

  // Cleanup
  return () => {
    element.removeEventListener('pointerdown', handlePointerDown);
    element.removeEventListener('pointerenter', handlePointerEnter);
    element.removeEventListener('pointerleave', handlePointerLeave);
  };
}

export function useTabInteraction(element: HTMLElement | null, isActive: boolean): void {
  if (!element) return;

  const hfe = HapticFeedbackEngine.getInstance();

  const handleClick = () => {
    if (!isActive) {
      hfe.trigger('selection');
    }
  };

  element.addEventListener('click', handleClick);

  return () => {
    element.removeEventListener('click', handleClick);
  };
}

// Export singleton instances
export const microInteractions = MicroInteractionEngine.getInstance();
export const hapticFeedback = HapticFeedbackEngine.getInstance();
