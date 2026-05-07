/**
 * PATHFINDER V41/V42/V43 — INTERACTION CONTROLLER
 * 
 * Unified interaction layer that handles all UI button events.
 * V41: Debouncing, async state management, error handling
 * V42: Action Pipeline integration for sequential execution
 * V43: Scan Animation Engine integration for visual feedback
 * 
 * All UI buttons MUST call InteractionController methods, not direct API calls.
 */

import { fetchRoute, fetchSafeReturn, fetchExplore } from '../services/api';
import { deviceLocationService } from '../services/deviceLocationService';
import { actionPipeline, PipelineAction } from './ActionPipeline';
import { scanAnimationEngine, ScanMode } from './ScanAnimationEngine';

type PanelType = 'routing' | 'safe' | 'compare' | 'track' | 'marks' | null;

interface InteractionState {
  isRouteLoading: boolean;
  isSafeReturnLoading: boolean;
  isExploreLoading: boolean;
  isTrackingActive: boolean;
  activePanel: PanelType;
  lastInteractionTime: number;
}

class InteractionController {
  private state: InteractionState = {
    isRouteLoading: false,
    isSafeReturnLoading: false,
    isExploreLoading: false,
    isTrackingActive: false,
    activePanel: null,
    lastInteractionTime: 0
  };

  private listeners: Set<(state: InteractionState) => void> = new Set();
  private trackingPoints: Array<{ lat: number; lon: number; timestamp: number }> = [];
  private readonly DEBOUNCE_MS = 300; // Prevent rapid double-clicks

  /**
   * Subscribe to state changes
   */
  public subscribe(listener: (state: InteractionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get current state
   */
  public getState(): InteractionState {
    return { ...this.state };
  }

  /**
   * Update state and notify listeners
   */
  private updateState(updates: Partial<InteractionState>): void {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach(listener => listener(this.state));
  }

  /**
   * Check if enough time has passed since last interaction (debounce)
   */
  private canInteract(): boolean {
    const now = Date.now();
    if (now - this.state.lastInteractionTime < this.DEBOUNCE_MS) {
      console.warn('Interaction debounced - too fast');
      return false;
    }
    this.updateState({ lastInteractionTime: now });
    return true;
  }

  /**
   * Start route calculation (V42: Pipeline integrated, V43: SAE enabled)
   */
  public async onStartRoute(
    startPoint: [number, number],
    endPoint: [number, number],
    algorithm: string = 'shadowpath',
    onSuccess?: (routeData: any) => void,
    onError?: (error: string) => void
  ): Promise<void> {
    if (!this.canInteract()) return;
    if (this.state.isRouteLoading) {
      console.warn('Route already loading');
      return;
    }

    this.updateState({ isRouteLoading: true });

    try {
      // V43: Start scan animation
      scanAnimationEngine.startScan({
        mode: ScanMode.ROUTE,
        origin: startPoint,
        target: endPoint,
        color: '#3b82f6'
      });

      // V42: Execute through Action Pipeline
      const routeData = await actionPipeline.startAction(
        PipelineAction.ROUTE_CALCULATION,
        async () => {
          return await fetchRoute({
            start_lat: startPoint[0],
            start_lon: startPoint[1],
            end_lat: endPoint[0],
            end_lon: endPoint[1],
            algorithm: algorithm as any,
            profile: 'walking'
          });
        }
      );

      // V43: Stop scan animation
      scanAnimationEngine.stopScan();
      
      if (onSuccess) {
        onSuccess(routeData);
      }

      console.log('[V42] Route calculated successfully');
    } catch (error) {
      // V43: Force stop animation on error
      scanAnimationEngine.forceStop();
      
      const errorMsg = error instanceof Error ? error.message : 'Route calculation failed';
      console.error('[V42] Route error:', errorMsg);
      
      if (onError) {
        onError(errorMsg);
      }
    } finally {
      this.updateState({ isRouteLoading: false });
    }
  }

  /**
   * Calculate safe return route (V42: Pipeline integrated, V43: SAE enabled)
   */
  public async onSafeReturn(
    currentPosition: [number, number],
    onSuccess?: (routeData: any) => void,
    onError?: (error: string) => void
  ): Promise<void> {
    if (!this.canInteract()) return;
    if (this.state.isSafeReturnLoading) {
      console.warn('Safe return already loading');
      return;
    }

    this.updateState({ isSafeReturnLoading: true });

    try {
      // V43: Start scan animation
      scanAnimationEngine.startScan({
        mode: ScanMode.SAFE_RETURN,
        origin: currentPosition,
        color: '#10b981'
      });

      // V42: Execute through Action Pipeline
      const routeData = await actionPipeline.startAction(
        PipelineAction.SAFE_RETURN,
        async () => {
          return await fetchSafeReturn({
            current_lat: currentPosition[0],
            current_lon: currentPosition[1],
            breadcrumb_trail: [],
            profile: 'walking'
          });
        }
      );

      // V43: Stop scan animation
      scanAnimationEngine.stopScan();
      
      if (onSuccess) {
        onSuccess(routeData);
      }

      console.log('[V42] Safe return route calculated');
    } catch (error) {
      // V43: Force stop animation on error
      scanAnimationEngine.forceStop();
      
      const errorMsg = error instanceof Error ? error.message : 'Safe return calculation failed';
      console.error('[V42] Safe return error:', errorMsg);
      
      if (onError) {
        onError(errorMsg);
      }
    } finally {
      this.updateState({ isSafeReturnLoading: false });
    }
  }

  /**
   * Calculate exploration route (V42: Pipeline integrated, V43: SAE enabled)
   */
  public async onExplore(
    currentPosition: [number, number],
    radius: number = 1000,
    onSuccess?: (routeData: any) => void,
    onError?: (error: string) => void
  ): Promise<void> {
    if (!this.canInteract()) return;
    if (this.state.isExploreLoading) {
      console.warn('Explore already loading');
      return;
    }

    this.updateState({ isExploreLoading: true });

    try {
      // V43: Start scan animation
      scanAnimationEngine.startScan({
        mode: ScanMode.EXPLORATION,
        origin: currentPosition,
        radius: radius,
        color: '#8b5cf6'
      });

      // V42: Execute through Action Pipeline
      const routeData = await actionPipeline.startAction(
        PipelineAction.EXPLORATION,
        async () => {
          return await fetchExplore({
            start_lat: currentPosition[0],
            start_lon: currentPosition[1],
            radius: radius,
            max_points: 50
          });
        }
      );

      // V43: Stop scan animation
      scanAnimationEngine.stopScan();
      
      if (onSuccess) {
        onSuccess(routeData);
      }

      console.log('[V42] Exploration route calculated');
    } catch (error) {
      // V43: Force stop animation on error
      scanAnimationEngine.forceStop();
      
      const errorMsg = error instanceof Error ? error.message : 'Exploration calculation failed';
      console.error('[V42] Explore error:', errorMsg);
      
      if (onError) {
        onError(errorMsg);
      }
    } finally {
      this.updateState({ isExploreLoading: false });
    }
  }

  /**
   * Start tracking user movement
   */
  public onTrackStart(): void {
    if (!this.canInteract()) return;
    if (this.state.isTrackingActive) {
      console.warn('Tracking already active');
      return;
    }

    this.trackingPoints = [];
    this.updateState({ isTrackingActive: true });

    // Subscribe to device location updates
    deviceLocationService.addLocationListener((location) => {
      if (this.state.isTrackingActive) {
        this.trackingPoints.push({
          lat: location.latitude,
          lon: location.longitude,
          timestamp: location.timestamp
        });
        console.log(`Tracking point added: ${this.trackingPoints.length} total`);
      }
    });

    console.log('Tracking started');
  }

  /**
   * Stop tracking and return recorded path
   */
  public onTrackStop(): Array<{ lat: number; lon: number; timestamp: number }> {
    if (!this.state.isTrackingActive) {
      console.warn('Tracking not active');
      return [];
    }

    this.updateState({ isTrackingActive: false });
    const points = [...this.trackingPoints];
    console.log(`Tracking stopped. Recorded ${points.length} points`);
    
    return points;
  }

  /**
   * Open a panel
   */
  public onPanelOpen(panel: PanelType): void {
    if (this.state.activePanel === panel) {
      console.log(`Panel ${panel} already open`);
      return;
    }

    this.updateState({ activePanel: panel });
    console.log(`Panel opened: ${panel}`);
  }

  /**
   * Close the active panel
   */
  public onPanelClose(): void {
    if (this.state.activePanel === null) {
      console.log('No panel to close');
      return;
    }

    const closedPanel = this.state.activePanel;
    this.updateState({ activePanel: null });
    console.log(`Panel closed: ${closedPanel}`);
  }

  /**
   * Toggle panel (open if closed, close if open)
   */
  public onPanelToggle(panel: PanelType): void {
    if (this.state.activePanel === panel) {
      this.onPanelClose();
    } else {
      this.onPanelOpen(panel);
    }
  }

  /**
   * Get tracking points
   */
  public getTrackingPoints(): Array<{ lat: number; lon: number; timestamp: number }> {
    return [...this.trackingPoints];
  }

  /**
   * Clear all tracking data
   */
  public clearTracking(): void {
    this.trackingPoints = [];
    this.updateState({ isTrackingActive: false });
    console.log('Tracking data cleared');
  }

  /**
   * Check if any async operation is in progress
   */
  public isLoading(): boolean {
    return this.state.isRouteLoading || 
           this.state.isSafeReturnLoading || 
           this.state.isExploreLoading;
  }
}

// Export singleton instance
export const interactionController = new InteractionController();
