/**
 * PATHFINDER V35 — AUTO SAFE TRAIL RECORDING
 * 
 * Automatically records breadcrumb trail whenever user enters risky conditions:
 * - Ambient Mode active (night, unsafe area, unfamiliar)
 * - Low GPS accuracy
 * - User exploring (PathfinderX)
 * - Anti-Lost Mode active
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Breadcrumb {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  reason: string;              // Why this breadcrumb was recorded
}

export interface ZoneEntry {
  zoneName: string;
  entryTime: number;
  exitTime: number | null;
  safetyLevel: number;         // 0-1
  familiarityScore: number;    // 0-1
  breadcrumbCount: number;
}

export interface SafeReturnCandidate {
  latitude: number;
  longitude: number;
  distanceFromHere: number;    // meters
  familiarityScore: number;    // 0-1
  safetyLevel: number;         // 0-1
  timestamp: number;
}

export interface TrailRecordingState {
  isRecording: boolean;
  recordingReason: string[];
  currentTrail: Breadcrumb[];
  recentZones: ZoneEntry[];
  safeReturnCandidates: SafeReturnCandidate[];
  totalBreadcrumbs: number;
  recordingSince: number;
}

// ============================================================================
// AUTO SAFE TRAIL RECORDING ENGINE
// ============================================================================

class AutoSafeTrailRecordingEngine {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  
  private state: TrailRecordingState = {
    isRecording: false,
    recordingReason: [],
    currentTrail: [],
    recentZones: [],
    safeReturnCandidates: [],
    totalBreadcrumbs: 0,
    recordingSince: 0,
  };

  private readonly UPDATE_INTERVAL_MS = 2000; // Record every 2s when active
  private readonly MAX_BREADCRUMBS = 500;
  private readonly MAX_ZONES = 50;
  private readonly MAX_SAFE_CANDIDATES = 20;
  private readonly STORAGE_KEY = 'pathfinder_safe_trail';

  private listeners: ((state: TrailRecordingState) => void)[] = [];

  constructor() {
    this.loadFromStorage();
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  start(): void {
    if (this.isRunning) {
      console.warn('[AutoSafeTrail] Already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.checkRecordingConditions();
    }, this.UPDATE_INTERVAL_MS);

    console.log('[AutoSafeTrail] Started monitoring');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.saveToStorage();
    console.log('[AutoSafeTrail] Stopped');
  }

  // ==========================================================================
  // RECORDING CONDITIONS
  // ==========================================================================

  private checkRecordingConditions(): void {
    const reasons: string[] = [];

    // Import engines to check conditions
    try {
      const { getAmbientModeEngine } = require('./ambientModeEngine');
      const { getDeviceLocationEngine } = require('./deviceLocationEngine');
      const { getAntiLostModeEngine } = require('./antiLostModeEngine');

      const ambient = getAmbientModeEngine();
      const dle = getDeviceLocationEngine();
      const antiLost = getAntiLostModeEngine();

      // Condition 1: Ambient Mode active
      if (ambient.isActive()) {
        reasons.push('ambient_mode_active');
      }

      // Condition 2: Low GPS accuracy
      const gpsMetrics = dle.getQualityMetrics();
      if (gpsMetrics.accuracyLevel === 'low') {
        reasons.push('low_gps_accuracy');
      }

      // Condition 3: Anti-Lost Mode active
      if (antiLost.isActive()) {
        reasons.push('anti_lost_mode_active');
      }

      // Condition 4: PathfinderX exploring (would need to check current algorithm)
      // For now, assume exploring if user has been moving with frequent stops
      
    } catch (error) {
      // Engines not available, use manual triggers
    }

    const shouldRecord = reasons.length > 0;

    if (shouldRecord && !this.state.isRecording) {
      this.startRecording(reasons);
    } else if (!shouldRecord && this.state.isRecording) {
      this.stopRecording();
    }

    if (this.state.isRecording) {
      this.recordCurrentPosition();
    }
  }

  // ==========================================================================
  // RECORDING CONTROL
  // ==========================================================================

  private startRecording(reasons: string[]): void {
    this.state.isRecording = true;
    this.state.recordingReason = reasons;
    this.state.recordingSince = Date.now();

    console.log(`[AutoSafeTrail] Started recording: ${reasons.join(', ')}`);
    this.notifyListeners();
  }

  private stopRecording(): void {
    if (!this.state.isRecording) return;

    const duration = Date.now() - this.state.recordingSince;
    console.log(`[AutoSafeTrail] Stopped recording (${this.state.currentTrail.length} breadcrumbs in ${Math.round(duration/1000)}s)`);

    // Archive current trail
    this.archiveCurrentTrail();

    this.state.isRecording = false;
    this.state.recordingReason = [];
    this.state.recordingSince = 0;

    this.notifyListeners();
  }

  // ==========================================================================
  // BREADCRUMB RECORDING
  // ==========================================================================

  private recordCurrentPosition(): void {
    try {
      const { getDeviceLocationEngine } = require('./deviceLocationEngine');
      const dle = getDeviceLocationEngine();
      const location = dle.getCurrentLocation();

      if (!location) return;

      const breadcrumb: Breadcrumb = {
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: Date.now(),
        accuracy: location.accuracy,
        speed: location.speed,
        heading: location.heading,
        reason: this.state.recordingReason.join(', '),
      };

      this.state.currentTrail.push(breadcrumb);
      this.state.totalBreadcrumbs++;

      // Trim if too long
      if (this.state.currentTrail.length > this.MAX_BREADCRUMBS) {
        this.state.currentTrail.shift();
      }

      // Update safe return candidates
      this.updateSafeReturnCandidates(breadcrumb);

      console.log(`[AutoSafeTrail] Recorded breadcrumb #${this.state.totalBreadcrumbs} (${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)})`);

    } catch (error) {
      console.error('[AutoSafeTrail] Failed to record position:', error);
    }
  }

  private updateSafeReturnCandidates(breadcrumb: Breadcrumb): void {
    try {
      const { getFamiliarityHeatmapEngine } = require('./familiarityHeatmapEngine');
      const heatmap = getFamiliarityHeatmapEngine();

      const familiarityScore = heatmap.getFamiliarityAtLocation(breadcrumb.latitude, breadcrumb.longitude);

      // Add as safe candidate if familiar (>0.7) or high accuracy (<10m)
      if (familiarityScore > 0.7 || breadcrumb.accuracy < 10) {
        const candidate: SafeReturnCandidate = {
          latitude: breadcrumb.latitude,
          longitude: breadcrumb.longitude,
          distanceFromHere: 0, // Will be calculated when needed
          familiarityScore,
          safetyLevel: familiarityScore > 0.8 ? 0.9 : 0.7, // Simplified safety
          timestamp: breadcrumb.timestamp,
        };

        this.state.safeReturnCandidates.push(candidate);

        // Trim if too many
        if (this.state.safeReturnCandidates.length > this.MAX_SAFE_CANDIDATES) {
          this.state.safeReturnCandidates.shift();
        }
      }
    } catch (error) {
      // Familiarity engine not available
    }
  }

  // ==========================================================================
  // ZONE TRACKING
  // ==========================================================================

  recordZoneEntry(zoneName: string, safetyLevel: number, familiarityScore: number): void {
    const zoneEntry: ZoneEntry = {
      zoneName,
      entryTime: Date.now(),
      exitTime: null,
      safetyLevel,
      familiarityScore,
      breadcrumbCount: 0,
    };

    this.state.recentZones.push(zoneEntry);

    // Trim if too many
    if (this.state.recentZones.length > this.MAX_ZONES) {
      this.state.recentZones.shift();
    }

    console.log(`[AutoSafeTrail] Entered zone: ${zoneName} (safety: ${safetyLevel.toFixed(2)}, familiarity: ${familiarityScore.toFixed(2)})`);
  }

  recordZoneExit(zoneName: string): void {
    // Find most recent zone entry with matching name
    for (let i = this.state.recentZones.length - 1; i >= 0; i--) {
      const zone = this.state.recentZones[i];
      if (zone.zoneName === zoneName && zone.exitTime === null) {
        zone.exitTime = Date.now();
        zone.breadcrumbCount = this.state.currentTrail.filter(b => 
          b.timestamp >= zone.entryTime && b.timestamp <= zone.exitTime!
        ).length;
        
        console.log(`[AutoSafeTrail] Exited zone: ${zoneName} (${zone.breadcrumbCount} breadcrumbs)`);
        break;
      }
    }
  }

  // ==========================================================================
  // STORAGE
  // ==========================================================================

  private archiveCurrentTrail(): void {
    // For now, just add to safe return candidates
    // In full implementation, would store in separate archive
    this.state.currentTrail = [];
  }

  private saveToStorage(): void {
    try {
      const data = {
        recentZones: this.state.recentZones,
        safeReturnCandidates: this.state.safeReturnCandidates,
        totalBreadcrumbs: this.state.totalBreadcrumbs,
        lastSaved: Date.now(),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      console.log(`[AutoSafeTrail] Saved ${this.state.safeReturnCandidates.length} safe candidates to storage`);
    } catch (error) {
      console.error('[AutoSafeTrail] Failed to save to storage:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.state.recentZones = parsed.recentZones || [];
        this.state.safeReturnCandidates = parsed.safeReturnCandidates || [];
        this.state.totalBreadcrumbs = parsed.totalBreadcrumbs || 0;
        
        console.log(`[AutoSafeTrail] Loaded ${this.state.safeReturnCandidates.length} safe candidates from storage`);
      }
    } catch (error) {
      console.error('[AutoSafeTrail] Failed to load from storage:', error);
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  getState(): TrailRecordingState {
    return { ...this.state };
  }

  isRecording(): boolean {
    return this.state.isRecording;
  }

  getCurrentTrail(): Breadcrumb[] {
    return [...this.state.currentTrail];
  }

  getSafeReturnCandidates(): SafeReturnCandidate[] {
    return [...this.state.safeReturnCandidates];
  }

  forceStartRecording(reason: string): void {
    this.startRecording([reason]);
  }

  forceStopRecording(): void {
    this.stopRecording();
  }

  exportTrailData(): string {
    const data = {
      currentTrail: this.state.currentTrail,
      recentZones: this.state.recentZones,
      safeReturnCandidates: this.state.safeReturnCandidates,
      exportedAt: Date.now(),
    };
    return JSON.stringify(data, null, 2);
  }

  onStateChange(callback: (state: TrailRecordingState) => void): void {
    this.listeners.push(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  reset(): void {
    this.stop();
    this.state = {
      isRecording: false,
      recordingReason: [],
      currentTrail: [],
      recentZones: [],
      safeReturnCandidates: [],
      totalBreadcrumbs: 0,
      recordingSince: 0,
    };
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('[AutoSafeTrail] Reset all data');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let autoSafeTrailRecordingEngineInstance: AutoSafeTrailRecordingEngine | null = null;

export function getAutoSafeTrailRecordingEngine(): AutoSafeTrailRecordingEngine {
  if (!autoSafeTrailRecordingEngineInstance) {
    autoSafeTrailRecordingEngineInstance = new AutoSafeTrailRecordingEngine();
  }
  return autoSafeTrailRecordingEngineInstance;
}

export default getAutoSafeTrailRecordingEngine;