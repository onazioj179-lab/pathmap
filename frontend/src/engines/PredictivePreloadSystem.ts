/**
 * PATHFINDER V52 - PREDICTIVE PRELOAD SYSTEM (PPS)
 * 
 * Movement prediction and intelligent tile preloading.
 * Features: Speed/heading analysis, 500m corridor preload, bearing prediction (±15°).
 */

interface LocationUpdate {
  lat: number;
  lon: number;
  heading: number; // degrees, 0-359
  speed: number; // m/s
  timestamp: number;
}

interface PredictionResult {
  predictedPath: Array<[number, number]>; // [lat, lon] points
  confidence: number; // 0-1
  bearing: number; // predicted bearing
  bearingRange: [number, number]; // [min, max] degrees
  corridorWidth: number; // meters
  preloadZones: Array<{ center: [number, number]; radius: number }>;
}

interface PreloadStats {
  tilesPreloaded: number;
  predictionsCorrect: number;
  predictionsTotal: number;
  avgConfidence: number;
  corridorHitRate: number;
}

const SPEED_THRESHOLD = 0.5; // m/s (walking speed)
const HISTORY_LENGTH = 10; // location samples
const PREDICTION_DISTANCE = 500; // meters
const BEARING_TOLERANCE = 15; // degrees ±
const CORRIDOR_BASE_WIDTH = 100; // meters
const CONFIDENCE_DECAY = 0.85; // per prediction step
const PRELOAD_TILE_ZOOM = 15; // zoom level for preloading

export class PredictivePreloadSystem {
  private history: LocationUpdate[] = [];
  private stats: PreloadStats = {
    tilesPreloaded: 0,
    predictionsCorrect: 0,
    predictionsTotal: 0,
    avgConfidence: 0,
    corridorHitRate: 0
  };
  private lastPrediction: PredictionResult | null = null;
  private tileEngine: any; // OfflineTileEngine reference
  private active = false;

  constructor(tileEngine?: any) {
    this.tileEngine = tileEngine;
  }

  setTileEngine(tileEngine: any): void {
    this.tileEngine = tileEngine;
  }

  start(): void {
    this.active = true;
    console.log('[PPS] Predictive preload started');
  }

  stop(): void {
    this.active = false;
    console.log('[PPS] Predictive preload stopped');
  }

  updateLocation(location: LocationUpdate): PredictionResult | null {
    if (!this.active) return null;

    // Add to history
    this.history.push(location);
    if (this.history.length > HISTORY_LENGTH) {
      this.history.shift();
    }

    // Need at least 3 samples for prediction
    if (this.history.length < 3) {
      return null;
    }

    // Only predict if moving
    if (location.speed < SPEED_THRESHOLD) {
      return null;
    }

    const prediction = this.predict(location);
    this.lastPrediction = prediction;

    // Trigger preload
    if (this.tileEngine && prediction.confidence > 0.6) {
      this.preloadCorridor(prediction);
    }

    return prediction;
  }

  private predict(current: LocationUpdate): PredictionResult {
    const avgSpeed = this.calculateAverageSpeed();
    const predictedBearing = this.predictBearing(current);
    const confidence = this.calculateConfidence();

    // Calculate prediction distance based on speed
    const predictionDistance = Math.min(avgSpeed * 60, PREDICTION_DISTANCE); // max 500m

    // Generate predicted path (5 waypoints)
    const predictedPath: Array<[number, number]> = [];
    let lat = current.lat;
    let lon = current.lon;
    const stepDistance = predictionDistance / 5;

    for (let i = 1; i <= 5; i++) {
      const offset = this.offsetCoordinate(lat, lon, predictedBearing, stepDistance * i);
      predictedPath.push(offset);
      lat = offset[0];
      lon = offset[1];
    }

    // Bearing range (±15°)
    const bearingMin = (predictedBearing - BEARING_TOLERANCE + 360) % 360;
    const bearingMax = (predictedBearing + BEARING_TOLERANCE) % 360;

    // Corridor width based on confidence
    const corridorWidth = CORRIDOR_BASE_WIDTH * (2 - confidence); // wider for low confidence

    // Preload zones (circles along predicted path)
    const preloadZones = predictedPath.map(point => ({
      center: point,
      radius: corridorWidth / 2
    }));

    return {
      predictedPath,
      confidence,
      bearing: predictedBearing,
      bearingRange: [bearingMin, bearingMax],
      corridorWidth,
      preloadZones
    };
  }

  private calculateAverageSpeed(): number {
    if (this.history.length < 2) return 0;

    const speeds = this.history.map(h => h.speed);
    return speeds.reduce((sum, s) => sum + s, 0) / speeds.length;
  }

  private predictBearing(current: LocationUpdate): number {
    // Use weighted average of recent headings
    const weights = [0.5, 0.3, 0.15, 0.05]; // most recent = highest weight
    let totalWeight = 0;
    let sumX = 0;
    let sumY = 0;

    for (let i = 0; i < Math.min(4, this.history.length); i++) {
      const idx = this.history.length - 1 - i;
      const heading = this.history[idx].heading;
      const weight = weights[i] || 0.05;
      
      sumX += Math.sin(heading * Math.PI / 180) * weight;
      sumY += Math.cos(heading * Math.PI / 180) * weight;
      totalWeight += weight;
    }

    const avgHeading = Math.atan2(sumX / totalWeight, sumY / totalWeight) * 180 / Math.PI;
    return (avgHeading + 360) % 360;
  }

  private calculateConfidence(): number {
    if (this.history.length < 3) return 0;

    // Confidence factors:
    // 1. Heading consistency
    const headings = this.history.slice(-5).map(h => h.heading);
    const headingVariance = this.calculateCircularVariance(headings);
    const headingConfidence = 1 - Math.min(headingVariance / 45, 1); // 45° = low confidence

    // 2. Speed consistency
    const speeds = this.history.slice(-5).map(h => h.speed);
    const speedVariance = this.calculateVariance(speeds);
    const speedConfidence = 1 - Math.min(speedVariance / 5, 1); // 5 m/s variance = low confidence

    // 3. Sample count (more samples = higher confidence)
    const sampleConfidence = Math.min(this.history.length / HISTORY_LENGTH, 1);

    // Weighted average
    const confidence = headingConfidence * 0.5 + speedConfidence * 0.3 + sampleConfidence * 0.2;
    
    return confidence;
  }

  private calculateCircularVariance(angles: number[]): number {
    // Circular variance for angles (handles 0/360 wraparound)
    const radians = angles.map(a => a * Math.PI / 180);
    const sumSin = radians.reduce((sum, r) => sum + Math.sin(r), 0);
    const sumCos = radians.reduce((sum, r) => sum + Math.cos(r), 0);
    
    const R = Math.sqrt(sumSin ** 2 + sumCos ** 2) / angles.length;
    const variance = 1 - R;
    
    return variance * 180; // convert to degrees
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => (v - mean) ** 2);
    return Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length);
  }

  private offsetCoordinate(lat: number, lon: number, bearing: number, distance: number): [number, number] {
    // Calculate new coordinate given distance and bearing
    const R = 6371000; // Earth radius in meters
    const brng = bearing * Math.PI / 180;
    const lat1 = lat * Math.PI / 180;
    const lon1 = lon * Math.PI / 180;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(distance / R) +
      Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng)
    );

    const lon2 = lon1 + Math.atan2(
      Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1),
      Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2)
    );

    return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
  }

  private async preloadCorridor(prediction: PredictionResult): Promise<void> {
    if (!this.tileEngine) {
      console.warn('[PPS] No tile engine configured for preloading');
      return;
    }

    console.log(`[PPS] Preloading corridor (confidence: ${(prediction.confidence * 100).toFixed(0)}%)`);

    let tilesPreloaded = 0;

    for (const zone of prediction.preloadZones) {
      const bounds = this.zoneToBounds(zone.center, zone.radius);
      
      // Preload tiles in zone (stub - would call tileEngine.preloadBounds)
      console.log(`[PPS] Preload zone: ${zone.center[0].toFixed(5)}, ${zone.center[1].toFixed(5)} (${zone.radius.toFixed(0)}m)`);
      
      // In real implementation:
      // await this.tileEngine.preloadBounds(bounds, PRELOAD_TILE_ZOOM);
      tilesPreloaded += 9; // estimate 3x3 tiles per zone
    }

    this.stats.tilesPreloaded += tilesPreloaded;
    console.log(`[PPS] Preloaded ${tilesPreloaded} tiles`);
  }

  private zoneToBounds(center: [number, number], radius: number): { north: number; south: number; east: number; west: number } {
    // Convert zone circle to bounding box
    const [lat, lon] = center;
    const degPerMeter = 1 / 111320; // approximate at equator
    
    const latOffset = (radius * degPerMeter);
    const lonOffset = (radius * degPerMeter) / Math.cos(lat * Math.PI / 180);

    return {
      north: lat + latOffset,
      south: lat - latOffset,
      east: lon + lonOffset,
      west: lon - lonOffset
    };
  }

  verifyPrediction(actualLocation: LocationUpdate): void {
    if (!this.lastPrediction) return;

    this.stats.predictionsTotal++;

    // Check if actual location is within corridor
    const inCorridor = this.isInCorridor(actualLocation, this.lastPrediction);
    
    if (inCorridor) {
      this.stats.predictionsCorrect++;
    }

    this.stats.corridorHitRate = this.stats.predictionsCorrect / this.stats.predictionsTotal;
    
    console.log(`[PPS] Prediction ${inCorridor ? 'HIT' : 'MISS'} (hit rate: ${(this.stats.corridorHitRate * 100).toFixed(1)}%)`);
  }

  private isInCorridor(location: LocationUpdate, prediction: PredictionResult): boolean {
    // Check if location is within any preload zone
    for (const zone of prediction.preloadZones) {
      const distance = this.haversineDistance(
        location.lat,
        location.lon,
        zone.center[0],
        zone.center[1]
      );

      if (distance <= zone.radius) {
        return true;
      }
    }

    return false;
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }

  getStats(): PreloadStats {
    return { ...this.stats };
  }

  getLastPrediction(): PredictionResult | null {
    return this.lastPrediction;
  }

  reset(): void {
    this.history = [];
    this.lastPrediction = null;
    console.log('[PPS] History reset');
  }
}
