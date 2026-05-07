/**
 * PATHFINDER V35 — FRIEND ETA ENGINE
 * 
 * Dual-user prediction engine that calculates when two users will meet.
 * Tracks movement vectors, predicts meet point, provides live ETA updates
 * for both users with per-user walking estimates.
 * 
 * Coordinates with /live_route backend endpoint for shared navigation.
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface UserLocation {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface MovementVector {
  userId: string;
  velocity: number;          // m/s
  bearing: number;           // degrees (0-360)
  acceleration: number;      // m/s^2
  isStationary: boolean;
}

export interface MeetPoint {
  latitude: number;
  longitude: number;
  confidence: number;        // 0-1
  estimatedArrivalTime: Date;
  distanceFromUser1: number; // meters
  distanceFromUser2: number; // meters
}

export interface FriendETAState {
  isActive: boolean;
  user1: UserLocation | null;
  user2: UserLocation | null;
  user1Vector: MovementVector | null;
  user2Vector: MovementVector | null;
  predictedMeetPoint: MeetPoint | null;
  user1ETA: number | null;    // seconds
  user2ETA: number | null;    // seconds
  totalETA: number | null;    // seconds until both arrive
  distanceBetween: number;    // current distance between users
  lastUpdated: number;
}

export interface ETAUpdate {
  userId: string;
  eta: number;               // seconds
  distance: number;          // meters to meet point
  walkingSpeed: number;      // m/s
  estimatedArrival: Date;
}

// ============================================================================
// FRIEND ETA ENGINE
// ============================================================================

class FriendETAEngine {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  
  private currentState: FriendETAState = {
    isActive: false,
    user1: null,
    user2: null,
    user1Vector: null,
    user2Vector: null,
    predictedMeetPoint: null,
    user1ETA: null,
    user2ETA: null,
    totalETA: null,
    distanceBetween: 0,
    lastUpdated: 0,
  };

  private locationHistory: Map<string, UserLocation[]> = new Map();
  private readonly HISTORY_SIZE = 10;
  private readonly UPDATE_INTERVAL_MS = 2000; // Update every 2 seconds
  private readonly AVERAGE_WALKING_SPEED = 1.4; // m/s (5 km/h)

  private listeners: ((state: FriendETAState) => void)[] = [];
  private etaUpdateListeners: ((update: ETAUpdate) => void)[] = [];

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  start(user1Id: string, user2Id: string): void {
    if (this.isRunning) {
      console.warn('[FriendETA] Already running');
      return;
    }

    this.currentState.isActive = true;
    this.isRunning = true;

    // Initialize history
    this.locationHistory.set(user1Id, []);
    this.locationHistory.set(user2Id, []);

    this.intervalId = setInterval(() => {
      this.calculateETA();
    }, this.UPDATE_INTERVAL_MS);

    console.log(`[FriendETA] Started tracking: ${user1Id} <-> ${user2Id}`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    this.currentState.isActive = false;
    this.locationHistory.clear();

    console.log('[FriendETA] Stopped');
  }

  // ==========================================================================
  // LOCATION UPDATES
  // ==========================================================================

  updateUserLocation(location: UserLocation): void {
    if (!this.isRunning) {
      console.warn('[FriendETA] Not running, cannot update location');
      return;
    }

    // Determine which user this is
    const history = this.locationHistory.get(location.userId);
    if (!history) {
      console.warn(`[FriendETA] Unknown user: ${location.userId}`);
      return;
    }

    // Add to history
    history.push(location);
    if (history.length > this.HISTORY_SIZE) {
      history.shift();
    }

    // Update current state
    if (!this.currentState.user1 || this.currentState.user1.userId === location.userId) {
      this.currentState.user1 = location;
    } else if (!this.currentState.user2 || this.currentState.user2.userId === location.userId) {
      this.currentState.user2 = location;
    }

    // Calculate movement vector
    const vector = this.calculateMovementVector(location.userId);
    if (this.currentState.user1 && this.currentState.user1.userId === location.userId) {
      this.currentState.user1Vector = vector;
    } else if (this.currentState.user2 && this.currentState.user2.userId === location.userId) {
      this.currentState.user2Vector = vector;
    }

    console.log(`[FriendETA] Location updated: ${location.userId} at ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`);
  }

  // ==========================================================================
  // MOVEMENT VECTOR CALCULATION
  // ==========================================================================

  private calculateMovementVector(userId: string): MovementVector {
    const history = this.locationHistory.get(userId);
    if (!history || history.length < 2) {
      return {
        userId,
        velocity: 0,
        bearing: 0,
        acceleration: 0,
        isStationary: true,
      };
    }

    const recent = history.slice(-3); // Last 3 positions
    const latest = recent[recent.length - 1];
    const previous = recent[recent.length - 2];

    // Calculate velocity
    const distance = this.calculateDistance(
      previous.latitude,
      previous.longitude,
      latest.latitude,
      latest.longitude
    );
    const timeDelta = (latest.timestamp - previous.timestamp) / 1000; // seconds
    const velocity = timeDelta > 0 ? distance / timeDelta : 0;

    // Calculate bearing
    const bearing = this.calculateBearing(
      previous.latitude,
      previous.longitude,
      latest.latitude,
      latest.longitude
    );

    // Calculate acceleration (if we have 3+ points)
    let acceleration = 0;
    if (recent.length >= 3) {
      const older = recent[0];
      const oldDistance = this.calculateDistance(
        older.latitude,
        older.longitude,
        previous.latitude,
        previous.longitude
      );
      const oldTimeDelta = (previous.timestamp - older.timestamp) / 1000;
      const oldVelocity = oldTimeDelta > 0 ? oldDistance / oldTimeDelta : 0;
      acceleration = (velocity - oldVelocity) / timeDelta;
    }

    const isStationary = velocity < 0.3; // Stationary if < 0.3 m/s

    return {
      userId,
      velocity,
      bearing,
      acceleration,
      isStationary,
    };
  }

  // ==========================================================================
  // ETA CALCULATION
  // ==========================================================================

  private calculateETA(): void {
    if (!this.currentState.user1 || !this.currentState.user2) {
      return;
    }

    // Calculate current distance between users
    this.currentState.distanceBetween = this.calculateDistance(
      this.currentState.user1.latitude,
      this.currentState.user1.longitude,
      this.currentState.user2.latitude,
      this.currentState.user2.longitude
    );

    // Predict meet point
    this.currentState.predictedMeetPoint = this.predictMeetPoint();

    if (this.currentState.predictedMeetPoint) {
      // Calculate ETAs for each user
      const user1Speed = this.currentState.user1Vector?.velocity || this.AVERAGE_WALKING_SPEED;
      const user2Speed = this.currentState.user2Vector?.velocity || this.AVERAGE_WALKING_SPEED;

      this.currentState.user1ETA = this.currentState.predictedMeetPoint.distanceFromUser1 / user1Speed;
      this.currentState.user2ETA = this.currentState.predictedMeetPoint.distanceFromUser2 / user2Speed;
      this.currentState.totalETA = Math.max(this.currentState.user1ETA, this.currentState.user2ETA);

      this.currentState.lastUpdated = Date.now();

      // Emit ETA updates
      this.emitETAUpdates();

      console.log(`[FriendETA] ETA: ${this.formatETA(this.currentState.totalETA)} (${this.currentState.distanceBetween.toFixed(0)}m apart)`);
    }

    this.notifyListeners();
  }

  private predictMeetPoint(): MeetPoint | null {
    if (!this.currentState.user1 || !this.currentState.user2) {
      return null;
    }

    const vector1 = this.currentState.user1Vector;
    const vector2 = this.currentState.user2Vector;

    // If both users are stationary, use midpoint
    if (vector1?.isStationary && vector2?.isStationary) {
      return this.calculateMidpoint();
    }

    // If moving, predict intersection point
    if (vector1 && vector2 && !vector1.isStationary && !vector2.isStationary) {
      return this.calculateIntersectionPoint();
    }

    // If one moving, one stationary, use stationary as meet point
    if (vector1?.isStationary) {
      return {
        latitude: this.currentState.user1.latitude,
        longitude: this.currentState.user1.longitude,
        confidence: 0.8,
        estimatedArrivalTime: new Date(),
        distanceFromUser1: 0,
        distanceFromUser2: this.currentState.distanceBetween,
      };
    }

    if (vector2?.isStationary) {
      return {
        latitude: this.currentState.user2.latitude,
        longitude: this.currentState.user2.longitude,
        confidence: 0.8,
        estimatedArrivalTime: new Date(),
        distanceFromUser1: this.currentState.distanceBetween,
        distanceFromUser2: 0,
      };
    }

    // Default: midpoint
    return this.calculateMidpoint();
  }

  private calculateMidpoint(): MeetPoint {
    const lat1 = this.currentState.user1!.latitude;
    const lon1 = this.currentState.user1!.longitude;
    const lat2 = this.currentState.user2!.latitude;
    const lon2 = this.currentState.user2!.longitude;

    const midLat = (lat1 + lat2) / 2;
    const midLon = (lon1 + lon2) / 2;

    const distanceFromUser1 = this.calculateDistance(lat1, lon1, midLat, midLon);
    const distanceFromUser2 = this.calculateDistance(lat2, lon2, midLat, midLon);

    const avgSpeed = this.AVERAGE_WALKING_SPEED;
    const eta = Math.max(distanceFromUser1, distanceFromUser2) / avgSpeed;

    return {
      latitude: midLat,
      longitude: midLon,
      confidence: 0.6,
      estimatedArrivalTime: new Date(Date.now() + eta * 1000),
      distanceFromUser1,
      distanceFromUser2,
    };
  }

  private calculateIntersectionPoint(): MeetPoint {
    // Simplified intersection - in production, use proper trajectory prediction
    // For now, calculate weighted midpoint based on velocities
    const vector1 = this.currentState.user1Vector!;
    const vector2 = this.currentState.user2Vector!;

    const totalVelocity = vector1.velocity + vector2.velocity;
    const weight1 = vector2.velocity / totalVelocity; // Faster user gets more weight
    const weight2 = vector1.velocity / totalVelocity;

    const lat1 = this.currentState.user1!.latitude;
    const lon1 = this.currentState.user1!.longitude;
    const lat2 = this.currentState.user2!.latitude;
    const lon2 = this.currentState.user2!.longitude;

    const meetLat = lat1 * weight1 + lat2 * weight2;
    const meetLon = lon1 * weight1 + lon2 * weight2;

    const distanceFromUser1 = this.calculateDistance(lat1, lon1, meetLat, meetLon);
    const distanceFromUser2 = this.calculateDistance(lat2, lon2, meetLat, meetLon);

    const eta1 = distanceFromUser1 / vector1.velocity;
    const eta2 = distanceFromUser2 / vector2.velocity;
    const eta = Math.max(eta1, eta2);

    return {
      latitude: meetLat,
      longitude: meetLon,
      confidence: 0.7,
      estimatedArrivalTime: new Date(Date.now() + eta * 1000),
      distanceFromUser1,
      distanceFromUser2,
    };
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.sin(φ2) -
      Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

    let bearing = Math.atan2(y, x) * (180 / Math.PI);
    bearing = (bearing + 360) % 360;

    return bearing;
  }

  private formatETA(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${minutes}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  private emitETAUpdates(): void {
    if (!this.currentState.user1ETA || !this.currentState.user2ETA || !this.currentState.predictedMeetPoint) {
      return;
    }

    const user1Vector = this.currentState.user1Vector;
    const user2Vector = this.currentState.user2Vector;

    if (this.currentState.user1) {
      const update: ETAUpdate = {
        userId: this.currentState.user1.userId,
        eta: this.currentState.user1ETA,
        distance: this.currentState.predictedMeetPoint.distanceFromUser1,
        walkingSpeed: user1Vector?.velocity || this.AVERAGE_WALKING_SPEED,
        estimatedArrival: this.currentState.predictedMeetPoint.estimatedArrivalTime,
      };
      this.etaUpdateListeners.forEach(listener => listener(update));
    }

    if (this.currentState.user2) {
      const update: ETAUpdate = {
        userId: this.currentState.user2.userId,
        eta: this.currentState.user2ETA,
        distance: this.currentState.predictedMeetPoint.distanceFromUser2,
        walkingSpeed: user2Vector?.velocity || this.AVERAGE_WALKING_SPEED,
        estimatedArrival: this.currentState.predictedMeetPoint.estimatedArrivalTime,
      };
      this.etaUpdateListeners.forEach(listener => listener(update));
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  getState(): FriendETAState {
    return { ...this.currentState };
  }

  isActive(): boolean {
    return this.currentState.isActive;
  }

  getMeetPoint(): MeetPoint | null {
    return this.currentState.predictedMeetPoint;
  }

  getETAForUser(userId: string): number | null {
    if (this.currentState.user1?.userId === userId) {
      return this.currentState.user1ETA;
    }
    if (this.currentState.user2?.userId === userId) {
      return this.currentState.user2ETA;
    }
    return null;
  }

  getDistanceBetweenUsers(): number {
    return this.currentState.distanceBetween;
  }

  onStateChange(callback: (state: FriendETAState) => void): void {
    this.listeners.push(callback);
  }

  onETAUpdate(callback: (update: ETAUpdate) => void): void {
    this.etaUpdateListeners.push(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.currentState));
  }

  reset(): void {
    this.stop();
    this.currentState = {
      isActive: false,
      user1: null,
      user2: null,
      user1Vector: null,
      user2Vector: null,
      predictedMeetPoint: null,
      user1ETA: null,
      user2ETA: null,
      totalETA: null,
      distanceBetween: 0,
      lastUpdated: 0,
    };
    this.locationHistory.clear();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let friendETAEngineInstance: FriendETAEngine | null = null;

export function getFriendETAEngine(): FriendETAEngine {
  if (!friendETAEngineInstance) {
    friendETAEngineInstance = new FriendETAEngine();
  }
  return friendETAEngineInstance;
}

export default getFriendETAEngine;
