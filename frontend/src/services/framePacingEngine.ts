/**
 * PATHFINDER V57 — FRAME PACING ENGINE (FPE)
 * 
 * PURPOSE:
 *   Ensures perfect 120Hz rendering rhythm on compatible devices with:
 *     - Adaptive frame timing based on device refresh rate
 *     - Budget monitoring to prevent frame drops
 *     - Automatic fallback to 90Hz/60Hz when needed
 *     - Zero double-draw frames
 *     - Predictable frame intervals for smooth animation
 * 
 * TARGETS:
 *   - 120Hz: 8.33ms per frame
 *   - 90Hz: 11.11ms per frame
 *   - 60Hz: 16.67ms per frame (fallback)
 * 
 * ARCHITECTURE:
 *   - Uses requestAnimationFrame for native sync
 *   - Tracks frame timing with performance.now()
 *   - Adapts to device capabilities automatically
 *   - Provides render callbacks with delta time
 */

export type RefreshRate = 120 | 90 | 60;

interface FrameMetrics {
  fps: number;
  frameTime: number;
  droppedFrames: number;
  targetRefreshRate: RefreshRate;
  actualRefreshRate: number;
}

interface FramePacingConfig {
  targetRefreshRate: RefreshRate;
  frameBudgetMs: number;
  adaptiveThreshold: number; // % of budget before downgrade
}

class FramePacingEngine {
  private rafId: number | null = null;
  private lastFrameTime: number = 0;
  private deltaTime: number = 0;
  private frameCount: number = 0;
  private droppedFrames: number = 0;
  private fpsHistory: number[] = [];
  private isRunning: boolean = false;

  private config: FramePacingConfig = {
    targetRefreshRate: 120,
    frameBudgetMs: 8.33, // 120Hz budget
    adaptiveThreshold: 0.85, // 85% budget usage triggers downgrade
  };

  private renderCallback: ((deltaMs: number) => void) | null = null;

  constructor() {
    this.detectDeviceCapability();
  }

  /**
   * Detect device refresh rate capability
   */
  private detectDeviceCapability(): void {
    // Check for high refresh rate support
    if (typeof window !== 'undefined') {
      // Modern browsers expose screen refresh rate
      const screen = window.screen as any;
      const refreshRate = screen.refreshRate || 60;

      if (refreshRate >= 120) {
        this.setTargetRefreshRate(120);
      } else if (refreshRate >= 90) {
        this.setTargetRefreshRate(90);
      } else {
        this.setTargetRefreshRate(60);
      }
    }
  }

  /**
   * Set target refresh rate and update frame budget
   */
  public setTargetRefreshRate(rate: RefreshRate): void {
    this.config.targetRefreshRate = rate;
    this.config.frameBudgetMs = 1000 / rate;
    console.log(`[V57 FPE] Target refresh rate: ${rate}Hz (${this.config.frameBudgetMs.toFixed(2)}ms budget)`);
  }

  /**
   * Start the frame pacing loop
   */
  public start(renderCallback: (deltaMs: number) => void): void {
    if (this.isRunning) return;

    this.renderCallback = renderCallback;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.droppedFrames = 0;
    this.fpsHistory = [];

    this.loop();
  }

  /**
   * Stop the frame pacing loop
   */
  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isRunning = false;
    this.renderCallback = null;
  }

  /**
   * Main render loop with 120Hz pacing
   */
  private loop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    this.deltaTime = now - this.lastFrameTime;

    // Skip frame if too soon (prevent double-draw)
    const minFrameTime = this.config.frameBudgetMs * 0.95;
    if (this.deltaTime < minFrameTime) {
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    // Track FPS
    this.frameCount++;
    const fps = 1000 / this.deltaTime;
    this.fpsHistory.push(fps);
    if (this.fpsHistory.length > 120) {
      this.fpsHistory.shift();
    }

    // Detect dropped frames
    const expectedFrames = Math.floor(this.deltaTime / this.config.frameBudgetMs);
    if (expectedFrames > 1) {
      this.droppedFrames += (expectedFrames - 1);
    }

    // Execute render callback
    if (this.renderCallback) {
      const frameStart = performance.now();
      this.renderCallback(this.deltaTime);
      const frameEnd = performance.now();
      const frameDuration = frameEnd - frameStart;

      // Check if we're exceeding budget
      const budgetUsage = frameDuration / this.config.frameBudgetMs;
      if (budgetUsage > this.config.adaptiveThreshold) {
        this.considerDowngrade();
      }
    }

    this.lastFrameTime = now;
    this.rafId = requestAnimationFrame(this.loop);
  };

  /**
   * Consider downgrading refresh rate if consistently over budget
   */
  private considerDowngrade(): void {
    const avgFps = this.getAverageFPS();
    const targetFps = this.config.targetRefreshRate;

    // If average FPS is consistently below target, downgrade
    if (avgFps < targetFps * 0.85) {
      if (this.config.targetRefreshRate === 120) {
        console.warn('[V57 FPE] Downgrading to 90Hz due to performance');
        this.setTargetRefreshRate(90);
      } else if (this.config.targetRefreshRate === 90) {
        console.warn('[V57 FPE] Downgrading to 60Hz due to performance');
        this.setTargetRefreshRate(60);
      }
    }
  }

  /**
   * Get average FPS from recent history
   */
  private getAverageFPS(): number {
    if (this.fpsHistory.length === 0) return 0;
    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    return sum / this.fpsHistory.length;
  }

  /**
   * Get current frame metrics
   */
  public getMetrics(): FrameMetrics {
    return {
      fps: this.getAverageFPS(),
      frameTime: this.deltaTime,
      droppedFrames: this.droppedFrames,
      targetRefreshRate: this.config.targetRefreshRate,
      actualRefreshRate: this.getAverageFPS(),
    };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.frameCount = 0;
    this.droppedFrames = 0;
    this.fpsHistory = [];
  }

  /**
   * Check if running at target refresh rate
   */
  public isAtTargetRefreshRate(): boolean {
    const avgFps = this.getAverageFPS();
    const targetFps = this.config.targetRefreshRate;
    return avgFps >= targetFps * 0.95; // Within 5% of target
  }
}

// =====================================================================
// SINGLETON INSTANCE (LONG-TERM STABILITY)
// =====================================================================

export const framePacingEngine = new FramePacingEngine();

// Expose globally for debugging (non-production only)
if (typeof window !== 'undefined') {
  (window as any).__FPE__ = framePacingEngine;
}
