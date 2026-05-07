// PathFinder V35 - Shadow Replay Visualization Engine
// Post-journey analysis showing actual path vs ideal algorithmic path
// Identifies deviations, time losses, and algorithm performance metrics

export interface JourneyRecord {
  id: string;
  start_time: number;
  end_time: number;
  algorithm_used: string;
  actual_path: Array<[number, number, number]>; // [lat, lon, timestamp]
  ideal_path?: Array<[number, number]>;
  deviations?: DeviationEvent[];
  total_distance: number;
  total_time: number;
  safety_events: SafetyEvent[];
}

export interface DeviationEvent {
  timestamp: number;
  location: [number, number];
  distance_from_ideal: number;
  deviation_type: 'minor_detour' | 'wrong_turn' | 'backtrack' | 'long_stop' | 'route_change';
  time_cost: number; // seconds lost
  reason?: string;
}

export interface SafetyEvent {
  timestamp: number;
  location: [number, number];
  event_type: 'ambient_mode_trigger' | 'anti_lost_activation' | 'low_battery' | 'poor_gps' | 'darkness_mode';
  algorithm_response: string;
  safety_boost: number;
}

export interface ReplayAnalysis {
  journey_id: string;
  algorithm_performance: {
    route_adherence_score: number; // 0-100, higher = followed algorithm better
    efficiency_rating: number;     // 0-100, based on time vs ideal
    safety_compliance: number;     // 0-100, safety event handling
    overall_score: number;         // weighted average
  };
  deviation_summary: {
    total_deviations: number;
    worst_deviation: DeviationEvent | null;
    most_common_type: string;
    total_time_lost: number;
    total_extra_distance: number;
  };
  algorithm_insights: {
    suggested_algorithm: string;
    confidence: number;
    reasoning: string;
    performance_comparison?: {
      [algorithm: string]: {
        estimated_time: number;
        estimated_safety: number;
        suitability_score: number;
      };
    };
  };
  learning_data: {
    route_preferences: Array<{
      segment: [number, number][];
      preference_weight: number;
      reason: string;
    }>;
    avoidance_zones: Array<{
      center: [number, number];
      radius: number;
      reason: string;
    }>;
  };
}

export interface ShadowReplayState {
  isRecording: boolean;
  current_journey: JourneyRecord | null;
  recorded_journeys: JourneyRecord[];
  active_analysis: ReplayAnalysis | null;
  visualization_mode: 'live' | 'analysis' | 'comparison';
  replay_speed: number; // 1x = real time
}

class ShadowReplayEngine {
  private state: ShadowReplayState;
  private listeners: Array<(state: ShadowReplayState) => void> = [];
  private recordingInterval: number | null = null;
  private readonly RECORDING_INTERVAL_MS = 2000; // Record every 2 seconds
  private readonly MAX_STORED_JOURNEYS = 50;

  constructor() {
    this.state = {
      isRecording: false,
      current_journey: null,
      recorded_journeys: this.loadStoredJourneys(),
      active_analysis: null,
      visualization_mode: 'live',
      replay_speed: 1.0,
    };

    this.initializeReplayEngine();
  }

  private initializeReplayEngine(): void {
    console.log('Shadow Replay Engine V35 initialized');
    
    // Auto-start recording when navigation begins
    this.setupNavigationEventListeners();
    
    // Cleanup old journeys periodically
    setInterval(() => this.cleanupOldJourneys(), 60000); // Every minute
  }

  private setupNavigationEventListeners(): void {
    // Listen for navigation events to auto-start/stop recording
    window.addEventListener('navigation_started', (event: any) => {
      this.startJourneyRecording(event.detail?.algorithm || 'unknown');
    });

    window.addEventListener('navigation_ended', () => {
      this.stopJourneyRecording();
    });

    window.addEventListener('route_deviation', (event: any) => {
      this.recordDeviation(event.detail);
    });

    window.addEventListener('safety_event', (event: any) => {
      this.recordSafetyEvent(event.detail);
    });
  }

  // Journey Recording
  public startJourneyRecording(algorithm: string): void {
    if (this.state.isRecording) {
      this.stopJourneyRecording(); // Stop existing recording
    }

    const journeyId = `journey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.state.current_journey = {
      id: journeyId,
      start_time: Date.now(),
      end_time: 0,
      algorithm_used: algorithm,
      actual_path: [],
      total_distance: 0,
      total_time: 0,
      safety_events: [],
    };

    this.state.isRecording = true;

    // Start position recording
    this.recordingInterval = window.setInterval(() => {
      this.recordCurrentPosition();
    }, this.RECORDING_INTERVAL_MS);

    this.notifyListeners();
    console.log('Journey recording started:', journeyId, 'using', algorithm);
  }

  public stopJourneyRecording(): void {
    if (!this.state.isRecording || !this.state.current_journey) {
      return;
    }

    // Stop recording interval
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }

    // Finalize journey
    this.state.current_journey.end_time = Date.now();
    this.state.current_journey.total_time = 
      (this.state.current_journey.end_time - this.state.current_journey.start_time) / 1000;

    // Calculate total distance
    this.state.current_journey.total_distance = this.calculateTotalDistance(
      this.state.current_journey.actual_path
    );

    // Store journey
    this.state.recorded_journeys.unshift(this.state.current_journey);
    this.saveJourneyToStorage(this.state.current_journey);

    // Trigger analysis
    this.analyzeJourney(this.state.current_journey.id);

    this.state.isRecording = false;
    this.state.current_journey = null;

    this.notifyListeners();
    console.log('Journey recording completed');
  }

  private recordCurrentPosition(): void {
    if (!this.state.current_journey) return;

    try {
      // Try to get high-accuracy position from Device Location Engine
      const dle = (window as any).deviceLocationEngine;
      const location = dle?.getCurrentLocation();
      
      if (location?.position) {
        const timestamp = Date.now();
        const pathPoint: [number, number, number] = [
          location.position.lat,
          location.position.lon,
          timestamp
        ];

        this.state.current_journey.actual_path.push(pathPoint);
        
        // Limit path size to prevent memory issues
        if (this.state.current_journey.actual_path.length > 1000) {
          this.state.current_journey.actual_path.splice(0, 100); // Remove oldest 100 points
        }
      } else {
        // Fallback to geolocation API
        navigator.geolocation.getCurrentPosition((pos) => {
          if (!this.state.current_journey) return;
          
          const timestamp = Date.now();
          const pathPoint: [number, number, number] = [
            pos.coords.latitude,
            pos.coords.longitude,
            timestamp
          ];

          this.state.current_journey.actual_path.push(pathPoint);
        }, undefined, { enableHighAccuracy: true, maximumAge: 1000 });
      }
    } catch (error) {
      console.warn('Failed to record position for shadow replay:', error);
    }
  }

  private recordDeviation(deviationData: any): void {
    if (!this.state.current_journey) return;

    const deviation: DeviationEvent = {
      timestamp: Date.now(),
      location: deviationData.location || [0, 0],
      distance_from_ideal: deviationData.distance || 0,
      deviation_type: deviationData.type || 'minor_detour',
      time_cost: deviationData.timeCost || 0,
      reason: deviationData.reason,
    };

    if (!this.state.current_journey.deviations) {
      this.state.current_journey.deviations = [];
    }

    this.state.current_journey.deviations.push(deviation);
    this.notifyListeners();
  }

  private recordSafetyEvent(eventData: any): void {
    if (!this.state.current_journey) return;

    const safetyEvent: SafetyEvent = {
      timestamp: Date.now(),
      location: eventData.location || [0, 0],
      event_type: eventData.type || 'ambient_mode_trigger',
      algorithm_response: eventData.response || 'unknown',
      safety_boost: eventData.boost || 1.0,
    };

    this.state.current_journey.safety_events.push(safetyEvent);
    this.notifyListeners();
  }

  // Journey Analysis
  public async analyzeJourney(journeyId: string): Promise<ReplayAnalysis | null> {
    const journey = this.state.recorded_journeys.find(j => j.id === journeyId);
    if (!journey) {
      console.error('Journey not found for analysis:', journeyId);
      return null;
    }

    try {
      // Request ideal path from backend
      const { fetchShadowReplay } = await import('./api');
      
      const replayRequest = {
        actual_path: journey.actual_path,
        algorithm_used: journey.algorithm_used,
        start_time: journey.start_time,
        end_time: journey.end_time,
      };

      const replayData = await fetchShadowReplay(replayRequest);
      
      // Update journey with backend analysis
      journey.ideal_path = replayData.ideal_path;
      journey.deviations = replayData.deviations.map(d => ({
        timestamp: d.timestamp,
        location: d.location,
        distance_from_ideal: d.distance,
        deviation_type: this.classifyDeviation(d.distance, d.reason),
        time_cost: d.distance * 0.05, // Rough estimate: 0.05s per meter
        reason: d.reason,
      }));

      // Generate comprehensive analysis
      const analysis = this.generateJourneyAnalysis(journey, replayData);
      this.state.active_analysis = analysis;

      this.notifyListeners();
      return analysis;
      
    } catch (error) {
      console.error('Journey analysis failed:', error);
      
      // Fallback: Generate basic analysis from local data
      const analysis = this.generateBasicAnalysis(journey);
      this.state.active_analysis = analysis;
      
      this.notifyListeners();
      return analysis;
    }
  }

  private generateJourneyAnalysis(journey: JourneyRecord, replayData: any): ReplayAnalysis {
    const deviations = journey.deviations || [];
    const safetyEvents = journey.safety_events || [];

    // Algorithm performance calculation
    const routeAdherence = this.calculateRouteAdherence(journey.actual_path, journey.ideal_path || []);
    const efficiency = this.calculateEfficiencyRating(journey, replayData.deviation_metrics);
    const safetyCompliance = this.calculateSafetyCompliance(safetyEvents);
    const overallScore = (routeAdherence * 0.4) + (efficiency * 0.4) + (safetyCompliance * 0.2);

    // Deviation analysis
    const worstDeviation = deviations.reduce((worst, dev) => 
      !worst || dev.distance_from_ideal > worst.distance_from_ideal ? dev : worst
    , null as DeviationEvent | null);

    const typeFrequency = deviations.reduce((freq, dev) => {
      freq[dev.deviation_type] = (freq[dev.deviation_type] || 0) + 1;
      return freq;
    }, {} as Record<string, number>);

    const mostCommonType = Object.entries(typeFrequency)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';

    // Algorithm recommendation
    const { suggestedAlgorithm, confidence, reasoning } = this.recommendBestAlgorithm(journey, deviations, safetyEvents);

    return {
      journey_id: journey.id,
      algorithm_performance: {
        route_adherence_score: Math.round(routeAdherence),
        efficiency_rating: Math.round(efficiency),
        safety_compliance: Math.round(safetyCompliance),
        overall_score: Math.round(overallScore),
      },
      deviation_summary: {
        total_deviations: deviations.length,
        worst_deviation: worstDeviation,
        most_common_type: mostCommonType,
        total_time_lost: deviations.reduce((sum, d) => sum + d.time_cost, 0),
        total_extra_distance: replayData.deviation_metrics?.total_distance_loss || 0,
      },
      algorithm_insights: {
        suggested_algorithm: suggestedAlgorithm,
        confidence,
        reasoning,
      },
      learning_data: this.extractLearningData(journey),
    };
  }

  private generateBasicAnalysis(journey: JourneyRecord): ReplayAnalysis {
    const deviations = journey.deviations || [];
    const safetyEvents = journey.safety_events || [];

    return {
      journey_id: journey.id,
      algorithm_performance: {
        route_adherence_score: 75, // Default reasonable score
        efficiency_rating: 70,
        safety_compliance: 85,
        overall_score: 75,
      },
      deviation_summary: {
        total_deviations: deviations.length,
        worst_deviation: deviations[0] || null,
        most_common_type: 'minor_detour',
        total_time_lost: deviations.reduce((sum, d) => sum + d.time_cost, 0),
        total_extra_distance: 0,
      },
      algorithm_insights: {
        suggested_algorithm: journey.algorithm_used,
        confidence: 60,
        reasoning: 'Backend analysis unavailable, using current algorithm',
      },
      learning_data: {
        route_preferences: [],
        avoidance_zones: [],
      },
    };
  }

  // Utility Methods
  private calculateRouteAdherence(actualPath: Array<[number, number, number]>, idealPath: Array<[number, number]>): number {
    if (idealPath.length === 0) return 75; // Default if no ideal path
    
    // Simplified adherence calculation
    const totalIdealDistance = this.calculatePathDistance(idealPath.map(p => [p[0], p[1], 0] as [number, number, number]));
    const actualDistance = this.calculateTotalDistance(actualPath);
    
    const ratio = totalIdealDistance > 0 ? Math.min(totalIdealDistance / actualDistance, 1) : 1;
    return Math.max(0, ratio * 100);
  }

  private calculateEfficiencyRating(journey: JourneyRecord, metrics: any): number {
    if (!metrics) return 70;
    
    const timeLossRatio = journey.total_time > 0 ? 
      Math.min(metrics.total_time_loss / journey.total_time, 0.5) : 0;
    
    return Math.max(0, 100 - (timeLossRatio * 200));
  }

  private calculateSafetyCompliance(safetyEvents: SafetyEvent[]): number {
    if (safetyEvents.length === 0) return 100; // No safety issues
    
    // Higher score for appropriate safety responses
    const appropriateResponses = safetyEvents.filter(e => 
      e.algorithm_response === 'HomeGuard' || e.safety_boost > 1.0
    ).length;
    
    return Math.min(100, (appropriateResponses / safetyEvents.length) * 100);
  }

  private recommendBestAlgorithm(journey: JourneyRecord, deviations: DeviationEvent[], safetyEvents: SafetyEvent[]): {
    suggestedAlgorithm: string;
    confidence: number;
    reasoning: string;
  } {
    const safetyEventCount = safetyEvents.length;
    const deviationCount = deviations.length;
    const totalTime = journey.total_time;

    // Simple heuristic-based recommendation
    if (safetyEventCount > 3) {
      return {
        suggestedAlgorithm: 'HomeGuard',
        confidence: 85,
        reasoning: 'Multiple safety events detected. HomeGuard provides better safety prioritization.',
      };
    }

    if (deviationCount > 5 || totalTime > 1800) { // 30+ minutes
      return {
        suggestedAlgorithm: 'PathfinderX',
        confidence: 75,
        reasoning: 'Complex route with multiple deviations. PathfinderX offers advanced pathfinding.',
      };
    }

    return {
      suggestedAlgorithm: 'ShadowPath',
      confidence: 70,
      reasoning: 'Standard route with minimal issues. ShadowPath provides good balance.',
    };
  }

  private extractLearningData(journey: JourneyRecord): ReplayAnalysis['learning_data'] {
    // Extract preferences and avoidances from journey data
    // This is simplified - full implementation would use ML
    
    const preferences: Array<{ segment: [number, number][]; preference_weight: number; reason: string }> = [];
    const avoidanceZones: Array<{ center: [number, number]; radius: number; reason: string }> = [];

    // Mark deviation areas as potential avoidance zones
    (journey.deviations || []).forEach(deviation => {
      if (deviation.distance_from_ideal > 50) { // Major deviations
        avoidanceZones.push({
          center: deviation.location,
          radius: 100,
          reason: `${deviation.deviation_type} caused ${deviation.time_cost}s delay`,
        });
      }
    });

    return { route_preferences: preferences, avoidance_zones: avoidanceZones };
  }

  private classifyDeviation(distance: number, reason: string): DeviationEvent['deviation_type'] {
    if (reason?.includes('wrong')) return 'wrong_turn';
    if (reason?.includes('back')) return 'backtrack';
    if (reason?.includes('stop')) return 'long_stop';
    if (distance > 100) return 'route_change';
    return 'minor_detour';
  }

  private calculateTotalDistance(path: Array<[number, number, number]>): number {
    return this.calculatePathDistance(path);
  }

  private calculatePathDistance(path: Array<[number, number, number]>): number {
    let totalDistance = 0;
    
    for (let i = 1; i < path.length; i++) {
      const [lat1, lon1] = path[i - 1];
      const [lat2, lon2] = path[i];
      
      // Haversine distance formula
      const R = 6371000; // Earth radius in meters
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      
      totalDistance += R * c;
    }
    
    return totalDistance;
  }

  // Storage Management
  private saveJourneyToStorage(journey: JourneyRecord): void {
    try {
      const stored = this.loadStoredJourneys();
      stored.unshift(journey);
      
      // Keep only recent journeys
      const limited = stored.slice(0, this.MAX_STORED_JOURNEYS);
      
      localStorage.setItem('pathfinder_shadow_replay_journeys', JSON.stringify(limited));
    } catch (error) {
      console.warn('Failed to save journey to storage:', error);
    }
  }

  private loadStoredJourneys(): JourneyRecord[] {
    try {
      const stored = localStorage.getItem('pathfinder_shadow_replay_journeys');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to load stored journeys:', error);
      return [];
    }
  }

  private cleanupOldJourneys(): void {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    this.state.recorded_journeys = this.state.recorded_journeys.filter(
      journey => journey.start_time > cutoffTime
    );
    
    // Update localStorage
    try {
      localStorage.setItem('pathfinder_shadow_replay_journeys', JSON.stringify(this.state.recorded_journeys));
    } catch (error) {
      console.warn('Failed to cleanup old journeys:', error);
    }
  }

  // Public API
  public getState(): ShadowReplayState {
    return { ...this.state };
  }

  public getJourney(journeyId: string): JourneyRecord | null {
    return this.state.recorded_journeys.find(j => j.id === journeyId) || null;
  }

  public deleteJourney(journeyId: string): void {
    this.state.recorded_journeys = this.state.recorded_journeys.filter(j => j.id !== journeyId);
    
    if (this.state.active_analysis?.journey_id === journeyId) {
      this.state.active_analysis = null;
    }
    
    this.notifyListeners();
  }

  public setVisualizationMode(mode: ShadowReplayState['visualization_mode']): void {
    this.state.visualization_mode = mode;
    this.notifyListeners();
  }

  public setReplaySpeed(speed: number): void {
    this.state.replay_speed = Math.max(0.1, Math.min(5.0, speed));
    this.notifyListeners();
  }

  public exportJourneyData(journeyId: string): string | null {
    const journey = this.getJourney(journeyId);
    if (!journey) return null;
    
    return JSON.stringify({
      journey,
      analysis: this.state.active_analysis?.journey_id === journeyId ? this.state.active_analysis : null,
      exported_at: Date.now(),
      version: 'PathFinder V35',
    }, null, 2);
  }

  public addListener(listener: (state: ShadowReplayState) => void): void {
    this.listeners.push(listener);
  }

  public removeListener(listener: (state: ShadowReplayState) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }
}

// Singleton instance
let shadowReplayEngineInstance: ShadowReplayEngine | null = null;

export function getShadowReplayEngine(): ShadowReplayEngine {
  if (!shadowReplayEngineInstance) {
    shadowReplayEngineInstance = new ShadowReplayEngine();
    // Expose to window for debugging and API integration
    (window as any).shadowReplayEngine = shadowReplayEngineInstance;
  }
  return shadowReplayEngineInstance;
}

export default getShadowReplayEngine;