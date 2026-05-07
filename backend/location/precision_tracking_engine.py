"""
PATHMAP V94 - PRECISION TRACKING ENGINE

State-of-the-art multi-sensor fusion tracking system using:
- Extended Kalman Filter for GPS/compass/accelerometer fusion
- Self-calibrating magnetic declination correction
- Dead reckoning when GPS signal is weak
- Satellite constellation quality analysis
- Predictive position smoothing
"""

from typing import Optional, Dict, List, Tuple, Any, Callable
from dataclasses import dataclass, field
import time
import math


@dataclass
class SensorReading:
    """Raw sensor data packet"""
    timestamp: float
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    gps_accuracy: Optional[float] = None
    gps_altitude: Optional[float] = None
    gps_speed: Optional[float] = None
    gps_heading: Optional[float] = None
    compass_heading: Optional[float] = None
    compass_accuracy: Optional[float] = None
    accel_x: Optional[float] = None
    accel_y: Optional[float] = None
    accel_z: Optional[float] = None
    gyro_alpha: Optional[float] = None
    gyro_beta: Optional[float] = None
    gyro_gamma: Optional[float] = None
    satellite_count: Optional[int] = None
    hdop: Optional[float] = None  # Horizontal Dilution of Precision


@dataclass
class KalmanState:
    """Kalman filter state vector"""
    lat: float = 0.0
    lon: float = 0.0
    velocity_north: float = 0.0
    velocity_east: float = 0.0
    heading: float = 0.0
    heading_rate: float = 0.0
    
    # Covariance matrix diagonal (simplified)
    p_lat: float = 100.0
    p_lon: float = 100.0
    p_vel_n: float = 10.0
    p_vel_e: float = 10.0
    p_heading: float = 30.0
    p_heading_rate: float = 5.0


@dataclass
class TrackedPosition:
    """Final fused position output"""
    latitude: float
    longitude: float
    heading: float
    speed: float
    accuracy: float
    heading_accuracy: float
    altitude: Optional[float]
    timestamp: float
    confidence: float  # 0-1
    source_quality: str  # excellent, good, fair, poor, dead_reckoning
    is_predicted: bool
    calibration_applied: bool
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "latitude": self.latitude,
            "longitude": self.longitude,
            "heading": self.heading,
            "speed": self.speed,
            "accuracy": self.accuracy,
            "heading_accuracy": self.heading_accuracy,
            "altitude": self.altitude,
            "timestamp": self.timestamp,
            "confidence": self.confidence,
            "source_quality": self.source_quality,
            "is_predicted": self.is_predicted,
            "calibration_applied": self.calibration_applied
        }


def _empty_points_list() -> List[Dict[str, Any]]:
    """Factory function for typed empty list"""
    return []


@dataclass
class TrackingTrail:
    """Position trail for visualization"""
    points: List[Dict[str, Any]] = field(default_factory=_empty_points_list)
    max_points: int = 500
    smoothing_enabled: bool = True
    
    def add_point(self, lat: float, lon: float, heading: float, timestamp: float, accuracy: float) -> None:
        point: Dict[str, Any] = {
            "lat": lat,
            "lon": lon,
            "heading": heading,
            "timestamp": timestamp,
            "accuracy": accuracy
        }
        self.points.append(point)
        if len(self.points) > self.max_points:
            self.points.pop(0)
    
    def get_trail_polyline(self) -> List[List[float]]:
        """Get trail as coordinate array for map rendering"""
        return [[p["lat"], p["lon"]] for p in self.points]
    
    def get_smoothed_trail(self, window: int = 3) -> List[List[float]]:
        """Get smoothed trail using moving average"""
        if len(self.points) < window:
            return self.get_trail_polyline()
        
        smoothed: List[List[float]] = []
        for i in range(len(self.points)):
            start = max(0, i - window // 2)
            end = min(len(self.points), i + window // 2 + 1)
            window_points = self.points[start:end]
            avg_lat: float = sum(float(p["lat"]) for p in window_points) / (end - start)
            avg_lon: float = sum(float(p["lon"]) for p in window_points) / (end - start)
            smoothed.append([avg_lat, avg_lon])
        return smoothed


@dataclass
class CalibrationState:
    """Self-calibration parameters"""
    magnetic_declination: float = 0.0
    compass_offset: float = 0.0
    gps_offset_lat: float = 0.0
    gps_offset_lon: float = 0.0
    accelerometer_bias: List[float] = field(default_factory=lambda: [0.0, 0.0, 0.0])
    calibration_samples: int = 0
    last_calibration: float = 0.0
    is_calibrated: bool = False


class ExtendedKalmanFilter:
    """
    Extended Kalman Filter for GPS/IMU sensor fusion
    
    State vector: [lat, lon, vel_n, vel_e, heading, heading_rate]
    """
    
    def __init__(self):
        self.state = KalmanState()
        self.initialized = False
        self.last_update_time = 0.0
        
        # Process noise (tuned for pedestrian/vehicle tracking)
        self.q_position = 0.1
        self.q_velocity = 1.0
        self.q_heading = 0.5
        self.q_heading_rate = 0.1
        
        # Measurement noise
        self.r_gps_position = 5.0  # meters
        self.r_gps_velocity = 1.0  # m/s
        self.r_compass = 10.0  # degrees
        self.r_accelerometer = 0.5  # m/s^2
    
    def initialize(self, lat: float, lon: float, heading: float = 0.0):
        """Initialize filter with first measurement"""
        self.state.lat = lat
        self.state.lon = lon
        self.state.heading = heading
        self.state.velocity_north = 0.0
        self.state.velocity_east = 0.0
        self.state.heading_rate = 0.0
        self.initialized = True
        self.last_update_time = time.time()
    
    def predict(self, dt: float, accel_forward: float = 0.0, gyro_rate: float = 0.0):
        """
        Predict step using motion model
        
        Args:
            dt: Time delta in seconds
            accel_forward: Forward acceleration from accelerometer
            gyro_rate: Angular rate from gyroscope
        """
        if not self.initialized or dt <= 0:
            return
        
        # Earth radius for coordinate conversion
        EARTH_RADIUS = 6371000.0
        
        # Update velocities with acceleration
        heading_rad = math.radians(self.state.heading)
        if accel_forward != 0:
            self.state.velocity_north += accel_forward * math.cos(heading_rad) * dt
            self.state.velocity_east += accel_forward * math.sin(heading_rad) * dt
        
        # Update position from velocity
        d_lat = (self.state.velocity_north * dt) / EARTH_RADIUS
        d_lon = (self.state.velocity_east * dt) / (EARTH_RADIUS * math.cos(math.radians(self.state.lat)))
        
        self.state.lat += math.degrees(d_lat)
        self.state.lon += math.degrees(d_lon)
        
        # Update heading from gyroscope
        if gyro_rate != 0:
            self.state.heading_rate = gyro_rate
        self.state.heading += self.state.heading_rate * dt
        self.state.heading = self.state.heading % 360
        
        # Update covariance (simplified)
        self.state.p_lat += self.q_position * dt
        self.state.p_lon += self.q_position * dt
        self.state.p_vel_n += self.q_velocity * dt
        self.state.p_vel_e += self.q_velocity * dt
        self.state.p_heading += self.q_heading * dt
        self.state.p_heading_rate += self.q_heading_rate * dt
    
    def update_gps(self, lat: float, lon: float, accuracy: float, speed: Optional[float] = None, heading: Optional[float] = None):
        """
        Update step with GPS measurement
        
        Args:
            lat: GPS latitude
            lon: GPS longitude
            accuracy: GPS accuracy in meters
            speed: GPS reported speed
            heading: GPS reported heading
        """
        if not self.initialized:
            self.initialize(lat, lon, heading or 0.0)
            return
        
        # Adaptive measurement noise based on accuracy
        r_pos = max(accuracy, self.r_gps_position)
        
        # Kalman gain (simplified)
        k_lat = self.state.p_lat / (self.state.p_lat + r_pos)
        k_lon = self.state.p_lon / (self.state.p_lon + r_pos)
        
        # Innovation (measurement residual)
        innov_lat = lat - self.state.lat
        innov_lon = lon - self.state.lon
        
        # State update
        self.state.lat += k_lat * innov_lat
        self.state.lon += k_lon * innov_lon
        
        # Covariance update
        self.state.p_lat *= (1 - k_lat)
        self.state.p_lon *= (1 - k_lon)
        
        # Update velocity from speed/heading if available
        if speed is not None and heading is not None:
            heading_rad = math.radians(heading)
            measured_vel_n = speed * math.cos(heading_rad)
            measured_vel_e = speed * math.sin(heading_rad)
            
            k_vel = 0.5  # Fixed gain for velocity
            self.state.velocity_north += k_vel * (measured_vel_n - self.state.velocity_north)
            self.state.velocity_east += k_vel * (measured_vel_e - self.state.velocity_east)
            
            # Update heading from GPS course
            k_heading = self.state.p_heading / (self.state.p_heading + self.r_compass * 2)
            heading_diff = self._angle_diff(heading, self.state.heading)
            self.state.heading += k_heading * heading_diff
            self.state.heading = self.state.heading % 360
            self.state.p_heading *= (1 - k_heading)
    
    def update_compass(self, heading: float, accuracy: float = 15.0):
        """
        Update step with compass measurement
        
        Args:
            heading: Compass heading in degrees
            accuracy: Compass accuracy in degrees
        """
        if not self.initialized:
            return
        
        r_compass = max(accuracy, self.r_compass)
        k_heading = self.state.p_heading / (self.state.p_heading + r_compass)
        
        heading_diff = self._angle_diff(heading, self.state.heading)
        self.state.heading += k_heading * heading_diff
        self.state.heading = self.state.heading % 360
        self.state.p_heading *= (1 - k_heading)
    
    def update_accelerometer(self, accel_forward: float, accel_lateral: float):
        """
        Update step with accelerometer measurement
        
        Args:
            accel_forward: Forward acceleration in m/s^2
            accel_lateral: Lateral acceleration in m/s^2
        """
        if not self.initialized:
            return
        
        # Use accelerometer to refine heading rate estimate
        if abs(self.state.velocity_north) > 0.5 or abs(self.state.velocity_east) > 0.5:
            speed = math.sqrt(self.state.velocity_north**2 + self.state.velocity_east**2)
            if speed > 0.1:
                # Centripetal acceleration gives turning rate
                turning_rate = math.degrees(accel_lateral / speed) if speed > 0 else 0
                k_rate = 0.3
                self.state.heading_rate += k_rate * (turning_rate - self.state.heading_rate)
    
    def get_state(self) -> Tuple[float, float, float, float]:
        """Get current estimated position and heading"""
        speed = math.sqrt(self.state.velocity_north**2 + self.state.velocity_east**2)
        return self.state.lat, self.state.lon, self.state.heading, speed
    
    def get_accuracy(self) -> Tuple[float, float]:
        """Get position and heading accuracy estimates"""
        pos_accuracy = math.sqrt(self.state.p_lat + self.state.p_lon) * 111000  # Convert to meters
        heading_accuracy = math.sqrt(self.state.p_heading)
        return pos_accuracy, heading_accuracy
    
    def _angle_diff(self, a1: float, a2: float) -> float:
        """Calculate smallest angle difference"""
        diff = a1 - a2
        while diff > 180:
            diff -= 360
        while diff < -180:
            diff += 360
        return diff


class PrecisionTrackingEngine:
    """
    State-of-the-art tracking system with:
    - Multi-sensor Kalman fusion
    - Self-calibrating compass correction
    - Dead reckoning during GPS dropout
    - Trail visualization
    - Predictive smoothing
    """
    
    def __init__(self):
        self.kalman = ExtendedKalmanFilter()
        self.calibration = CalibrationState()
        self.trail = TrackingTrail()
        
        self.is_tracking = False
        self.last_gps_time = 0.0
        self.last_update_time = 0.0
        self.gps_dropout_threshold = 5.0  # seconds
        self.update_rate_hz = 20
        
        self.position_history: List[TrackedPosition] = []
        self.max_history = 1000
        
        self.subscribers: List[Callable[[TrackedPosition], None]] = []
        
        # Quality metrics
        self.gps_fix_count = 0
        self.dead_reckoning_count = 0
        self.total_distance = 0.0
        self.session_start_time = 0.0
    
    def start_tracking(self) -> Dict[str, Any]:
        """Start precision tracking session"""
        if self.is_tracking:
            return {"status": "already_active", "message": "Tracking already running"}
        
        self.is_tracking = True
        self.session_start_time = time.time()
        self.gps_fix_count = 0
        self.dead_reckoning_count = 0
        self.total_distance = 0.0
        self.trail = TrackingTrail()
        self.position_history = []
        
        return {
            "status": "started",
            "message": "Precision tracking started",
            "update_rate": self.update_rate_hz,
            "calibration_status": "pending" if not self.calibration.is_calibrated else "calibrated"
        }
    
    def stop_tracking(self) -> Dict[str, Any]:
        """Stop tracking and return session stats"""
        if not self.is_tracking:
            return {"status": "not_active", "message": "Tracking not running"}
        
        self.is_tracking = False
        session_duration = time.time() - self.session_start_time
        
        return {
            "status": "stopped",
            "session_duration": session_duration,
            "gps_fixes": self.gps_fix_count,
            "dead_reckoning_updates": self.dead_reckoning_count,
            "total_distance_meters": self.total_distance,
            "trail_points": len(self.trail.points),
            "calibration_samples": self.calibration.calibration_samples
        }
    
    def process_sensor_reading(self, reading: SensorReading) -> Optional[TrackedPosition]:
        """
        Process incoming sensor data and produce fused position
        
        Args:
            reading: Raw sensor data from device
            
        Returns:
            Fused position or None if not tracking
        """
        if not self.is_tracking:
            return None
        
        now = reading.timestamp or time.time()
        dt = now - self.last_update_time if self.last_update_time > 0 else 0.05
        self.last_update_time = now
        
        # Run Kalman predict step
        accel_forward = 0.0
        gyro_rate = 0.0
        
        if reading.accel_x is not None and reading.accel_y is not None:
            # Transform to forward/lateral (assuming phone held upright)
            accel_forward = reading.accel_y
        
        if reading.gyro_alpha is not None:
            gyro_rate = reading.gyro_alpha
        
        self.kalman.predict(dt, accel_forward, gyro_rate)
        
        # GPS update
        has_gps = reading.gps_lat is not None and reading.gps_lon is not None
        is_dead_reckoning = False
        source_quality = "poor"
        
        if has_gps and reading.gps_accuracy is not None:
            # Apply calibration offset (gps_lat/lon verified non-None by has_gps check)
            corrected_lat: float = (reading.gps_lat or 0.0) + self.calibration.gps_offset_lat
            corrected_lon: float = (reading.gps_lon or 0.0) + self.calibration.gps_offset_lon
            
            self.kalman.update_gps(
                corrected_lat,
                corrected_lon,
                reading.gps_accuracy,
                reading.gps_speed,
                reading.gps_heading
            )
            self.last_gps_time = now
            self.gps_fix_count += 1
            
            # Determine quality from accuracy and HDOP
            if reading.gps_accuracy < 5:
                source_quality = "excellent"
            elif reading.gps_accuracy < 15:
                source_quality = "good"
            elif reading.gps_accuracy < 30:
                source_quality = "fair"
            else:
                source_quality = "poor"
            
            # Run self-calibration if compass available
            if reading.compass_heading is not None and reading.gps_heading is not None:
                self._update_compass_calibration(reading.compass_heading, reading.gps_heading)
        
        elif (now - self.last_gps_time) > self.gps_dropout_threshold:
            # Dead reckoning mode
            is_dead_reckoning = True
            source_quality = "dead_reckoning"
            self.dead_reckoning_count += 1
        
        # Compass update with calibration
        if reading.compass_heading is not None:
            corrected_heading = (reading.compass_heading + self.calibration.compass_offset + self.calibration.magnetic_declination) % 360
            accuracy = reading.compass_accuracy if reading.compass_accuracy else 15.0
            self.kalman.update_compass(corrected_heading, accuracy)
        
        # Accelerometer update
        if reading.accel_x is not None and reading.accel_y is not None:
            # Apply bias correction
            corrected_x = reading.accel_x - self.calibration.accelerometer_bias[0]
            corrected_y = reading.accel_y - self.calibration.accelerometer_bias[1]
            self.kalman.update_accelerometer(corrected_y, corrected_x)
        
        # Get fused result
        lat, lon, heading, speed = self.kalman.get_state()
        pos_accuracy, heading_accuracy = self.kalman.get_accuracy()
        
        # Calculate confidence (0-1)
        confidence = self._calculate_confidence(
            pos_accuracy,
            heading_accuracy,
            is_dead_reckoning,
            reading.satellite_count,
            reading.hdop
        )
        
        # Create output position
        position = TrackedPosition(
            latitude=lat,
            longitude=lon,
            heading=heading,
            speed=speed,
            accuracy=min(pos_accuracy, 1000),  # Cap at 1km
            heading_accuracy=min(heading_accuracy, 180),
            altitude=reading.gps_altitude,
            timestamp=now,
            confidence=confidence,
            source_quality=source_quality,
            is_predicted=is_dead_reckoning,
            calibration_applied=self.calibration.is_calibrated
        )
        
        # Update trail
        self.trail.add_point(lat, lon, heading, now, pos_accuracy)
        
        # Update distance
        if len(self.position_history) > 0:
            prev = self.position_history[-1]
            dist = self._haversine_distance(prev.latitude, prev.longitude, lat, lon)
            if dist < 100:  # Ignore jumps > 100m
                self.total_distance += dist
        
        # Store in history
        self.position_history.append(position)
        if len(self.position_history) > self.max_history:
            self.position_history.pop(0)
        
        # Notify subscribers
        self._notify_subscribers(position)
        
        return position
    
    def _update_compass_calibration(self, compass_heading: float, gps_heading: float) -> None:
        """Update compass calibration from GPS course"""
        # gps_heading is always float per signature, no None check needed
        
        # Only calibrate when moving (GPS heading is valid)
        current_speed = math.sqrt(
            self.kalman.state.velocity_north**2 + 
            self.kalman.state.velocity_east**2
        )
        if current_speed < 1.0:  # Need at least 1 m/s for reliable GPS heading
            return
        
        # Calculate offset
        offset = self._angle_diff(gps_heading, compass_heading)
        
        # Exponential moving average
        alpha = 0.1
        self.calibration.compass_offset = (
            (1 - alpha) * self.calibration.compass_offset + 
            alpha * offset
        )
        self.calibration.calibration_samples += 1
        
        if self.calibration.calibration_samples >= 10:
            self.calibration.is_calibrated = True
            self.calibration.last_calibration = time.time()
    
    def _calculate_confidence(
        self,
        pos_accuracy: float,
        heading_accuracy: float,
        is_dead_reckoning: bool,
        satellite_count: Optional[int],
        hdop: Optional[float]
    ) -> float:
        """Calculate overall tracking confidence"""
        confidence = 1.0
        
        # Position accuracy factor
        if pos_accuracy < 5:
            confidence *= 1.0
        elif pos_accuracy < 15:
            confidence *= 0.9
        elif pos_accuracy < 30:
            confidence *= 0.7
        elif pos_accuracy < 50:
            confidence *= 0.5
        else:
            confidence *= 0.3
        
        # Dead reckoning penalty
        if is_dead_reckoning:
            confidence *= 0.5
        
        # Satellite count factor
        if satellite_count is not None:
            if satellite_count >= 8:
                confidence *= 1.0
            elif satellite_count >= 5:
                confidence *= 0.9
            elif satellite_count >= 3:
                confidence *= 0.7
            else:
                confidence *= 0.5
        
        # HDOP factor (lower is better)
        if hdop is not None:
            if hdop < 1.0:
                confidence *= 1.0
            elif hdop < 2.0:
                confidence *= 0.95
            elif hdop < 5.0:
                confidence *= 0.8
            else:
                confidence *= 0.6
        
        # Heading accuracy factor
        if heading_accuracy < 10:
            confidence *= 1.0
        elif heading_accuracy < 30:
            confidence *= 0.9
        else:
            confidence *= 0.7
        
        return min(max(confidence, 0.0), 1.0)
    
    def _angle_diff(self, a1: float, a2: float) -> float:
        """Calculate smallest angle difference"""
        diff = a1 - a2
        while diff > 180:
            diff -= 360
        while diff < -180:
            diff += 360
        return diff
    
    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two points in meters"""
        R = 6371000
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        d_phi = math.radians(lat2 - lat1)
        d_lambda = math.radians(lon2 - lon1)
        
        a = math.sin(d_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        return R * c
    
    def get_trail(self, smoothed: bool = True) -> List[List[float]]:
        """Get tracking trail for map visualization"""
        if smoothed:
            return self.trail.get_smoothed_trail()
        return self.trail.get_trail_polyline()
    
    def get_current_position(self) -> Optional[TrackedPosition]:
        """Get latest tracked position"""
        if len(self.position_history) > 0:
            return self.position_history[-1]
        return None
    
    def get_tracking_stats(self) -> Dict[str, Any]:
        """Get current tracking statistics"""
        return {
            "is_tracking": self.is_tracking,
            "gps_fixes": self.gps_fix_count,
            "dead_reckoning_updates": self.dead_reckoning_count,
            "total_distance_meters": self.total_distance,
            "trail_points": len(self.trail.points),
            "calibration": {
                "is_calibrated": self.calibration.is_calibrated,
                "compass_offset": self.calibration.compass_offset,
                "magnetic_declination": self.calibration.magnetic_declination,
                "samples": self.calibration.calibration_samples
            },
            "kalman_state": {
                "position_variance": self.kalman.state.p_lat + self.kalman.state.p_lon,
                "heading_variance": self.kalman.state.p_heading
            }
        }
    
    def set_magnetic_declination(self, declination: float):
        """Set magnetic declination for compass correction"""
        self.calibration.magnetic_declination = declination
    
    def reset_calibration(self):
        """Reset calibration to defaults"""
        self.calibration = CalibrationState()
        self.kalman = ExtendedKalmanFilter()
    
    def subscribe(self, callback: Callable[[TrackedPosition], None]) -> None:
        """Subscribe to position updates"""
        self.subscribers.append(callback)
    
    def unsubscribe(self, callback: Callable[[TrackedPosition], None]) -> None:
        """Unsubscribe from position updates"""
        if callback in self.subscribers:
            self.subscribers.remove(callback)
    
    def _notify_subscribers(self, position: TrackedPosition):
        """Notify all subscribers of new position"""
        for callback in self.subscribers:
            try:
                callback(position)
            except Exception as e:
                print(f"[PTE] Subscriber error: {e}")


# Global instance
_precision_tracking_engine: Optional[PrecisionTrackingEngine] = None


def get_precision_tracking_engine() -> PrecisionTrackingEngine:
    """Get global PrecisionTrackingEngine instance"""
    global _precision_tracking_engine
    if _precision_tracking_engine is None:
        _precision_tracking_engine = PrecisionTrackingEngine()
    return _precision_tracking_engine
