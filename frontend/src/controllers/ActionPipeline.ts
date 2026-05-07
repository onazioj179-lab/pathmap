/**
 * PATHFINDER V42 — ACTION PIPELINE (AP) SYSTEM
 * 
 * Guarantees correct event order and prevents conflicting async operations.
 * 
 * Pipeline Flow:
 *   [UI Event] → [InteractionController] → [State Validation] → [Async Backend Call] 
 *   → [Response Handling] → [Map Rendering] → [UI Update]
 * 
 * Rules:
 *   - No step begins until previous completes
 *   - Pipeline locks during active chain
 *   - Auto-unlocks on success or failure
 *   - Exposes current state to UI
 */

export enum PipelineState {
  IDLE = 'AP_IDLE',
  WAITING_BACKEND = 'AP_WAITING_BACKEND',
  RENDERING = 'AP_RENDERING',
  UPDATING_UI = 'AP_UPDATING_UI',
  ERROR = 'AP_ERROR'
}

export enum PipelineAction {
  ROUTE_CALCULATION = 'ROUTE_CALCULATION',
  SAFE_RETURN = 'SAFE_RETURN',
  EXPLORATION = 'EXPLORATION',
  TRACKING_START = 'TRACKING_START',
  TRACKING_STOP = 'TRACKING_STOP'
}

interface PipelineMetrics {
  stateChangeTime: number;
  backendStartTime: number | null;
  backendEndTime: number | null;
  renderStartTime: number | null;
  renderEndTime: number | null;
  uiUpdateTime: number | null;
  totalDuration: number | null;
}

interface PipelineStep {
  state: PipelineState;
  timestamp: number;
  action: PipelineAction | null;
}

class ActionPipeline {
  private currentState: PipelineState = PipelineState.IDLE;
  private currentAction: PipelineAction | null = null;
  private isLocked: boolean = false;
  private listeners: Set<(state: PipelineState, action: PipelineAction | null) => void> = new Set();
  private history: PipelineStep[] = [];
  private metrics: PipelineMetrics = this.resetMetrics();
  private errorCount: number = 0;
  private readonly MAX_HISTORY = 50;
  private readonly ERROR_RESET_DELAY = 3000; // 3 seconds
  private errorTimeout: NodeJS.Timeout | null = null;

  /**
   * Subscribe to pipeline state changes
   */
  public subscribe(listener: (state: PipelineState, action: PipelineAction | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get current pipeline state
   */
  public getState(): PipelineState {
    return this.currentState;
  }

  /**
   * Get current action
   */
  public getCurrentAction(): PipelineAction | null {
    return this.currentAction;
  }

  /**
   * Check if pipeline is locked (busy)
   */
  public getIsLocked(): boolean {
    return this.isLocked;
  }

  /**
   * Get pipeline metrics
   */
  public getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }

  /**
   * Get pipeline history
   */
  public getHistory(): PipelineStep[] {
    return [...this.history];
  }

  /**
   * Start a new pipeline action
   */
  public async startAction(
    action: PipelineAction,
    backendCall: () => Promise<any>
  ): Promise<any> {
    // Check if pipeline is locked
    if (this.isLocked) {
      console.warn(`[AP] Pipeline locked, rejecting action: ${action}`);
      throw new Error('Pipeline is busy. Please wait for current action to complete.');
    }

    // Lock pipeline
    this.lock();
    this.currentAction = action;
    this.metrics = this.resetMetrics();
    this.metrics.stateChangeTime = performance.now();

    try {
      // State: WAITING_BACKEND
      this.setState(PipelineState.WAITING_BACKEND);
      this.metrics.backendStartTime = performance.now();

      // Execute backend call
      const result = await backendCall();

      this.metrics.backendEndTime = performance.now();

      // State: RENDERING
      this.setState(PipelineState.RENDERING);
      this.metrics.renderStartTime = performance.now();

      // Allow rendering time (RAF cycle)
      await this.waitForRender();

      this.metrics.renderEndTime = performance.now();

      // State: UPDATING_UI
      this.setState(PipelineState.UPDATING_UI);
      this.metrics.uiUpdateTime = performance.now();

      // Allow UI update time
      await this.waitForUIUpdate();

      // Calculate total duration
      this.metrics.totalDuration = performance.now() - this.metrics.stateChangeTime;

      // Log metrics
      this.logMetrics();

      // Return to IDLE
      this.setState(PipelineState.IDLE);
      this.currentAction = null;
      this.unlock();

      return result;

    } catch (error) {
      // Handle error
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Manually transition to a state (for external control)
   */
  public setState(state: PipelineState): void {
    const previousState = this.currentState;
    this.currentState = state;

    // Record in history
    this.history.push({
      state,
      timestamp: performance.now(),
      action: this.currentAction
    });

    // Trim history
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }

    // Notify listeners
    this.notifyListeners();

    console.log(`[AP] ${previousState} → ${state} (action: ${this.currentAction || 'none'})`);
  }

  /**
   * Lock pipeline
   */
  private lock(): void {
    this.isLocked = true;
  }

  /**
   * Unlock pipeline
   */
  private unlock(): void {
    this.isLocked = false;
  }

  /**
   * Handle pipeline error
   */
  private handleError(error: any): void {
    console.error('[AP] Pipeline error:', error);
    this.errorCount++;
    this.setState(PipelineState.ERROR);

    // Auto-reset after delay
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
    }

    this.errorTimeout = setTimeout(() => {
      console.log('[AP] Auto-resetting after error');
      this.reset();
    }, this.ERROR_RESET_DELAY);
  }

  /**
   * Reset pipeline to IDLE
   */
  public reset(): void {
    this.currentState = PipelineState.IDLE;
    this.currentAction = null;
    this.isLocked = false;
    this.metrics = this.resetMetrics();
    this.notifyListeners();
    console.log('[AP] Pipeline reset to IDLE');
  }

  /**
   * Force unlock (emergency use only)
   */
  public forceUnlock(): void {
    console.warn('[AP] Force unlock - pipeline may be in inconsistent state');
    this.unlock();
    this.reset();
  }

  /**
   * Wait for render cycle
   */
  private waitForRender(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  }

  /**
   * Wait for UI update cycle
   */
  private waitForUIUpdate(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, 16); // ~1 frame at 60fps
    });
  }

  /**
   * Reset metrics
   */
  private resetMetrics(): PipelineMetrics {
    return {
      stateChangeTime: 0,
      backendStartTime: null,
      backendEndTime: null,
      renderStartTime: null,
      renderEndTime: null,
      uiUpdateTime: null,
      totalDuration: null
    };
  }

  /**
   * Log metrics
   */
  private logMetrics(): void {
    const m = this.metrics;
    if (m.backendStartTime && m.backendEndTime && m.totalDuration) {
      const backendTime = m.backendEndTime - m.backendStartTime;
      const renderTime = m.renderEndTime && m.renderStartTime 
        ? m.renderEndTime - m.renderStartTime 
        : 0;

      console.log(`[AP] Metrics:`, {
        action: this.currentAction,
        backendTime: `${backendTime.toFixed(2)}ms`,
        renderTime: `${renderTime.toFixed(2)}ms`,
        totalTime: `${m.totalDuration.toFixed(2)}ms`
      });
    }
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.currentState, this.currentAction);
      } catch (error) {
        console.error('[AP] Listener error:', error);
      }
    });
  }

  /**
   * Get pipeline statistics
   */
  public getStatistics(): {
    errorCount: number;
    historyLength: number;
    isLocked: boolean;
    currentState: PipelineState;
    currentAction: PipelineAction | null;
  } {
    return {
      errorCount: this.errorCount,
      historyLength: this.history.length,
      isLocked: this.isLocked,
      currentState: this.currentState,
      currentAction: this.currentAction
    };
  }
}

// Export singleton
export const actionPipeline = new ActionPipeline();

// Global debug access
if (typeof window !== 'undefined') {
  (window as any).actionPipeline = actionPipeline;
}
