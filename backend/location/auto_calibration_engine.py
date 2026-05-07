"""
PATHFINDER V54 — AUTO-CALIBRATION ENGINE v2 (ACE v2)
====================================================

Purpose:
    Silent, automatic location refresh and map calibration.
    No popups, no user intervention, continuous accuracy improvement.
    
Features:
    - 30-minute periodic refresh cycle
    - App resume detection (when user returns)
    - Silent recalibration (no UI interruption)
    - Movement-based recalibration (>15m movement)
    - Accuracy improvement detection
    - Heading change detection
    
Philosophy:
    The user should never notice calibration happening.
    The map should always be accurate and up-to-date.
    No manual actions required.
"""

from typing import Optional, Dict, Tuple
from datetime import datetime, timedelta
import math
import asyncio
from dataclasses import dataclass


@dataclass
class CalibrationPoint:
    """Single calibration data point"""
    latitude: float
    longitude: float
    accuracy: float
    heading: Optional[float]
    speed: Optional[float]
    timestamp: str
    

class AutoCalibrationEngine:
    """
    Auto-Calibration Engine v2
    
    Responsibilities:
        - Refresh location every 30 minutes
        - Detect app resume from background
        - Recalibrate on significant movement
        - Improve accuracy silently
        - Update map positioning automatically
    """
    
    REFRESH_INTERVAL_SECONDS = 1800  # 30 minutes
    MOVEMENT_THRESHOLD_METERS = 15.0  # Significant movement
    ACCURACY_IMPROVEMENT_THRESHOLD = 5.0  # meters
    HEADING_CHANGE_THRESHOLD = 30.0  # degrees
    
    def __init__(self):
        self.last_calibration: Optional[CalibrationPoint] = None
        self.last_refresh_time: Optional[datetime] = None
        self.calibration_history: list[CalibrationPoint] = []
        self.app_paused: bool = False
        self.calibration_task: Optional[asyncio.Task] = None
        
    def should_calibrate(
        self,
        latitude: float,
        longitude: float,
        accuracy: float,
        heading: Optional[float] = None
    ) -> Tuple[bool, str]:
        """
        Determine if calibration should run
        
        Args:
            latitude: Current latitude
            longitude: Current longitude
            accuracy: GPS accuracy in meters
            heading: Current heading in degrees
            
        Returns:
            (should_calibrate, reason)
        """
        now = datetime.utcnow()
        
        # First calibration
        if self.last_calibration is None:
            return True, "initial_calibration"
        
        # Time-based refresh (30 minutes)
        if self.last_refresh_time is None or \
           (now - self.last_refresh_time).total_seconds() >= self.REFRESH_INTERVAL_SECONDS:
            return True, "periodic_refresh"
        
        # App resume detection
        if self.app_paused:
            self.app_paused = False
            return True, "app_resume"
        
        # Movement-based calibration
        distance = self._calculate_distance(
            self.last_calibration.latitude,
            self.last_calibration.longitude,
            latitude,
            longitude
        )
        if distance > self.MOVEMENT_THRESHOLD_METERS:
            return True, f"movement_{int(distance)}m"
        
        # Accuracy improvement
        if accuracy < (self.last_calibration.accuracy - self.ACCURACY_IMPROVEMENT_THRESHOLD):
            return True, f"accuracy_improved_{int(self.last_calibration.accuracy - accuracy)}m"
        
        # Heading change
        if heading is not None and self.last_calibration.heading is not None:
            heading_diff = abs(heading - self.last_calibration.heading)
            if heading_diff > self.HEADING_CHANGE_THRESHOLD:
                return True, f"heading_change_{int(heading_diff)}deg"
        
        return False, "no_calibration_needed"
    
    def calibrate(
        self,
        latitude: float,
        longitude: float,
        accuracy: float,
        heading: Optional[float] = None,
        speed: Optional[float] = None
    ) -> Dict:
        """
        Perform calibration
        
        Args:
            latitude: Current latitude
            longitude: Current longitude
            accuracy: GPS accuracy in meters
            heading: Current heading in degrees
            speed: Current speed in m/s
            
        Returns:
            Calibration result with map update instructions
        """
        should_run, reason = self.should_calibrate(latitude, longitude, accuracy, heading)
        
        if not should_run:
            return {
                "calibrated": False,
                "reason": reason,
                "last_calibration": self.last_calibration.__dict__ if self.last_calibration else None
            }
        
        # Create calibration point
        calibration_point = CalibrationPoint(
            latitude=latitude,
            longitude=longitude,
            accuracy=accuracy,
            heading=heading,
            speed=speed,
            timestamp=datetime.utcnow().isoformat() + "Z"
        )
        
        # Update state
        self.last_calibration = calibration_point
        self.last_refresh_time = datetime.utcnow()
        self.calibration_history.append(calibration_point)
        
        # Keep only last 50 calibrations
        if len(self.calibration_history) > 50:
            self.calibration_history = self.calibration_history[-50:]
        
        # Calculate map adjustments
        map_update = self._calculate_map_update(calibration_point)
        
        return {
            "calibrated": True,
            "reason": reason,
            "calibration_point": {
                "latitude": latitude,
                "longitude": longitude,
                "accuracy": accuracy,
                "heading": heading,
                "speed": speed,
                "timestamp": calibration_point.timestamp
            },
            "map_update": map_update,
            "calibration_count": len(self.calibration_history)
        }
    
    def _calculate_map_update(self, point: CalibrationPoint) -> Dict:
        """
        Calculate map update instructions
        
        Args:
            point: Calibration point
            
        Returns:
            Map update configuration
        """
        # Determine zoom based on accuracy
        if point.accuracy < 10:
            zoom = 18  # Very precise
        elif point.accuracy < 50:
            zoom = 16  # Good accuracy
        elif point.accuracy < 100:
            zoom = 15  # Moderate accuracy
        else:
            zoom = 14  # Low accuracy
        
        return {
            "center": [point.latitude, point.longitude],
            "zoom": zoom,
            "heading": point.heading if point.heading is not None else 0,
            "animate": True,
            "duration_ms": 500
        }
    
    def _calculate_distance(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float
    ) -> float:
        """
        Calculate distance between two points using Haversine formula
        
        Args:
            lat1: Latitude of point 1
            lon1: Longitude of point 1
            lat2: Latitude of point 2
            lon2: Longitude of point 2
            
        Returns:
            Distance in meters
        """
        R = 6371000  # Earth radius in meters
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)
        
        a = math.sin(delta_lat / 2) ** 2 + \
            math.cos(lat1_rad) * math.cos(lat2_rad) * \
            math.sin(delta_lon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def notify_app_pause(self):
        """Notify engine that app went to background"""
        self.app_paused = True
    
    def notify_app_resume(self):
        """Notify engine that app returned from background"""
        self.app_paused = False
        # Next calibration will trigger due to app_paused flag
    
    async def start_periodic_refresh(self, callback):
        """
        Start periodic refresh task
        
        Args:
            callback: Async function to call for location refresh
        """
        async def refresh_loop():
            while True:
                await asyncio.sleep(self.REFRESH_INTERVAL_SECONDS)
                try:
                    await callback()
                except Exception as e:
                    print(f"[ACE v2] Periodic refresh error: {e}")
        
        self.calibration_task = asyncio.create_task(refresh_loop())
    
    def stop_periodic_refresh(self):
        """Stop periodic refresh task"""
        if self.calibration_task:
            self.calibration_task.cancel()
            self.calibration_task = None
    
    def get_statistics(self) -> Dict:
        """
        Get calibration statistics
        
        Returns:
            Statistics dictionary
        """
        if not self.calibration_history:
            return {
                "total_calibrations": 0,
                "average_accuracy": None,
                "best_accuracy": None,
                "worst_accuracy": None
            }
        
        accuracies = [p.accuracy for p in self.calibration_history]
        
        return {
            "total_calibrations": len(self.calibration_history),
            "average_accuracy": sum(accuracies) / len(accuracies),
            "best_accuracy": min(accuracies),
            "worst_accuracy": max(accuracies),
            "last_calibration": self.last_calibration.__dict__ if self.last_calibration else None,
            "time_since_last_refresh": (
                (datetime.utcnow() - self.last_refresh_time).total_seconds()
                if self.last_refresh_time else None
            )
        }


# Global instance
_auto_calibration_engine: Optional[AutoCalibrationEngine] = None


def get_auto_calibration_engine() -> AutoCalibrationEngine:
    """Get global AutoCalibrationEngine instance"""
    global _auto_calibration_engine
    if _auto_calibration_engine is None:
        _auto_calibration_engine = AutoCalibrationEngine()
    return _auto_calibration_engine
