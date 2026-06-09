"""
PATHFINDER V54 — ALWAYS-ON LIVE LOCATION (AOLL)
===============================================

Philosophy:
    If permission exists, tracking is ALWAYS active.
    No toggle switches. No manual start/stop.
    Automatic, continuous, reliable.
    
Behavior:
    - watchPosition starts immediately when permission granted
    - Updates continuously with accuracy smoothing
    - Auto-resumes after app comes back from background
    - Stops silently if permission revoked
    - No UI controls (fully automatic)
    
Integration with V49:
    Uses accuracy smoothing from RLE (Real Location Engine)
    Maintains compatibility with existing location tracking
"""

from typing import Optional, Dict, Callable
from datetime import datetime
import asyncio


class AlwaysOnLiveLocation:
    """
    Always-On Live Location Engine
    
    Responsibilities:
        - Start watchPosition automatically when permission exists
        - Continuously update position
        - Apply accuracy smoothing
        - Handle permission revocation gracefully
        - Resume tracking after app pause
        - Update ETA, speed, distance during routing
    """
    
    def __init__(self):
        self.tracking_active: bool = False
        self.permission_granted: bool = False
        self.watch_id: Optional[str] = None
        # Monotonic counter so each watch id is unique even when two starts land
        # in the same clock tick (timestamp resolution alone is not enough).
        self._watch_seq: int = 0
        self.last_position: Optional[Dict] = None
        self.position_callbacks: list[Callable] = []
        self.error_callbacks: list[Callable] = []
        self.watch_task: Optional[asyncio.Task] = None
        
        # Accuracy smoothing (V49 compatibility)
        self.position_history: list[Dict] = []
        self.max_history_size = 10
        
    def can_start_tracking(self) -> bool:
        """
        Check if tracking can be started
        
        Returns:
            True if permission is granted
        """
        return self.permission_granted and not self.tracking_active
    
    def start_tracking(self) -> Dict:
        """
        Start always-on live location tracking
        
        Returns:
            Tracking status
        """
        if not self.permission_granted:
            return {
                "success": False,
                "error": "permission_required",
                "message": "Location permission not granted"
            }
        
        if self.tracking_active:
            return {
                "success": True,
                "message": "Tracking already active",
                "watch_id": self.watch_id
            }
        
        self.tracking_active = True
        self._watch_seq += 1
        self.watch_id = f"watch_{datetime.utcnow().timestamp()}_{self._watch_seq}"
        
        return {
            "success": True,
            "message": "Live location tracking started",
            "watch_id": self.watch_id,
            "mode": "always_on",
            "features": [
                "continuous_updates",
                "accuracy_smoothing",
                "heading_tracking",
                "speed_calculation",
                "eta_updates"
            ]
        }
    
    def stop_tracking(self, reason: str = "user_request") -> Dict:
        """
        Stop live location tracking
        
        Args:
            reason: Reason for stopping
            
        Returns:
            Stop status
        """
        if not self.tracking_active:
            return {
                "success": False,
                "message": "Tracking not active"
            }
        
        self.tracking_active = False
        old_watch_id = self.watch_id
        self.watch_id = None
        
        return {
            "success": True,
            "message": f"Tracking stopped: {reason}",
            "watch_id": old_watch_id,
            "reason": reason
        }
    
    def update_position(
        self,
        latitude: float,
        longitude: float,
        accuracy: float,
        heading: Optional[float] = None,
        speed: Optional[float] = None,
        altitude: Optional[float] = None,
        altitude_accuracy: Optional[float] = None
    ) -> Dict:
        """
        Update current position with accuracy smoothing
        
        Args:
            latitude: Current latitude
            longitude: Current longitude
            accuracy: GPS accuracy in meters
            heading: Current heading in degrees
            speed: Current speed in m/s
            altitude: Current altitude in meters
            altitude_accuracy: Altitude accuracy in meters
            
        Returns:
            Smoothed position update
        """
        if not self.tracking_active:
            return {
                "success": False,
                "error": "tracking_not_active"
            }
        
        raw_position = {
            "latitude": latitude,
            "longitude": longitude,
            "accuracy": accuracy,
            "heading": heading,
            "speed": speed,
            "altitude": altitude,
            "altitude_accuracy": altitude_accuracy,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        
        # Apply accuracy smoothing
        smoothed_position = self._apply_smoothing(raw_position)
        
        # Update history
        self.position_history.append(smoothed_position)
        if len(self.position_history) > self.max_history_size:
            self.position_history = self.position_history[-self.max_history_size:]
        
        # Update last position
        self.last_position = smoothed_position
        
        # Notify callbacks
        self._notify_position_callbacks(smoothed_position)
        
        return {
            "success": True,
            "position": smoothed_position,
            "smoothing_applied": True,
            "history_size": len(self.position_history)
        }
    
    def _apply_smoothing(self, position: Dict) -> Dict:
        """
        Apply accuracy smoothing using position history
        
        Args:
            position: Raw position data
            
        Returns:
            Smoothed position data
        """
        if len(self.position_history) < 3:
            # Not enough history for smoothing
            return position
        
        # Weight positions by accuracy (better accuracy = higher weight)
        recent_positions = self.position_history[-5:] + [position]
        
        weights = []
        for p in recent_positions:
            # Inverse accuracy as weight (better accuracy = lower value = higher weight)
            weight = 1.0 / max(p["accuracy"], 1.0)
            weights.append(weight)
        
        total_weight = sum(weights)
        
        # Weighted average for latitude and longitude
        smoothed_lat = sum(p["latitude"] * w for p, w in zip(recent_positions, weights)) / total_weight
        smoothed_lon = sum(p["longitude"] * w for p, w in zip(recent_positions, weights)) / total_weight
        
        # Use best (lowest) accuracy from recent positions
        smoothed_accuracy = min(p["accuracy"] for p in recent_positions)
        
        return {
            "latitude": smoothed_lat,
            "longitude": smoothed_lon,
            "accuracy": smoothed_accuracy,
            "heading": position["heading"],  # Keep original heading
            "speed": position["speed"],      # Keep original speed
            "altitude": position["altitude"],
            "altitude_accuracy": position["altitude_accuracy"],
            "timestamp": position["timestamp"],
            "smoothed": True
        }
    
    def register_position_callback(self, callback: Callable):
        """Register callback for position updates"""
        self.position_callbacks.append(callback)
    
    def register_error_callback(self, callback: Callable):
        """Register callback for errors"""
        self.error_callbacks.append(callback)
    
    def _notify_position_callbacks(self, position: Dict):
        """Notify all position callbacks"""
        for callback in self.position_callbacks:
            try:
                callback(position)
            except Exception as e:
                print(f"[AOLL] Position callback error: {e}")
    
    def _notify_error_callbacks(self, error: Dict):
        """Notify all error callbacks"""
        for callback in self.error_callbacks:
            try:
                callback(error)
            except Exception as e:
                print(f"[AOLL] Error callback error: {e}")
    
    def grant_permission(self) -> Dict:
        """
        Grant location permission and auto-start tracking
        
        Returns:
            Permission and tracking status
        """
        self.permission_granted = True
        
        # Auto-start tracking (always-on behavior)
        return self.start_tracking()
    
    def revoke_permission(self) -> Dict:
        """
        Revoke location permission and stop tracking
        
        Returns:
            Revocation status
        """
        self.permission_granted = False
        
        # Auto-stop tracking
        stop_result = self.stop_tracking(reason="permission_revoked")
        
        return {
            "permission_revoked": True,
            "tracking_stopped": stop_result["success"],
            "message": "Location permission revoked - tracking stopped"
        }
    
    def handle_app_resume(self) -> Dict:
        """
        Handle app resuming from background.

        A watchPosition handle is commonly killed while the app is backgrounded,
        yet our `tracking_active` flag can still read True (we never observed a
        stop). So on resume, if permission is still granted we ALWAYS re-establish
        a fresh watch rather than trusting the stale flag. The last known position
        is preserved so the UI never blanks during the transition.

        Returns:
            Resume status including whether tracking was resumed and the new watch id.
        """
        if not self.permission_granted:
            return {
                "success": True,
                "message": "App resumed (no permission)",
                "tracking_active": False,
                "resumed": False,
            }

        was_active = self.tracking_active
        # Clear the (possibly stale) flag so start_tracking issues a fresh watch.
        self.tracking_active = False
        start_result = self.start_tracking()

        return {
            "success": start_result.get("success", False),
            "message": "App resumed",
            "tracking_active": self.tracking_active,
            "resumed": True,
            "was_active": was_active,
            "watch_id": self.watch_id,
        }
    
    def get_status(self) -> Dict:
        """
        Get current tracking status
        
        Returns:
            Complete status object
        """
        return {
            "tracking_active": self.tracking_active,
            "permission_granted": self.permission_granted,
            "watch_id": self.watch_id,
            "last_position": self.last_position,
            "position_history_size": len(self.position_history),
            "callbacks_registered": {
                "position": len(self.position_callbacks),
                "error": len(self.error_callbacks)
            }
        }


# Global instance
_always_on_live_location: Optional[AlwaysOnLiveLocation] = None


def get_always_on_live_location() -> AlwaysOnLiveLocation:
    """Get global AlwaysOnLiveLocation instance"""
    global _always_on_live_location
    if _always_on_live_location is None:
        _always_on_live_location = AlwaysOnLiveLocation()
    return _always_on_live_location
