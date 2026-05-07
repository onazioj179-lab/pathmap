// PathFinder V36 - Sensor Fusion Layer (SFL)
// Multi-source environmental reality engine combining GPS, accelerometer, gyroscope,
// compass, motion patterns, and calibration history for reliable positioning

export type MotionState = 'stationary' | 'walking' | 'jogging' | 'running' | 'unknown';

export interface SensorData {
  timestamp: number;
  gps: {
    lat: number;
    lon: number;
    accuracy: number;
    altitude?: number;
    altitudeAccuracy?: number;
    heading?: number;
    speed?: number;
  };
  accelerometer?: {
    x: number;
    y: number;
    z: number;
    magnitude: number;
  };
  gyroscope?: {
    alpha: number; // rotation around z-axis
    beta: number;  // rotation around x-axis
    gamma: number; // rotation around y-axis
  };
  compass?: {
    heading: number;
    accuracy: number;
  };
  ambientLight?: number;
}

export interface FusedPosition {
  lat: number;
  lon: number;
  heading: number;
  speed: number;
  motion_state: MotionState;
  confidence_level: number; // 0-1
  altitude?: number;
  vertical_accuracy?: number;
}

export interface SensorProfile {
  gps_weight: number;
  heading_weight: number;
  motion_weight: number;
  familiarity_weight: number;
  accelerometer_available: boolean;
  gyroscope_available: boolean;
  compass_available: boolean;
  ambient_light_available: boolean;
}

export interface MovementPattern {
  sudden_turn_detected: boolean;
  wrong_direction_detected: boolean;
  device_shake_detected: boolean;
  stop_and_start_detected: boolean;
  erratic_movement: boolean;
  direction_changes_per_minute: number;
}

export interface SensorFusionState {
  isActive: boolean;
  fused_position: FusedPosition | null;
  sensor_profile: SensorProfile;
  movement_pattern: MovementPattern;
  sensor_health: {
    gps_quality: 'excellent' | 'good' | 'fair' | 'poor';
    heading_stability: number; // 0-1
    motion_consistency: number; // 0-1
    overall_confidence: number; // 0-1
  };
  raw_sensor_data: SensorData | null;
  calibration_offset: {
    lat_offset: number;
    lon_offset: number;
    heading_offset: number;
  };
}

class SensorFusionLayer {
  private state: SensorFusionState;
  private listeners: Array<(state: SensorFusionState) => void> = [];
  
  // Sensor history for pattern detection
  private sensorHistory: SensorData[] = [];
  private positionHistory: Array<{ lat: number; lon: number; timestamp: number }> = [];
  private headingHistory: number[] = [];
  private speedHistory: number[] = [];
  private accelerationHistory: number[] = [];
  
  // Sensor handles
  private gpsWatchId: number | null = null;
  private accelerometerInterval: number | null = null;
  private orientationInterval: number | null = null;
  private fusionInterval: number | null = null;
  
  // Configuration
  private readonly FUSION_UPDATE_INTERVAL_MS = 50; // 20Hz
  private readonly HISTORY_SIZE = 100;
  private readonly MOTION_DETECTION_WINDOW = 10; // Last 10 samples
  private readonly HEADING_SMOOTHING_FACTOR = 0.7;
  private readonly SPEED_SMOOTHING_FACTOR = 0.6;

  constructor() {
    this.state = {
      isActive: false,
      fused_position: null,
      sensor_profile: this.detectSensorCapabilities(),
      movement_pattern: this.getEmptyMovementPattern(),
      sensor_health: {
        gps_quality: 'fair',
        heading_stability: 0.5,
        motion_consistency: 0.5,
        overall_confidence: 0.5,
      },
      raw_sensor_data: null,
      calibration_offset: {
        lat_offset: 0,
        lon_offset: 0,
        heading_offset: 0,
      },
    };

    this.initializeSensorFusion();
  }

  private initializeSensorFusion(): void {
    console.log('Sensor Fusion Layer V36 initializing...');
    
    // Load calibration from storage
    this.loadCalibration();
    
    // Start sensor monitoring
    this.startSensorMonitoring();
    
    // Start fusion computation
    this.startFusionComputation();
    
    console.log('Sensor Fusion Layer V36 initialized', this.state.sensor_profile);
  }

  private detectSensorCapabilities(): SensorProfile {
    const profile: SensorProfile = {
      gps_weight: 0.5,
      heading_weight: 0.2,
      motion_weight: 0.2,
      familiarity_weight: 0.1,
      accelerometer_available: false,
      gyroscope_available: false,
      compass_available: false,
      ambient_light_available: false,
    };

    // Check for accelerometer/gyroscope
    if ('DeviceMotionEvent' in window) {
      profile.accelerometer_available = true;
      profile.gyroscope_available = true;
    }

    // Check for compass (device orientation)
    if ('DeviceOrientationEvent' in window) {
      profile.compass_available = true;
    }

    // Check for ambient light sensor
    if ('AmbientLightSensor' in window) {
      profile.ambient_light_available = true;
    }

    return profile;
  }

  private getEmptyMovementPattern(): MovementPattern {
    return {
      sudden_turn_detected: false,
      wrong_direction_detected: false,
      device_shake_detected: false,
      stop_and_start_detected: false,
      erratic_movement: false,
      direction_changes_per_minute: 0,
    };
  }

  // Sensor Monitoring
  private startSensorMonitoring(): void {
    // V39: Use Device Location Service instead of direct GPS monitoring
    const deviceLocationService = (window as any).deviceLocationService;
    if (deviceLocationService) {
      deviceLocationService.addLocationListener((location: any) => {
        // Convert device location to GPS data format
        const mockPosition = {
          coords: {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            altitude: location.altitude,
            altitudeAccuracy: location.altitudeAccuracy,
            heading: location.heading,
            speed: location.speed,
          },
          timestamp: location.timestamp,
        };
        this.updateGPSData(mockPosition as GeolocationPosition);
      });
      console.log('[SFL] Integrated with Device Location Service');
    } else {
      // Fallback: GPS monitoring
      this.startGPSMonitoring();
    }
    
    // Accelerometer monitoring
    if (this.state.sensor_profile.accelerometer_available) {
      this.startAccelerometerMonitoring();
    }
    
    // Orientation/Compass monitoring
    if (this.state.sensor_profile.compass_available) {
      this.startOrientationMonitoring();
    }
    
    // Ambient light monitoring
    if (this.state.sensor_profile.ambient_light_available) {
      this.startAmbientLightMonitoring();
    }

    this.state.isActive = true;
    this.notifyListeners();
  }

  private startGPSMonitoring(): void {
    if (this.gpsWatchId !== null) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
    }

    this.gpsWatchId = navigator.geolocation.watchPosition(
      (position) => {
        this.updateGPSData(position);
      },
      (error) => {
        console.warn('GPS monitoring error:', error);
        this.state.sensor_health.gps_quality = 'poor';
        this.notifyListeners();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 100,
        timeout: 5000,
      }
    );
  }

  private updateGPSData(position: GeolocationPosition): void {
    const gpsData = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude || undefined,
      altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
      heading: position.coords.heading || undefined,
      speed: position.coords.speed || undefined,
    };

    // Update raw sensor data
    if (!this.state.raw_sensor_data) {
      this.state.raw_sensor_data = {
        timestamp: Date.now(),
        gps: gpsData,
      };
    } else {
      this.state.raw_sensor_data.timestamp = Date.now();
      this.state.raw_sensor_data.gps = gpsData;
    }

    // Add to history
    this.sensorHistory.push({ ...this.state.raw_sensor_data });
    if (this.sensorHistory.length > this.HISTORY_SIZE) {
      this.sensorHistory.shift();
    }

    this.positionHistory.push({
      lat: gpsData.lat,
      lon: gpsData.lon,
      timestamp: Date.now(),
    });
    if (this.positionHistory.length > this.HISTORY_SIZE) {
      this.positionHistory.shift();
    }

    // Update GPS quality
    this.updateGPSQuality(gpsData.accuracy);
  }

  private updateGPSQuality(accuracy: number): void {
    if (accuracy < 10) {
      this.state.sensor_health.gps_quality = 'excellent';
    } else if (accuracy < 30) {
      this.state.sensor_health.gps_quality = 'good';
    } else if (accuracy < 100) {
      this.state.sensor_health.gps_quality = 'fair';
    } else {
      this.state.sensor_health.gps_quality = 'poor';
    }
  }

  private startAccelerometerMonitoring(): void {
    window.addEventListener('devicemotion', (event) => {
      if (event.acceleration) {
        const accel = event.acceleration;
        const x = accel.x || 0;
        const y = accel.y || 0;
        const z = accel.z || 0;
        const magnitude = Math.sqrt(x * x + y * y + z * z);

        if (!this.state.raw_sensor_data) {
          this.state.raw_sensor_data = {
            timestamp: Date.now(),
            gps: { lat: 0, lon: 0, accuracy: 999 },
          };
        }

        this.state.raw_sensor_data.accelerometer = { x, y, z, magnitude };
        
        this.accelerationHistory.push(magnitude);
        if (this.accelerationHistory.length > this.HISTORY_SIZE) {
          this.accelerationHistory.shift();
        }
      }
    });
  }

  private startOrientationMonitoring(): void {
    window.addEventListener('deviceorientation', (event) => {
      const alpha = event.alpha || 0;
      const beta = event.beta || 0;
      const gamma = event.gamma || 0;

      if (!this.state.raw_sensor_data) {
        this.state.raw_sensor_data = {
          timestamp: Date.now(),
          gps: { lat: 0, lon: 0, accuracy: 999 },
        };
      }

      this.state.raw_sensor_data.gyroscope = { alpha, beta, gamma };

      // Extract compass heading from alpha
      const heading = alpha;
      const accuracy = this.calculateHeadingAccuracy(beta, gamma);

      this.state.raw_sensor_data.compass = { heading, accuracy };

      this.headingHistory.push(heading);
      if (this.headingHistory.length > this.HISTORY_SIZE) {
        this.headingHistory.shift();
      }

      this.updateHeadingStability();
    });
  }

  private calculateHeadingAccuracy(beta: number, gamma: number): number {
    // Heading is more accurate when device is held upright
    const tilt = Math.sqrt(beta * beta + gamma * gamma);
    const maxTilt = 90;
    return Math.max(0, 1 - (tilt / maxTilt));
  }

  private updateHeadingStability(): void {
    if (this.headingHistory.length < 10) {
      this.state.sensor_health.heading_stability = 0.5;
      return;
    }

    // Calculate variance in recent headings
    const recent = this.headingHistory.slice(-10);
    const mean = recent.reduce((sum, h) => sum + h, 0) / recent.length;
    const variance = recent.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0) / recent.length;
    const stdDev = Math.sqrt(variance);

    // Lower variance = higher stability
    this.state.sensor_health.heading_stability = Math.max(0, Math.min(1, 1 - (stdDev / 180)));
  }

  private startAmbientLightMonitoring(): void {
    try {
      const sensor = new (window as any).AmbientLightSensor();
      sensor.addEventListener('reading', () => {
        if (!this.state.raw_sensor_data) {
          this.state.raw_sensor_data = {
            timestamp: Date.now(),
            gps: { lat: 0, lon: 0, accuracy: 999 },
          };
        }
        this.state.raw_sensor_data.ambientLight = sensor.illuminance;
      });
      sensor.start();
    } catch (error) {
      console.warn('Ambient light sensor not available:', error);
      this.state.sensor_profile.ambient_light_available = false;
    }
  }

  // Sensor Fusion Computation
  private startFusionComputation(): void {
    this.fusionInterval = window.setInterval(() => {
      this.computeFusedPosition();
      this.detectMovementPatterns();
      this.updateOverallConfidence();
      this.notifyListeners();
    }, this.FUSION_UPDATE_INTERVAL_MS);
  }

  private computeFusedPosition(): void {
    const rawData = this.state.raw_sensor_data;
    if (!rawData || !rawData.gps) {
      return;
    }

    const profile = this.state.sensor_profile;
    
    // Start with GPS position
    let fusedLat = rawData.gps.lat + this.state.calibration_offset.lat_offset;
    let fusedLon = rawData.gps.lon + this.state.calibration_offset.lon_offset;
    
    // Apply familiarity-based correction
    const familiarityCorrection = this.getFamiliarityCorrection();
    if (familiarityCorrection) {
      fusedLat = fusedLat * (1 - profile.familiarity_weight) + familiarityCorrection.lat * profile.familiarity_weight;
      fusedLon = fusedLon * (1 - profile.familiarity_weight) + familiarityCorrection.lon * profile.familiarity_weight;
    }

    // Compute fused heading
    const fusedHeading = this.computeFusedHeading(rawData);
    
    // Compute fused speed
    const fusedSpeed = this.computeFusedSpeed(rawData);
    
    // Detect motion state
    const motionState = this.detectMotionState();
    
    // Calculate confidence level
    const confidence = this.calculatePositionConfidence();

    this.state.fused_position = {
      lat: fusedLat,
      lon: fusedLon,
      heading: fusedHeading,
      speed: fusedSpeed,
      motion_state: motionState,
      confidence_level: confidence,
      altitude: rawData.gps.altitude,
      vertical_accuracy: rawData.gps.altitudeAccuracy,
    };
  }

  private computeFusedHeading(rawData: SensorData): number {
    let heading = 0;
    let totalWeight = 0;

    // GPS heading (if available and moving)
    if (rawData.gps.heading !== undefined && rawData.gps.speed && rawData.gps.speed > 0.5) {
      heading += rawData.gps.heading * this.state.sensor_profile.gps_weight;
      totalWeight += this.state.sensor_profile.gps_weight;
    }

    // Compass heading
    if (rawData.compass) {
      const compassWeight = this.state.sensor_profile.heading_weight * rawData.compass.accuracy;
      heading += (rawData.compass.heading + this.state.calibration_offset.heading_offset) * compassWeight;
      totalWeight += compassWeight;
    }

    // Calculated heading from position history
    if (this.positionHistory.length >= 2) {
      const recent = this.positionHistory.slice(-2);
      const calculatedHeading = this.calculateBearing(
        recent[0].lat, recent[0].lon,
        recent[1].lat, recent[1].lon
      );
      heading += calculatedHeading * 0.2;
      totalWeight += 0.2;
    }

    const rawHeading = totalWeight > 0 ? heading / totalWeight : 0;
    
    // Apply smoothing
    if (this.headingHistory.length > 0) {
      const lastHeading = this.headingHistory[this.headingHistory.length - 1];
      return this.smoothAngle(lastHeading, rawHeading, this.HEADING_SMOOTHING_FACTOR);
    }

    return rawHeading;
  }

  private computeFusedSpeed(rawData: SensorData): number {
    let speed = 0;
    let totalWeight = 0;

    // GPS speed
    if (rawData.gps.speed !== undefined && rawData.gps.speed >= 0) {
      speed += rawData.gps.speed * 0.6;
      totalWeight += 0.6;
    }

    // Calculate speed from position history
    if (this.positionHistory.length >= 2) {
      const recent = this.positionHistory.slice(-2);
      const timeDiff = (recent[1].timestamp - recent[0].timestamp) / 1000; // seconds
      
      if (timeDiff > 0) {
        const distance = this.calculateDistance(
          recent[0].lat, recent[0].lon,
          recent[1].lat, recent[1].lon
        );
        const calculatedSpeed = distance / timeDiff; // m/s
        speed += calculatedSpeed * 0.4;
        totalWeight += 0.4;
      }
    }

    const rawSpeed = totalWeight > 0 ? speed / totalWeight : 0;

    // Apply smoothing
    if (this.speedHistory.length > 0) {
      const lastSpeed = this.speedHistory[this.speedHistory.length - 1];
      const smoothedSpeed = lastSpeed * this.SPEED_SMOOTHING_FACTOR + rawSpeed * (1 - this.SPEED_SMOOTHING_FACTOR);
      
      this.speedHistory.push(smoothedSpeed);
      if (this.speedHistory.length > this.HISTORY_SIZE) {
        this.speedHistory.shift();
      }
      
      return smoothedSpeed;
    }

    this.speedHistory.push(rawSpeed);
    return rawSpeed;
  }

  private detectMotionState(): MotionState {
    const speed = this.state.fused_position?.speed || 0;
    const accelData = this.accelerationHistory.slice(-this.MOTION_DETECTION_WINDOW);

    if (accelData.length < 5) {
      return 'unknown';
    }

    // Calculate average acceleration magnitude
    const avgAccel = accelData.reduce((sum, a) => sum + a, 0) / accelData.length;
    const accelVariance = accelData.reduce((sum, a) => sum + Math.pow(a - avgAccel, 2), 0) / accelData.length;

    // Stationary: low speed, low acceleration variance
    if (speed < 0.5 && accelVariance < 0.5) {
      return 'stationary';
    }

    // Running: high speed, high acceleration variance (device shake)
    if (speed > 2.5 || accelVariance > 5.0) {
      return 'running';
    }

    // Jogging: moderate-high speed, moderate acceleration variance
    if (speed > 1.8 || accelVariance > 2.0) {
      return 'jogging';
    }

    // Walking: low-moderate speed, low-moderate acceleration
    if (speed > 0.5) {
      return 'walking';
    }

    return 'unknown';
  }

  private calculatePositionConfidence(): number {
    let confidence = 0.5;

    // GPS quality contribution (40%)
    const gpsQuality = this.state.sensor_health.gps_quality;
    const gpsScore = gpsQuality === 'excellent' ? 1.0 : 
                     gpsQuality === 'good' ? 0.8 :
                     gpsQuality === 'fair' ? 0.5 : 0.2;
    confidence += gpsScore * 0.4;

    // Heading stability contribution (30%)
    confidence += this.state.sensor_health.heading_stability * 0.3;

    // Motion consistency contribution (20%)
    confidence += this.state.sensor_health.motion_consistency * 0.2;

    // Sensor availability bonus (10%)
    const sensorCount = [
      this.state.sensor_profile.accelerometer_available,
      this.state.sensor_profile.gyroscope_available,
      this.state.sensor_profile.compass_available,
    ].filter(Boolean).length;
    confidence += (sensorCount / 3) * 0.1;

    return Math.max(0, Math.min(1, confidence));
  }

  // Movement Pattern Detection
  private detectMovementPatterns(): void {
    const pattern = this.getEmptyMovementPattern();

    // Sudden turn detection
    if (this.headingHistory.length >= 3) {
      const recent = this.headingHistory.slice(-3);
      const headingChange = Math.abs(this.angleDifference(recent[0], recent[2]));
      pattern.sudden_turn_detected = headingChange > 90;
    }

    // Device shake detection (running indicator)
    if (this.accelerationHistory.length >= this.MOTION_DETECTION_WINDOW) {
      const recent = this.accelerationHistory.slice(-this.MOTION_DETECTION_WINDOW);
      const avgAccel = recent.reduce((sum, a) => sum + a, 0) / recent.length;
      const variance = recent.reduce((sum, a) => sum + Math.pow(a - avgAccel, 2), 0) / recent.length;
      pattern.device_shake_detected = variance > 5.0;
    }

    // Stop and start detection
    if (this.speedHistory.length >= 10) {
      const recent = this.speedHistory.slice(-10);
      const stops = recent.filter(s => s < 0.3).length;
      const moves = recent.filter(s => s > 1.0).length;
      pattern.stop_and_start_detected = stops >= 3 && moves >= 3;
    }

    // Direction changes per minute
    if (this.headingHistory.length >= 20) {
      const recent = this.headingHistory.slice(-20);
      let changes = 0;
      for (let i = 1; i < recent.length; i++) {
        if (Math.abs(this.angleDifference(recent[i - 1], recent[i])) > 45) {
          changes++;
        }
      }
      pattern.direction_changes_per_minute = changes * 3; // Extrapolate to per minute
    }

    // Erratic movement (combination of factors)
    pattern.erratic_movement = 
      pattern.direction_changes_per_minute > 10 ||
      (pattern.stop_and_start_detected && pattern.sudden_turn_detected);

    this.state.movement_pattern = pattern;
  }

  private updateOverallConfidence(): void {
    const gpsScore = this.state.sensor_health.gps_quality === 'excellent' ? 1.0 :
                     this.state.sensor_health.gps_quality === 'good' ? 0.8 :
                     this.state.sensor_health.gps_quality === 'fair' ? 0.5 : 0.2;

    this.state.sensor_health.overall_confidence = 
      (gpsScore * 0.5) +
      (this.state.sensor_health.heading_stability * 0.3) +
      (this.state.sensor_health.motion_consistency * 0.2);
  }

  // Utility Methods
  private getFamiliarityCorrection(): { lat: number; lon: number } | null {
    try {
      const heatmapEngine = (window as any).familiarityHeatmapEngine;
      if (!heatmapEngine) return null;

      const state = heatmapEngine.getState();
      if (!state?.currentTileFamiliarity || state.currentTileFamiliarity < 0.8) {
        return null;
      }

      // Use high-familiarity tiles as reference points for correction
      // This is simplified - full implementation would track known-good positions
      return null;
    } catch {
      return null;
    }
  }

  private calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private smoothAngle(oldAngle: number, newAngle: number, factor: number): number {
    // Handle angle wrapping
    let diff = newAngle - oldAngle;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    const smoothed = oldAngle + diff * (1 - factor);
    return (smoothed + 360) % 360;
  }

  private angleDifference(angle1: number, angle2: number): number {
    let diff = angle2 - angle1;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff;
  }

  // Calibration
  private loadCalibration(): void {
    try {
      const stored = localStorage.getItem('pathfinder_sensor_calibration');
      if (stored) {
        const calibration = JSON.parse(stored);
        this.state.calibration_offset = calibration;
        console.log('Loaded sensor calibration:', calibration);
      }
    } catch (error) {
      console.warn('Failed to load sensor calibration:', error);
    }
  }

  public saveCalibration(): void {
    try {
      localStorage.setItem('pathfinder_sensor_calibration', JSON.stringify(this.state.calibration_offset));
      console.log('Saved sensor calibration');
    } catch (error) {
      console.warn('Failed to save sensor calibration:', error);
    }
  }

  public calibrateFromKnownPosition(lat: number, lon: number, heading?: number): void {
    if (!this.state.raw_sensor_data?.gps) return;

    this.state.calibration_offset.lat_offset = lat - this.state.raw_sensor_data.gps.lat;
    this.state.calibration_offset.lon_offset = lon - this.state.raw_sensor_data.gps.lon;

    if (heading !== undefined && this.state.raw_sensor_data.compass) {
      this.state.calibration_offset.heading_offset = heading - this.state.raw_sensor_data.compass.heading;
    }

    this.saveCalibration();
    this.notifyListeners();
  }

  // Public API
  public getState(): SensorFusionState {
    return { ...this.state };
  }

  public getFusedPosition(): FusedPosition | null {
    return this.state.fused_position ? { ...this.state.fused_position } : null;
  }

  public getSensorProfile(): SensorProfile {
    return { ...this.state.sensor_profile };
  }

  public getMovementPattern(): MovementPattern {
    return { ...this.state.movement_pattern };
  }

  public adjustSensorWeights(weights: Partial<SensorProfile>): void {
    this.state.sensor_profile = { ...this.state.sensor_profile, ...weights };
    this.notifyListeners();
  }

  public stop(): void {
    if (this.gpsWatchId !== null) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
    }

    if (this.fusionInterval !== null) {
      clearInterval(this.fusionInterval);
      this.fusionInterval = null;
    }

    this.state.isActive = false;
    this.notifyListeners();
  }

  public addListener(listener: (state: SensorFusionState) => void): void {
    this.listeners.push(listener);
  }

  public removeListener(listener: (state: SensorFusionState) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }
}

// Singleton instance
let sensorFusionLayerInstance: SensorFusionLayer | null = null;

export function getSensorFusionLayer(): SensorFusionLayer {
  if (!sensorFusionLayerInstance) {
    sensorFusionLayerInstance = new SensorFusionLayer();
    // Expose to window for debugging and integration
    (window as any).sensorFusionLayer = sensorFusionLayerInstance;
  }
  return sensorFusionLayerInstance;
}

export default getSensorFusionLayer;
