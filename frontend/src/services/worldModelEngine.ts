/**
 * PATHFINDER V38 — WORLD MODEL ENGINE (WME)
 * 
 * Maintains a dynamic environmental state understanding the surroundings
 * beyond the map. Integrates weather, crowd density, hazards, and walking
 * conditions to make PathFinder context-aware and reactive to real-world
 * conditions.
 */

// =====================================================================
// INTERFACES
// =====================================================================

export interface WorldModelState {
  weather: WeatherConditions;
  crowd: CrowdConditions;
  hazards: HazardZone[];
  walkability: WalkabilityMetrics;
  activity: StreetActivityMetrics;
  environmental_scores: EnvironmentalScores;
  condition_confidence: number; // 0-1, overall data reliability
  last_update: number; // timestamp
}

export interface WeatherConditions {
  type: 'clear' | 'cloudy' | 'rain' | 'heavy_rain' | 'thunder' | 'snow' | 'fog' | 'heatwave';
  temperature: number; // Celsius
  feels_like: number; // Celsius with wind chill/heat index
  wind_speed: number; // m/s
  wind_direction: number; // degrees, 0=North
  humidity: number; // 0-100%
  visibility: number; // meters
  precipitation_probability: number; // 0-1
  weather_severity: 'none' | 'low' | 'moderate' | 'high' | 'extreme';
  confidence: number; // 0-1
}

export interface CrowdConditions {
  density: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
  density_value: number; // 0-1, 0=empty, 1=packed
  people_per_sqm: number; // estimated
  movement_speed_modifier: number; // 0.5-1.0, affects travel time
  congestion_areas: Array<{ lat: number; lon: number; radius: number; severity: number }>;
  confidence: number; // 0-1
}

export interface HazardZone {
  id: string;
  lat: number;
  lon: number;
  radius: number; // meters
  type: 'construction' | 'accident' | 'flood' | 'crime' | 'fire' | 'generic';
  severity: 'low' | 'moderate' | 'high' | 'critical';
  active: boolean;
  start_time: number;
  expected_end_time?: number;
  description?: string;
  avoidance_penalty: number; // 0-10, path cost multiplier
}

export interface WalkabilityMetrics {
  overall_score: number; // 0-1, 1=perfect conditions
  surface_quality: number; // 0-1, wet/slippery affects this
  lighting_quality: number; // 0-1, time-of-day adjusted
  safety_perception: number; // 0-1
  accessibility: number; // 0-1, wheelchair/mobility friendly
  environmental_friction: number; // 0-2, 1=normal, >1=harder to walk
  modifiers: {
    weather: number; // -0.5 to 0 (rain reduces walkability)
    crowd: number; // -0.3 to 0 (high density reduces walkability)
    time: number; // -0.2 to 0 (night reduces perceived safety)
    temperature: number; // -0.2 to 0 (extreme temps reduce comfort)
  };
}

export interface StreetActivityMetrics {
  level: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
  level_value: number; // 0-1
  peak_hours: boolean; // rush hour flag
  nighttime: boolean;
  weekend: boolean;
  local_events_nearby: boolean;
  activity_patterns: {
    commercial: number; // 0-1, shops/restaurants activity
    residential: number; // 0-1, residential area activity
    transit: number; // 0-1, public transit activity
  };
}

export interface EnvironmentalScores {
  overall_safety: number; // 0-1, composite safety from all factors
  exploration_favorability: number; // 0-1, good conditions for exploring
  route_confidence: number; // 0-1, reliability of navigation
  emergency_urgency: number; // 0-1, need for immediate safe shelter
  time_pressure: number; // 0-1, weather/hazards creating urgency
}

export interface WorldModelConfiguration {
  update_interval_ms: number; // how often to refresh world state
  weather_api_enabled: boolean;
  crowd_detection_enabled: boolean;
  hazard_detection_enabled: boolean;
  activity_detection_enabled: boolean;
  auto_adjust_routing: boolean; // auto-apply environmental adjustments
  emergency_threshold: number; // 0-1, trigger urgent actions
}

export interface EnvironmentalAdjustments {
  shadowpath_adjustments: {
    environmental_friction: number; // multiply node costs
    eta_multiplier: number; // adjust estimated time
    prefer_covered_routes: boolean; // prioritize indoor/covered paths
    wind_resistance: number; // 0-1, affects speed calculation
  };
  homeguard_adjustments: {
    safety_boost: number; // 1.0-3.0, increase safety priority
    hazard_avoidance: number; // 0-10, path cost penalty
    emergency_mode: boolean; // urgent safe return
    shelter_priority: boolean; // prioritize buildings/covered areas
  };
  pathfinderx_adjustments: {
    exploration_radius_modifier: number; // 0.3-1.5
    walkability_weight: number; // 0-1, how much walkability affects expansion
    avoid_hazard_zones: boolean;
    prefer_active_areas: boolean; // explore toward activity
  };
}

// =====================================================================
// WORLD MODEL ENGINE
// =====================================================================

export class WorldModelEngine {
  private static instance: WorldModelEngine;

  private config: WorldModelConfiguration = {
    update_interval_ms: 300000, // 5 minutes
    weather_api_enabled: true,
    crowd_detection_enabled: true,
    hazard_detection_enabled: true,
    activity_detection_enabled: true,
    auto_adjust_routing: true,
    emergency_threshold: 0.8,
  };

  private currentState: WorldModelState = {
    weather: this.getDefaultWeather(),
    crowd: this.getDefaultCrowd(),
    hazards: [],
    walkability: this.getDefaultWalkability(),
    activity: this.getDefaultActivity(),
    environmental_scores: this.getDefaultScores(),
    condition_confidence: 0.5,
    last_update: 0,
  };

  private updateInterval: number | null = null;
  private isRunning = false;
  private listeners: Array<(state: WorldModelState) => void> = [];

  // External API keys (would be loaded from config in production)
  private weatherAPIKey: string | null = null;

  private constructor() {}

  static getInstance(): WorldModelEngine {
    if (!WorldModelEngine.instance) {
      WorldModelEngine.instance = new WorldModelEngine();
    }
    return WorldModelEngine.instance;
  }

  // =====================================================================
  // LIFECYCLE
  // =====================================================================

  start(): void {
    if (this.isRunning) {
      console.warn('[WME] Already running');
      return;
    }

    console.log('[WME] Starting World Model Engine');
    this.isRunning = true;

    // Initial update
    this.updateWorldState();

    // Start periodic updates
    this.updateInterval = window.setInterval(() => {
      this.updateWorldState();
    }, this.config.update_interval_ms);
  }

  stop(): void {
    if (!this.isRunning) return;

    console.log('[WME] Stopping World Model Engine');
    this.isRunning = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // =====================================================================
  // WORLD STATE UPDATE
  // =====================================================================

  private async updateWorldState(): Promise<void> {
    const startTime = Date.now();
    console.log('[WME] Updating world state...');

    try {
      // Gather all environmental data in parallel
      const [weather, crowd, hazards, activity] = await Promise.all([
        this.fetchWeatherData(),
        this.detectCrowdConditions(),
        this.detectHazards(),
        this.analyzeStreetActivity(),
      ]);

      // Update state
      this.currentState.weather = weather;
      this.currentState.crowd = crowd;
      this.currentState.hazards = hazards;
      this.currentState.activity = activity;

      // Recalculate walkability based on new conditions
      this.currentState.walkability = this.calculateWalkability(weather, crowd, activity);

      // Recalculate environmental scores
      this.currentState.environmental_scores = this.calculateEnvironmentalScores();

      // Calculate overall confidence
      this.currentState.condition_confidence = this.calculateOverallConfidence();

      this.currentState.last_update = Date.now();

      const duration = Date.now() - startTime;
      console.log(`[WME] World state updated in ${duration}ms`);

      // Notify listeners
      this.notifyListeners(this.currentState);

      // Check for emergency conditions
      this.checkEmergencyConditions();

    } catch (error) {
      console.error('[WME] Failed to update world state:', error);
    }
  }

  // =====================================================================
  // WEATHER DATA FETCHING
  // =====================================================================

  private async fetchWeatherData(): Promise<WeatherConditions> {
    if (!this.config.weather_api_enabled) {
      return this.getDefaultWeather();
    }

    try {
      // Get current position
      const position = await this.getCurrentPosition();
      if (!position) {
        return this.getDefaultWeather();
      }

      // In production, this would call a real weather API (OpenWeatherMap, etc.)
      // For now, return mock data with some variability
      const weather = this.generateMockWeather(position.lat, position.lon);
      
      return weather;
    } catch (error) {
      console.error('[WME] Weather fetch failed:', error);
      return this.getDefaultWeather();
    }
  }

  private generateMockWeather(lat: number, lon: number): WeatherConditions {
    // Mock weather generation (would be real API call in production)
    const hour = new Date().getHours();
    const isNight = hour < 6 || hour > 20;
    
    // Simulate some weather variability
    const weatherTypes: WeatherConditions['type'][] = ['clear', 'cloudy', 'rain', 'fog'];
    const randomWeather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
    
    let severity: WeatherConditions['weather_severity'] = 'none';
    if (randomWeather === 'rain') severity = 'low';
    if (randomWeather === 'thunder') severity = 'high';
    
    return {
      type: randomWeather,
      temperature: 15 + Math.random() * 15, // 15-30°C
      feels_like: 15 + Math.random() * 15,
      wind_speed: Math.random() * 10, // 0-10 m/s
      wind_direction: Math.random() * 360,
      humidity: 40 + Math.random() * 40, // 40-80%
      visibility: randomWeather === 'fog' ? 100 : 10000,
      precipitation_probability: randomWeather === 'rain' ? 0.8 : 0.1,
      weather_severity: severity,
      confidence: 0.85,
    };
  }

  // =====================================================================
  // CROWD DETECTION
  // =====================================================================

  private async detectCrowdConditions(): Promise<CrowdConditions> {
    if (!this.config.crowd_detection_enabled) {
      return this.getDefaultCrowd();
    }

    try {
      const position = await this.getCurrentPosition();
      if (!position) {
        return this.getDefaultCrowd();
      }

      // Analyze time-based crowd patterns
      const hour = new Date().getHours();
      const dayOfWeek = new Date().getDay();
      
      let densityValue = 0.3; // default moderate-low
      
      // Rush hour logic
      if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
        densityValue = 0.7; // high during rush hour
      }
      
      // Night time
      if (hour < 6 || hour > 22) {
        densityValue = 0.1; // very low at night
      }
      
      // Weekend adjustment
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        densityValue *= 0.7; // lower on weekends
      }

      const density = this.densityValueToCategory(densityValue);
      const movementSpeedModifier = 1.0 - (densityValue * 0.3); // max 30% slowdown

      return {
        density,
        density_value: densityValue,
        people_per_sqm: densityValue * 2.0, // 0-2 people per sqm
        movement_speed_modifier: movementSpeedModifier,
        congestion_areas: [], // would be populated from map data
        confidence: 0.7,
      };
    } catch (error) {
      console.error('[WME] Crowd detection failed:', error);
      return this.getDefaultCrowd();
    }
  }

  private densityValueToCategory(value: number): CrowdConditions['density'] {
    if (value < 0.2) return 'very_low';
    if (value < 0.4) return 'low';
    if (value < 0.6) return 'moderate';
    if (value < 0.8) return 'high';
    return 'very_high';
  }

  // =====================================================================
  // HAZARD DETECTION
  // =====================================================================

  private async detectHazards(): Promise<HazardZone[]> {
    if (!this.config.hazard_detection_enabled) {
      return [];
    }

    try {
      // In production, this would query:
      // - Local hazard database
      // - Real-time incident APIs
      // - User-reported hazards
      // - Construction zone databases
      
      // For now, return mock hazards (empty or simulated)
      const hazards: HazardZone[] = [];
      
      // Simulate occasional hazard detection
      if (Math.random() < 0.1) {
        const position = await this.getCurrentPosition();
        if (position) {
          hazards.push({
            id: `hazard_${Date.now()}`,
            lat: position.lat + (Math.random() - 0.5) * 0.01,
            lon: position.lon + (Math.random() - 0.5) * 0.01,
            radius: 50 + Math.random() * 100,
            type: 'construction',
            severity: 'moderate',
            active: true,
            start_time: Date.now(),
            avoidance_penalty: 5.0,
          });
        }
      }
      
      return hazards;
    } catch (error) {
      console.error('[WME] Hazard detection failed:', error);
      return [];
    }
  }

  // =====================================================================
  // STREET ACTIVITY ANALYSIS
  // =====================================================================

  private async analyzeStreetActivity(): Promise<StreetActivityMetrics> {
    if (!this.config.activity_detection_enabled) {
      return this.getDefaultActivity();
    }

    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isNighttime = hour < 6 || hour > 22;
    const isPeakHours = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);

    // Calculate activity level
    let levelValue = 0.5; // default moderate

    if (isNighttime) {
      levelValue = 0.2; // very low at night
    } else if (isPeakHours) {
      levelValue = 0.8; // high during peak hours
    } else if (hour >= 10 && hour <= 16) {
      levelValue = 0.6; // moderate during day
    }

    // Weekend adjustment
    if (isWeekend && !isNighttime) {
      levelValue = 0.7; // higher leisure activity on weekends
    }

    const level = this.activityValueToCategory(levelValue);

    return {
      level,
      level_value: levelValue,
      peak_hours: isPeakHours,
      nighttime: isNighttime,
      weekend: isWeekend,
      local_events_nearby: false, // would query event APIs
      activity_patterns: {
        commercial: isPeakHours ? 0.8 : (isNighttime ? 0.1 : 0.5),
        residential: isNighttime ? 0.7 : 0.4,
        transit: isPeakHours ? 0.9 : (isNighttime ? 0.2 : 0.5),
      },
    };
  }

  private activityValueToCategory(value: number): StreetActivityMetrics['level'] {
    if (value < 0.2) return 'very_low';
    if (value < 0.4) return 'low';
    if (value < 0.6) return 'moderate';
    if (value < 0.8) return 'high';
    return 'very_high';
  }

  // =====================================================================
  // WALKABILITY CALCULATION
  // =====================================================================

  private calculateWalkability(
    weather: WeatherConditions,
    crowd: CrowdConditions,
    activity: StreetActivityMetrics
  ): WalkabilityMetrics {
    // Base scores
    let overallScore = 1.0;
    let surfaceQuality = 1.0;
    let lightingQuality = activity.nighttime ? 0.6 : 1.0;
    let safetyPerception = activity.nighttime ? 0.7 : 0.9;
    let accessibility = 0.9; // assume generally accessible

    // Weather modifiers
    const weatherMod = this.calculateWeatherModifier(weather);
    overallScore += weatherMod;
    surfaceQuality += weatherMod * 0.5; // wet surfaces

    // Crowd modifiers
    const crowdMod = this.calculateCrowdModifier(crowd);
    overallScore += crowdMod;

    // Time modifiers
    const timeMod = activity.nighttime ? -0.2 : 0;
    safetyPerception += timeMod;

    // Temperature modifiers
    const tempMod = this.calculateTemperatureModifier(weather.temperature);
    overallScore += tempMod;

    // Environmental friction (1.0 = normal, >1.0 = harder to walk)
    let environmentalFriction = 1.0;
    if (weather.type === 'rain') environmentalFriction = 1.2;
    if (weather.type === 'heavy_rain') environmentalFriction = 1.5;
    if (weather.type === 'snow') environmentalFriction = 1.4;
    if (weather.type === 'fog') environmentalFriction = 1.1;
    if (crowd.density_value > 0.7) environmentalFriction += 0.2;

    // Clamp scores to [0, 1]
    overallScore = Math.max(0, Math.min(1, overallScore));
    surfaceQuality = Math.max(0, Math.min(1, surfaceQuality));
    lightingQuality = Math.max(0, Math.min(1, lightingQuality));
    safetyPerception = Math.max(0, Math.min(1, safetyPerception));

    return {
      overall_score: overallScore,
      surface_quality: surfaceQuality,
      lighting_quality: lightingQuality,
      safety_perception: safetyPerception,
      accessibility,
      environmental_friction: environmentalFriction,
      modifiers: {
        weather: weatherMod,
        crowd: crowdMod,
        time: timeMod,
        temperature: tempMod,
      },
    };
  }

  private calculateWeatherModifier(weather: WeatherConditions): number {
    switch (weather.type) {
      case 'clear': return 0;
      case 'cloudy': return -0.05;
      case 'rain': return -0.2;
      case 'heavy_rain': return -0.4;
      case 'thunder': return -0.5;
      case 'snow': return -0.3;
      case 'fog': return -0.2;
      case 'heatwave': return -0.3;
      default: return 0;
    }
  }

  private calculateCrowdModifier(crowd: CrowdConditions): number {
    return -crowd.density_value * 0.3; // max -0.3 for very high density
  }

  private calculateTemperatureModifier(temp: number): number {
    // Optimal: 15-25°C
    if (temp >= 15 && temp <= 25) return 0;
    if (temp < 5 || temp > 35) return -0.2; // extreme temps
    if (temp < 10 || temp > 30) return -0.1; // uncomfortable
    return 0;
  }

  // =====================================================================
  // ENVIRONMENTAL SCORES
  // =====================================================================

  private calculateEnvironmentalScores(): EnvironmentalScores {
    const { weather, crowd, hazards, walkability, activity } = this.currentState;

    // Overall safety (0-1)
    let overallSafety = walkability.safety_perception;
    if (weather.weather_severity === 'high') overallSafety *= 0.7;
    if (weather.weather_severity === 'extreme') overallSafety *= 0.5;
    if (hazards.length > 0) overallSafety *= 0.8;
    if (activity.nighttime && activity.level_value < 0.3) overallSafety *= 0.9;
    overallSafety = Math.max(0, Math.min(1, overallSafety));

    // Exploration favorability (0-1)
    let explorationFavorability = walkability.overall_score;
    if (weather.type === 'clear') explorationFavorability *= 1.1;
    if (crowd.density === 'very_high') explorationFavorability *= 0.7;
    if (activity.level_value > 0.6) explorationFavorability *= 1.1; // interesting to explore
    explorationFavorability = Math.max(0, Math.min(1, explorationFavorability));

    // Route confidence (0-1)
    let routeConfidence = 0.9;
    if (weather.type === 'fog') routeConfidence = 0.6;
    if (weather.visibility < 500) routeConfidence = 0.5;
    if (crowd.density === 'very_high') routeConfidence *= 0.9;
    routeConfidence = Math.max(0, Math.min(1, routeConfidence));

    // Emergency urgency (0-1)
    let emergencyUrgency = 0;
    if (weather.weather_severity === 'high') emergencyUrgency = 0.6;
    if (weather.weather_severity === 'extreme') emergencyUrgency = 0.9;
    if (weather.type === 'thunder') emergencyUrgency = Math.max(emergencyUrgency, 0.8);
    if (hazards.some(h => h.severity === 'critical')) emergencyUrgency = Math.max(emergencyUrgency, 0.9);

    // Time pressure (0-1)
    let timePressure = emergencyUrgency * 0.7;
    if (weather.precipitation_probability > 0.7 && weather.type === 'clear') {
      timePressure = Math.max(timePressure, 0.5); // rain coming soon
    }

    return {
      overall_safety: overallSafety,
      exploration_favorability: explorationFavorability,
      route_confidence: routeConfidence,
      emergency_urgency: emergencyUrgency,
      time_pressure: timePressure,
    };
  }

  private calculateOverallConfidence(): number {
    const { weather, crowd, walkability } = this.currentState;
    
    // Average of all confidence scores
    const confidences = [
      weather.confidence,
      crowd.confidence,
    ];
    
    return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  }

  // =====================================================================
  // ENVIRONMENTAL ADJUSTMENTS
  // =====================================================================

  getEnvironmentalAdjustments(): EnvironmentalAdjustments {
    const { weather, crowd, hazards, walkability, environmental_scores } = this.currentState;

    return {
      shadowpath_adjustments: {
        environmental_friction: walkability.environmental_friction,
        eta_multiplier: 1.0 / crowd.movement_speed_modifier, // slower in crowds
        prefer_covered_routes: weather.type === 'rain' || weather.type === 'thunder',
        wind_resistance: Math.min(1, weather.wind_speed / 20), // 0-1
      },
      homeguard_adjustments: {
        safety_boost: this.calculateSafetyBoost(weather, environmental_scores),
        hazard_avoidance: this.calculateHazardAvoidance(hazards),
        emergency_mode: environmental_scores.emergency_urgency > this.config.emergency_threshold,
        shelter_priority: weather.type === 'thunder' || weather.weather_severity === 'extreme',
      },
      pathfinderx_adjustments: {
        exploration_radius_modifier: this.calculateExplorationModifier(weather, crowd, walkability),
        walkability_weight: walkability.overall_score,
        avoid_hazard_zones: hazards.length > 0,
        prefer_active_areas: environmental_scores.exploration_favorability > 0.6,
      },
    };
  }

  private calculateSafetyBoost(weather: WeatherConditions, scores: EnvironmentalScores): number {
    let boost = 1.0;
    
    if (weather.type === 'rain') boost = 1.3;
    if (weather.type === 'heavy_rain') boost = 1.6;
    if (weather.type === 'thunder') boost = 2.5;
    if (weather.weather_severity === 'extreme') boost = 3.0;
    if (scores.emergency_urgency > 0.7) boost = Math.max(boost, 2.0);
    
    return boost;
  }

  private calculateHazardAvoidance(hazards: HazardZone[]): number {
    if (hazards.length === 0) return 0;
    
    const maxPenalty = Math.max(...hazards.map(h => h.avoidance_penalty));
    return maxPenalty;
  }

  private calculateExplorationModifier(
    weather: WeatherConditions,
    crowd: CrowdConditions,
    walkability: WalkabilityMetrics
  ): number {
    let modifier = 1.0;
    
    // Weather effects
    if (weather.type === 'rain') modifier = 0.7;
    if (weather.type === 'thunder') modifier = 0.3;
    if (weather.type === 'clear') modifier = 1.2;
    
    // Crowd effects
    if (crowd.density_value > 0.7) modifier *= 0.7;
    if (crowd.density_value < 0.3) modifier *= 1.2;
    
    // Walkability effects
    modifier *= (0.5 + walkability.overall_score * 0.5); // 0.5-1.0 range
    
    return Math.max(0.3, Math.min(1.5, modifier));
  }

  // =====================================================================
  // EMERGENCY CHECKS
  // =====================================================================

  private checkEmergencyConditions(): void {
    const { environmental_scores } = this.currentState;
    
    if (environmental_scores.emergency_urgency > this.config.emergency_threshold) {
      console.warn('[WME] EMERGENCY CONDITIONS DETECTED!');
      console.warn('[WME] Emergency urgency:', environmental_scores.emergency_urgency);
      
      // Trigger emergency notifications
      this.triggerEmergencyAlert();
    }
  }

  private triggerEmergencyAlert(): void {
    // Would trigger UI alerts, auto-activate HomeGuard, etc.
    console.log('[WME] Triggering emergency alert...');
    
    // Notify listeners of critical state
    this.notifyListeners(this.currentState);
  }

  // =====================================================================
  // HELPER METHODS
  // =====================================================================

  private async getCurrentPosition(): Promise<{ lat: number; lon: number } | null> {
    // Try to get position from sensor fusion layer
    try {
      const sfl = (window as any).sensorFusionLayer;
      const fusedPosition = sfl?.getFusedPosition();
      if (fusedPosition) {
        return {
          lat: fusedPosition.latitude || fusedPosition.lat,
          lon: fusedPosition.longitude || fusedPosition.lon,
        };
      }
    } catch (error) {
      console.error('[WME] Failed to get fused position:', error);
    }
    
    // Fallback to real GPS location
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.warn('[WME] Geolocation not supported');
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('[WME] Got real GPS position:', position.coords.latitude, position.coords.longitude);
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('[WME] Geolocation error:', error.message);
          resolve(null);
        },
        { 
          enableHighAccuracy: true, 
          timeout: 5000, 
          maximumAge: 0 
        }
      );
    });
  }

  // =====================================================================
  // DEFAULT VALUES
  // =====================================================================

  private getDefaultWeather(): WeatherConditions {
    return {
      type: 'clear',
      temperature: 20,
      feels_like: 20,
      wind_speed: 2,
      wind_direction: 0,
      humidity: 50,
      visibility: 10000,
      precipitation_probability: 0,
      weather_severity: 'none',
      confidence: 0.5,
    };
  }

  private getDefaultCrowd(): CrowdConditions {
    return {
      density: 'moderate',
      density_value: 0.5,
      people_per_sqm: 1.0,
      movement_speed_modifier: 0.85,
      congestion_areas: [],
      confidence: 0.5,
    };
  }

  private getDefaultActivity(): StreetActivityMetrics {
    return {
      level: 'moderate',
      level_value: 0.5,
      peak_hours: false,
      nighttime: false,
      weekend: false,
      local_events_nearby: false,
      activity_patterns: {
        commercial: 0.5,
        residential: 0.5,
        transit: 0.5,
      },
    };
  }

  private getDefaultWalkability(): WalkabilityMetrics {
    return {
      overall_score: 0.8,
      surface_quality: 0.9,
      lighting_quality: 0.8,
      safety_perception: 0.8,
      accessibility: 0.9,
      environmental_friction: 1.0,
      modifiers: {
        weather: 0,
        crowd: 0,
        time: 0,
        temperature: 0,
      },
    };
  }

  private getDefaultScores(): EnvironmentalScores {
    return {
      overall_safety: 0.8,
      exploration_favorability: 0.7,
      route_confidence: 0.9,
      emergency_urgency: 0,
      time_pressure: 0,
    };
  }

  // =====================================================================
  // PUBLIC GETTERS
  // =====================================================================

  getCurrentState(): WorldModelState {
    return { ...this.currentState };
  }

  getWeather(): WeatherConditions {
    return { ...this.currentState.weather };
  }

  getCrowdConditions(): CrowdConditions {
    return { ...this.currentState.crowd };
  }

  getHazards(): HazardZone[] {
    return [...this.currentState.hazards];
  }

  getWalkability(): WalkabilityMetrics {
    return { ...this.currentState.walkability };
  }

  getActivity(): StreetActivityMetrics {
    return { ...this.currentState.activity };
  }

  getEnvironmentalScores(): EnvironmentalScores {
    return { ...this.currentState.environmental_scores };
  }

  getConfiguration(): WorldModelConfiguration {
    return { ...this.config };
  }

  updateConfiguration(updates: Partial<WorldModelConfiguration>): void {
    this.config = { ...this.config, ...updates };
    
    // Restart update interval if changed
    if (updates.update_interval_ms && this.isRunning) {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
      }
      this.updateInterval = window.setInterval(() => {
        this.updateWorldState();
      }, this.config.update_interval_ms);
    }
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  // =====================================================================
  // LISTENERS
  // =====================================================================

  addListener(callback: (state: WorldModelState) => void): void {
    this.listeners.push(callback);
  }

  removeListener(callback: (state: WorldModelState) => void): void {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  private notifyListeners(state: WorldModelState): void {
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[WME] Error in listener:', error);
      }
    });
  }

  // =====================================================================
  // MANUAL REFRESH
  // =====================================================================

  async refresh(): Promise<void> {
    console.log('[WME] Manual refresh requested');
    await this.updateWorldState();
  }
}

// =====================================================================
// SINGLETON EXPORT
// =====================================================================

export const worldModelEngine = WorldModelEngine.getInstance();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).worldModelEngine = worldModelEngine;
}
