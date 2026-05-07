/**
 * PATHMAP V96 - Precision Tracking Service
 * 
 * State-of-the-art multi-sensor fusion tracking with:
 * - Extended Kalman Filter (GPS + Compass + Accelerometer)
 * - Multi-source location fusion (GPS + WiFi + Cellular + Bluetooth)
 * - Self-calibrating compass correction
 * - Dead reckoning during GPS dropout
 * - Visual tracking trail animation
 * - Predictive smoothing
 * - Adaptive update rate (up to 60Hz)
 */

import { getMultiSourceLocationService, FusedLocation, SignalQuality } from './multiSourceLocationService';

export interface SensorReading {
  timestamp: number;
  gps?: {
    lat: number;
    lon: number;
    accuracy: number;
    altitude?: number;
    speed?: number;
    heading?: number;
  };
  fusedLocation?: FusedLocation;
  compass?: {
    heading: number;
    accuracy?: number;
  };
  accelerometer?: {
    x: number;
    y: number;
    z: number;
  };
  gyroscope?: {
    alpha: number;
    beta: number;
    gamma: number;
  };
  satelliteCount?: number;
  hdop?: number;
  signalQuality?: SignalQuality;
}

export interface TrackedPosition {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  accuracy: number;
  headingAccuracy: number;
  altitude?: number;
  timestamp: number;
  confidence: number;
  sourceQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'dead_reckoning';
  isPredicted: boolean;
  calibrationApplied: boolean;
}

export interface TrailPoint {
  lat: number;
  lon: number;
  heading: number;
  timestamp: number;
  accuracy: number;
}

export interface KalmanState {
  lat: number;
  lon: number;
  velNorth: number;
  velEast: number;
  heading: number;
  headingRate: number;
  pLat: number;
  pLon: number;
  pVelN: number;
  pVelE: number;
  pHeading: number;
  pHeadingRate: number;
}

export interface CalibrationState {
  magneticDeclination: number;
  compassOffset: number;
  gpsOffsetLat: number;
  gpsOffsetLon: number;
  accelerometerBias: [number, number, number];
  calibrationSamples: number;
  lastCalibration: number;
  isCalibrated: boolean;
}

export interface TrackingStats {
  isTracking: boolean;
  gpsFixes: number;
  deadReckoningUpdates: number;
  totalDistanceMeters: number;
  trailPoints: number;
  sessionDuration: number;
  calibration: CalibrationState;
  multiSourceEnabled: boolean;
  signalQuality?: SignalQuality;
  updateRateHz: number;
}

type PositionListener = (position: TrackedPosition) => void;
type TrailListener = (trail: TrailPoint[]) => void;

class ExtendedKalmanFilter {
  private state: KalmanState;
  private initialized: boolean = false;
  private _lastUpdateTime: number = 0;  // Tracked for future staleness detection

  // Process noise
  private qPosition = 0.1;
  private qVelocity = 1.0;
  private qHeading = 0.5;
  private qHeadingRate = 0.1;

  // Measurement noise
  private rGpsPosition = 5.0;
  // _rGpsVelocity reserved for future use
  private rCompass = 10.0;

  constructor() {
    this.state = {
      lat: 0, lon: 0,
      velNorth: 0, velEast: 0,
      heading: 0, headingRate: 0,
      pLat: 100, pLon: 100,
      pVelN: 10, pVelE: 10,
      pHeading: 30, pHeadingRate: 5
    };
  }

  initialize(lat: number, lon: number, heading: number = 0): void {
    this.state.lat = lat;
    this.state.lon = lon;
    this.state.heading = heading;
    this.state.velNorth = 0;
    this.state.velEast = 0;
    this.state.headingRate = 0;
    this.initialized = true;
    this._lastUpdateTime = Date.now();
  }

  predict(dt: number, accelForward: number = 0, gyroRate: number = 0): void {
    if (!this.initialized || dt <= 0) return;

    const EARTH_RADIUS = 6371000;
    const headingRad = this.state.heading * Math.PI / 180;

    // Update velocities with acceleration
    if (accelForward !== 0) {
      this.state.velNorth += accelForward * Math.cos(headingRad) * dt;
      this.state.velEast += accelForward * Math.sin(headingRad) * dt;
    }

    // Update position from velocity
    const dLat = (this.state.velNorth * dt) / EARTH_RADIUS;
    const dLon = (this.state.velEast * dt) / (EARTH_RADIUS * Math.cos(this.state.lat * Math.PI / 180));

    this.state.lat += dLat * 180 / Math.PI;
    this.state.lon += dLon * 180 / Math.PI;

    // Update heading from gyroscope
    if (gyroRate !== 0) {
      this.state.headingRate = gyroRate;
    }
    this.state.heading = (this.state.heading + this.state.headingRate * dt + 360) % 360;

    // Track last update time
    this._lastUpdateTime = Date.now();

    // Update covariance
    this.state.pLat += this.qPosition * dt;
    this.state.pLon += this.qPosition * dt;
    this.state.pVelN += this.qVelocity * dt;
    this.state.pVelE += this.qVelocity * dt;
    this.state.pHeading += this.qHeading * dt;
    this.state.pHeadingRate += this.qHeadingRate * dt;
  }

  updateGps(lat: number, lon: number, accuracy: number, speed?: number, heading?: number): void {
    if (!this.initialized) {
      this.initialize(lat, lon, heading || 0);
      return;
    }

    const rPos = Math.max(accuracy, this.rGpsPosition);

    // Kalman gain
    const kLat = this.state.pLat / (this.state.pLat + rPos);
    const kLon = this.state.pLon / (this.state.pLon + rPos);

    // Innovation
    const innovLat = lat - this.state.lat;
    const innovLon = lon - this.state.lon;

    // State update
    this.state.lat += kLat * innovLat;
    this.state.lon += kLon * innovLon;

    // Covariance update
    this.state.pLat *= (1 - kLat);
    this.state.pLon *= (1 - kLon);

    // Update velocity from speed/heading
    if (speed !== undefined && heading !== undefined) {
      const headingRad = heading * Math.PI / 180;
      const measuredVelN = speed * Math.cos(headingRad);
      const measuredVelE = speed * Math.sin(headingRad);

      const kVel = 0.5;
      this.state.velNorth += kVel * (measuredVelN - this.state.velNorth);
      this.state.velEast += kVel * (measuredVelE - this.state.velEast);

      // Update heading from GPS course
      const kHeading = this.state.pHeading / (this.state.pHeading + this.rCompass * 2);
      const headingDiff = this.angleDiff(heading, this.state.heading);
      this.state.heading = (this.state.heading + kHeading * headingDiff + 360) % 360;
      this.state.pHeading *= (1 - kHeading);
    }
  }

  updateCompass(heading: number, accuracy: number = 15): void {
    if (!this.initialized) return;

    const rCompass = Math.max(accuracy, this.rCompass);
    const kHeading = this.state.pHeading / (this.state.pHeading + rCompass);

    const headingDiff = this.angleDiff(heading, this.state.heading);
    this.state.heading = (this.state.heading + kHeading * headingDiff + 360) % 360;
    this.state.pHeading *= (1 - kHeading);
  }

  updateAccelerometer(_accelForward: number, accelLateral: number): void {
    if (!this.initialized) return;

    const speed = Math.sqrt(this.state.velNorth ** 2 + this.state.velEast ** 2);
    if (speed > 0.5) {
      const turningRate = (accelLateral / speed) * 180 / Math.PI;
      const kRate = 0.3;
      this.state.headingRate += kRate * (turningRate - this.state.headingRate);
    }
  }

  getState(): { lat: number; lon: number; heading: number; speed: number } {
    const speed = Math.sqrt(this.state.velNorth ** 2 + this.state.velEast ** 2);
    return {
      lat: this.state.lat,
      lon: this.state.lon,
      heading: this.state.heading,
      speed
    };
  }

  getAccuracy(): { position: number; heading: number } {
    const posAccuracy = Math.sqrt(this.state.pLat + this.state.pLon) * 111000;
    const headingAccuracy = Math.sqrt(this.state.pHeading);
    return { position: posAccuracy, heading: headingAccuracy };
  }

  getLastUpdateTime(): number {
    return this._lastUpdateTime;
  }

  private angleDiff(a1: number, a2: number): number {
    let diff = a1 - a2;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return diff;
  }
}

class PrecisionTrackingService {
  private kalman: ExtendedKalmanFilter;
  private calibration: CalibrationState;
  private trail: TrailPoint[] = [];
  private maxTrailPoints = 500;

  private isTracking = false;
  private lastGpsTime = 0;
  private lastUpdateTime = 0;
  private gpsDropoutThreshold = 5000; // ms
  private updateRateHz = 30; // V96: Increased to 30Hz for smoother tracking
  private adaptiveRateEnabled = true;

  private positionHistory: TrackedPosition[] = [];
  private maxHistory = 1000;

  private positionListeners: PositionListener[] = [];
  private trailListeners: TrailListener[] = [];

  // Stats
  private gpsFixes = 0;
  private deadReckoningCount = 0;
  private totalDistance = 0;
  private sessionStartTime = 0;

  // Sensor handles
  private gpsWatchId: number | null = null;
  private sensorInterval: number | null = null;
  private orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  private motionHandler: ((e: DeviceMotionEvent) => void) | null = null;

  // Latest sensor data
  private latestCompass: { heading: number; accuracy?: number } | null = null;
  private latestAccel: { x: number; y: number; z: number } | null = null;
  private latestGyro: { alpha: number; beta: number; gamma: number } | null = null;

  // V96: Multi-source location integration
  private multiSourceEnabled = true;
  private multiSourceService = getMultiSourceLocationService();
  private latestSignalQuality: SignalQuality | null = null;
  private multiSourceListener: ((loc: FusedLocation) => void) | null = null;

  constructor() {
    this.kalman = new ExtendedKalmanFilter();
    this.calibration = this.getDefaultCalibration();
  }

  private getDefaultCalibration(): CalibrationState {
    return {
      magneticDeclination: 0,
      compassOffset: 0,
      gpsOffsetLat: 0,
      gpsOffsetLon: 0,
      accelerometerBias: [0, 0, 0],
      calibrationSamples: 0,
      lastCalibration: 0,
      isCalibrated: false
    };
  }

  startTracking(): { status: string; message: string } {
    if (this.isTracking) {
      return { status: 'already_active', message: 'Tracking already running' };
    }

    this.isTracking = true;
    this.sessionStartTime = Date.now();
    this.gpsFixes = 0;
    this.deadReckoningCount = 0;
    this.totalDistance = 0;
    this.trail = [];
    this.positionHistory = [];

    // V96: Start multi-source location fusion first
    if (this.multiSourceEnabled) {
      this.multiSourceService.configure({
        enableGPS: true,
        enableWiFi: true,
        enableCellular: true,
        enableBluetooth: true,
        highAccuracyMode: true,
        updateIntervalMs: Math.floor(1000 / this.updateRateHz)
      });
      
      this.multiSourceListener = (fusedLocation: FusedLocation) => {
        this.handleMultiSourceUpdate(fusedLocation);
      };
      
      this.multiSourceService.addLocationListener(this.multiSourceListener);
      this.multiSourceService.addSignalListener((quality) => {
        this.latestSignalQuality = quality;
      });
      
      this.multiSourceService.start();
    }

    this.startSensors();

    console.log('[PrecisionTracking] Started with multi-source fusion');
    return { status: 'started', message: 'Precision tracking started with multi-source fusion' };
  }

  stopTracking(): TrackingStats {
    if (!this.isTracking) {
      return this.getStats();
    }

    this.isTracking = false;
    this.stopSensors();

    // V96: Stop multi-source service
    if (this.multiSourceEnabled) {
      if (this.multiSourceListener) {
        this.multiSourceService.removeLocationListener(this.multiSourceListener);
        this.multiSourceListener = null;
      }
      this.multiSourceService.stop();
    }

    console.log('[PrecisionTracking] Stopped');
    return this.getStats();
  }

  // V96: Handle multi-source fused location updates
  private handleMultiSourceUpdate(fusedLocation: FusedLocation): void {
    const reading: SensorReading = {
      timestamp: fusedLocation.timestamp,
      fusedLocation,
      gps: {
        lat: fusedLocation.latitude,
        lon: fusedLocation.longitude,
        accuracy: fusedLocation.accuracy,
        altitude: fusedLocation.altitude,
        speed: fusedLocation.speed,
        heading: fusedLocation.heading
      },
      signalQuality: fusedLocation.signalQuality
    };

    // Add compass/accel data if available
    if (this.latestCompass) reading.compass = this.latestCompass;
    if (this.latestAccel) reading.accelerometer = this.latestAccel;
    if (this.latestGyro) reading.gyroscope = this.latestGyro;

    this.processReading(reading);
    this.lastGpsTime = Date.now();
    this.gpsFixes++;

    // V96: Adaptive rate based on signal quality
    if (this.adaptiveRateEnabled && fusedLocation.signalQuality) {
      this.adjustUpdateRate(fusedLocation.signalQuality.overall);
    }
  }

  // V96: Adaptive update rate based on conditions
  private adjustUpdateRate(quality: SignalQuality['overall']): void {
    const currentRate = this.updateRateHz;
    let newRate = currentRate;

    switch (quality) {
      case 'excellent':
        newRate = 60; // Maximum precision
        break;
      case 'good':
        newRate = 30;
        break;
      case 'fair':
        newRate = 20;
        break;
      case 'poor':
        newRate = 10; // Conserve battery
        break;
    }

    if (newRate !== currentRate && this.sensorInterval !== null) {
      this.updateRateHz = newRate;
      clearInterval(this.sensorInterval);
      this.sensorInterval = window.setInterval(() => {
        this.runFusionUpdate();
      }, 1000 / this.updateRateHz);
      console.log(`[PrecisionTracking] Update rate adjusted to ${newRate}Hz`);
    }
  }

  private startSensors(): void {
    // GPS
    if (navigator.geolocation) {
      this.gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => this.handleGpsUpdate(pos),
        (err) => console.warn('[PrecisionTracking] GPS error:', err.message),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    }

    // Compass/Orientation
    this.orientationHandler = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) {
        // Convert to compass heading (0 = North)
        let heading = e.alpha;
        const evt = e as any;
        if (evt.webkitCompassHeading !== undefined) {
          heading = evt.webkitCompassHeading;
        } else if (e.absolute) {
          heading = 360 - e.alpha;
        }
        this.latestCompass = {
          heading,
          accuracy: evt.webkitCompassAccuracy
        };
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', this.orientationHandler, true);
    }

    // Accelerometer/Gyroscope
    this.motionHandler = (e: DeviceMotionEvent) => {
      if (e.accelerationIncludingGravity) {
        this.latestAccel = {
          x: e.accelerationIncludingGravity.x || 0,
          y: e.accelerationIncludingGravity.y || 0,
          z: e.accelerationIncludingGravity.z || 0
        };
      }
      if (e.rotationRate) {
        this.latestGyro = {
          alpha: e.rotationRate.alpha || 0,
          beta: e.rotationRate.beta || 0,
          gamma: e.rotationRate.gamma || 0
        };
      }
    };

    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', this.motionHandler, true);
    }

    // Fusion loop
    this.sensorInterval = window.setInterval(() => {
      this.runFusionUpdate();
    }, 1000 / this.updateRateHz);
  }

  private stopSensors(): void {
    if (this.gpsWatchId !== null) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
    }

    if (this.orientationHandler) {
      window.removeEventListener('deviceorientation', this.orientationHandler, true);
      this.orientationHandler = null;
    }

    if (this.motionHandler) {
      window.removeEventListener('devicemotion', this.motionHandler, true);
      this.motionHandler = null;
    }

    if (this.sensorInterval !== null) {
      clearInterval(this.sensorInterval);
      this.sensorInterval = null;
    }
  }

  private handleGpsUpdate(pos: GeolocationPosition): void {
    const reading: SensorReading = {
      timestamp: pos.timestamp,
      gps: {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude || undefined,
        speed: pos.coords.speed || undefined,
        heading: pos.coords.heading || undefined
      }
    };

    this.processReading(reading);
    this.lastGpsTime = Date.now();
    this.gpsFixes++;
  }

  private runFusionUpdate(): void {
    if (!this.isTracking) return;

    const now = Date.now();
    const hasRecentGps = (now - this.lastGpsTime) < this.gpsDropoutThreshold;

    if (!hasRecentGps && this.kalman.getState().lat !== 0) {
      // Dead reckoning mode
      const reading: SensorReading = {
        timestamp: now,
        compass: this.latestCompass || undefined,
        accelerometer: this.latestAccel || undefined,
        gyroscope: this.latestGyro || undefined
      };
      this.processReading(reading);
      this.deadReckoningCount++;
    }
  }

  private processReading(reading: SensorReading): TrackedPosition | null {
    if (!this.isTracking) return null;

    const now = reading.timestamp || Date.now();
    const dt = this.lastUpdateTime > 0 ? (now - this.lastUpdateTime) / 1000 : 0.05;
    this.lastUpdateTime = now;

    // Predict step
    let accelForward = 0;
    let gyroRate = 0;

    if (reading.accelerometer) {
      accelForward = reading.accelerometer.y - this.calibration.accelerometerBias[1];
    }
    if (reading.gyroscope) {
      gyroRate = reading.gyroscope.alpha;
    }

    this.kalman.predict(dt, accelForward, gyroRate);

    // GPS update
    let isDeadReckoning = false;
    let sourceQuality: TrackedPosition['sourceQuality'] = 'poor';

    if (reading.gps) {
      const correctedLat = reading.gps.lat + this.calibration.gpsOffsetLat;
      const correctedLon = reading.gps.lon + this.calibration.gpsOffsetLon;

      this.kalman.updateGps(
        correctedLat,
        correctedLon,
        reading.gps.accuracy,
        reading.gps.speed,
        reading.gps.heading
      );

      if (reading.gps.accuracy < 5) sourceQuality = 'excellent';
      else if (reading.gps.accuracy < 15) sourceQuality = 'good';
      else if (reading.gps.accuracy < 30) sourceQuality = 'fair';
      else sourceQuality = 'poor';

      // Compass calibration
      if (reading.compass && reading.gps.heading !== undefined && reading.gps.speed && reading.gps.speed > 1) {
        this.updateCompassCalibration(reading.compass.heading, reading.gps.heading);
      }
    } else {
      isDeadReckoning = true;
      sourceQuality = 'dead_reckoning';
    }

    // Compass update
    if (reading.compass) {
      const correctedHeading = (
        reading.compass.heading +
        this.calibration.compassOffset +
        this.calibration.magneticDeclination + 360
      ) % 360;
      this.kalman.updateCompass(correctedHeading, reading.compass.accuracy || 15);
    }

    // Accelerometer update
    if (reading.accelerometer) {
      const correctedX = reading.accelerometer.x - this.calibration.accelerometerBias[0];
      const correctedY = reading.accelerometer.y - this.calibration.accelerometerBias[1];
      this.kalman.updateAccelerometer(correctedY, correctedX);
    }

    // Get fused result
    const state = this.kalman.getState();
    const accuracy = this.kalman.getAccuracy();

    const confidence = this.calculateConfidence(
      accuracy.position,
      accuracy.heading,
      isDeadReckoning,
      reading.satelliteCount,
      reading.hdop
    );

    const position: TrackedPosition = {
      latitude: state.lat,
      longitude: state.lon,
      heading: state.heading,
      speed: state.speed,
      accuracy: Math.min(accuracy.position, 1000),
      headingAccuracy: Math.min(accuracy.heading, 180),
      altitude: reading.gps?.altitude,
      timestamp: now,
      confidence,
      sourceQuality,
      isPredicted: isDeadReckoning,
      calibrationApplied: this.calibration.isCalibrated
    };

    // Update trail
    this.trail.push({
      lat: state.lat,
      lon: state.lon,
      heading: state.heading,
      timestamp: now,
      accuracy: accuracy.position
    });
    if (this.trail.length > this.maxTrailPoints) {
      this.trail.shift();
    }

    // Update distance
    if (this.positionHistory.length > 0) {
      const prev = this.positionHistory[this.positionHistory.length - 1];
      const dist = this.haversineDistance(prev.latitude, prev.longitude, state.lat, state.lon);
      if (dist < 100) {
        this.totalDistance += dist;
      }
    }

    // Store history
    this.positionHistory.push(position);
    if (this.positionHistory.length > this.maxHistory) {
      this.positionHistory.shift();
    }

    // Notify listeners
    this.notifyPositionListeners(position);
    this.notifyTrailListeners(this.trail);

    return position;
  }

  private updateCompassCalibration(compassHeading: number, gpsHeading: number): void {
    const offset = this.angleDiff(gpsHeading, compassHeading);
    const alpha = 0.1;
    this.calibration.compassOffset = (1 - alpha) * this.calibration.compassOffset + alpha * offset;
    this.calibration.calibrationSamples++;

    if (this.calibration.calibrationSamples >= 10) {
      this.calibration.isCalibrated = true;
      this.calibration.lastCalibration = Date.now();
    }
  }

  private calculateConfidence(
    posAccuracy: number,
    headingAccuracy: number,
    isDeadReckoning: boolean,
    satelliteCount?: number,
    hdop?: number
  ): number {
    let confidence = 1.0;

    // Position accuracy
    if (posAccuracy < 5) confidence *= 1.0;
    else if (posAccuracy < 15) confidence *= 0.9;
    else if (posAccuracy < 30) confidence *= 0.7;
    else if (posAccuracy < 50) confidence *= 0.5;
    else confidence *= 0.3;

    // Dead reckoning penalty
    if (isDeadReckoning) confidence *= 0.5;

    // Satellite count
    if (satelliteCount !== undefined) {
      if (satelliteCount >= 8) confidence *= 1.0;
      else if (satelliteCount >= 5) confidence *= 0.9;
      else if (satelliteCount >= 3) confidence *= 0.7;
      else confidence *= 0.5;
    }

    // HDOP
    if (hdop !== undefined) {
      if (hdop < 1.0) confidence *= 1.0;
      else if (hdop < 2.0) confidence *= 0.95;
      else if (hdop < 5.0) confidence *= 0.8;
      else confidence *= 0.6;
    }

    // Heading accuracy
    if (headingAccuracy < 10) confidence *= 1.0;
    else if (headingAccuracy < 30) confidence *= 0.9;
    else confidence *= 0.7;

    return Math.min(Math.max(confidence, 0), 1);
  }

  private angleDiff(a1: number, a2: number): number {
    let diff = a1 - a2;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return diff;
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const dPhi = (lat2 - lat1) * Math.PI / 180;
    const dLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // Public API

  getTrail(smoothed: boolean = true): [number, number][] {
    if (!smoothed || this.trail.length < 3) {
      return this.trail.map(p => [p.lat, p.lon]);
    }

    // Moving average smoothing
    const window = 3;
    const smoothedTrail: [number, number][] = [];

    for (let i = 0; i < this.trail.length; i++) {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(this.trail.length, i + Math.floor(window / 2) + 1);
      const slice = this.trail.slice(start, end);

      const avgLat = slice.reduce((sum, p) => sum + p.lat, 0) / slice.length;
      const avgLon = slice.reduce((sum, p) => sum + p.lon, 0) / slice.length;
      smoothedTrail.push([avgLat, avgLon]);
    }

    return smoothedTrail;
  }

  getCurrentPosition(): TrackedPosition | null {
    return this.positionHistory.length > 0
      ? this.positionHistory[this.positionHistory.length - 1]
      : null;
  }

  getStats(): TrackingStats {
    return {
      isTracking: this.isTracking,
      gpsFixes: this.gpsFixes,
      deadReckoningUpdates: this.deadReckoningCount,
      totalDistanceMeters: this.totalDistance,
      trailPoints: this.trail.length,
      sessionDuration: this.isTracking ? Date.now() - this.sessionStartTime : 0,
      calibration: { ...this.calibration },
      multiSourceEnabled: this.multiSourceEnabled,
      signalQuality: this.latestSignalQuality || undefined,
      updateRateHz: this.updateRateHz
    };
  }

  setMagneticDeclination(declination: number): void {
    this.calibration.magneticDeclination = declination;
  }

  resetCalibration(): void {
    this.calibration = this.getDefaultCalibration();
    this.kalman = new ExtendedKalmanFilter();
  }

  // V96: Multi-source location control
  setMultiSourceEnabled(enabled: boolean): void {
    this.multiSourceEnabled = enabled;
    if (this.isTracking) {
      if (enabled) {
        this.multiSourceService.start();
      } else {
        this.multiSourceService.stop();
      }
    }
  }

  getMultiSourceEnabled(): boolean {
    return this.multiSourceEnabled;
  }

  getSignalQuality(): SignalQuality | null {
    return this.latestSignalQuality;
  }

  // V96: Set update rate (5-60Hz)
  setUpdateRate(hz: number): void {
    this.updateRateHz = Math.max(5, Math.min(60, hz));
    this.adaptiveRateEnabled = false; // Manual override disables adaptive
    
    if (this.isTracking && this.sensorInterval !== null) {
      clearInterval(this.sensorInterval);
      this.sensorInterval = window.setInterval(() => {
        this.runFusionUpdate();
      }, 1000 / this.updateRateHz);
    }
  }

  setAdaptiveRate(enabled: boolean): void {
    this.adaptiveRateEnabled = enabled;
  }

  addPositionListener(listener: PositionListener): void {
    this.positionListeners.push(listener);
  }

  removePositionListener(listener: PositionListener): void {
    const index = this.positionListeners.indexOf(listener);
    if (index !== -1) {
      this.positionListeners.splice(index, 1);
    }
  }

  addTrailListener(listener: TrailListener): void {
    this.trailListeners.push(listener);
  }

  removeTrailListener(listener: TrailListener): void {
    const index = this.trailListeners.indexOf(listener);
    if (index !== -1) {
      this.trailListeners.splice(index, 1);
    }
  }

  private notifyPositionListeners(position: TrackedPosition): void {
    for (const listener of this.positionListeners) {
      try {
        listener(position);
      } catch (e) {
        console.error('[PrecisionTracking] Listener error:', e);
      }
    }
  }

  private notifyTrailListeners(trail: TrailPoint[]): void {
    for (const listener of this.trailListeners) {
      try {
        listener(trail);
      } catch (e) {
        console.error('[PrecisionTracking] Trail listener error:', e);
      }
    }
  }
}

// Singleton
let precisionTrackingInstance: PrecisionTrackingService | null = null;

export function getPrecisionTrackingService(): PrecisionTrackingService {
  if (!precisionTrackingInstance) {
    precisionTrackingInstance = new PrecisionTrackingService();
  }
  return precisionTrackingInstance;
}

export default { getPrecisionTrackingService };
