"""
PATHFINDER V54 — TRUST-BASED LOCATION FLOW (TLF)
=================================================

Philosophy:
    Users are NEVER forced to grant location permission.
    The app works with or without GPS.
    Permission is optional, not mandatory.
    
Flow:
    1. User opens app → modal appears (optional)
    2. [Allow Location] → request permission immediately
    3. [Enter Without Location] → proceed without GPS (no penalty)
    4. If permission denied → app continues in Exploration Mode
    5. No toggles, no hints, no forced blocking
    
Trust Model:
    - Respect user choice
    - Never block navigation
    - Silent auto-recalibration
    - Always-on tracking when permission exists
"""

from typing import Optional, Dict, Literal
from datetime import datetime
from pydantic import BaseModel


class LocationPermissionState(BaseModel):
    """Track location permission state"""
    status: Literal["granted", "denied", "prompt", "unknown"]
    timestamp: str
    user_action: Optional[Literal["allow", "skip", "clear"]] = None
    accuracy: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class TrustLocationFlow:
    """
    Trust-Based Location Flow Engine
    
    Responsibilities:
        - Track permission state
        - Handle user choice (allow/skip/clear)
        - Never force permission
        - Support exploration mode (no GPS)
        - Enable silent recalibration
    """
    
    def __init__(self):
        self.permission_state: Optional[LocationPermissionState] = None
        self.exploration_mode: bool = False
        self.last_location: Optional[Dict] = None
        self.tracking_active: bool = False
        
    def handle_user_choice(
        self,
        choice: Literal["allow", "skip", "clear"]
    ) -> Dict:
        """
        Handle user's location permission choice
        
        Args:
            choice: User action (allow/skip/clear)
            
        Returns:
            Response with next action and UI state
        """
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        if choice == "allow":
            # User chose to enable location
            return {
                "action": "request_permission",
                "exploration_mode": False,
                "message": "Requesting location permission...",
                "timestamp": timestamp,
                "next_step": "wait_for_permission_result"
            }
            
        elif choice == "skip":
            # User chose to enter without location
            self.exploration_mode = True
            return {
                "action": "enter_exploration_mode",
                "exploration_mode": True,
                "message": "Entering without location - explore mode active",
                "timestamp": timestamp,
                "next_step": "load_app"
            }
            
        elif choice == "clear":
            # User dismissed modal without choosing
            self.exploration_mode = True
            return {
                "action": "clear_modal",
                "exploration_mode": True,
                "message": "Location modal cleared",
                "timestamp": timestamp,
                "next_step": "load_app"
            }
        
        return {
            "action": "error",
            "message": "Invalid choice",
            "timestamp": timestamp
        }
    
    def update_permission_state(
        self,
        status: Literal["granted", "denied", "prompt"],
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        accuracy: Optional[float] = None
    ) -> LocationPermissionState:
        """
        Update permission state after browser response
        
        Args:
            status: Permission status from browser
            latitude: Current latitude (if granted)
            longitude: Current longitude (if granted)
            accuracy: GPS accuracy in meters (if granted)
            
        Returns:
            Updated permission state
        """
        self.permission_state = LocationPermissionState(
            status=status,
            timestamp=datetime.utcnow().isoformat() + "Z",
            latitude=latitude,
            longitude=longitude,
            accuracy=accuracy
        )
        
        if status == "granted":
            self.exploration_mode = False
            self.tracking_active = True
        elif status == "denied":
            self.exploration_mode = True
            self.tracking_active = False
            
        return self.permission_state
    
    def should_show_modal(self) -> bool:
        """
        Determine if location modal should be shown
        
        Returns:
            True if modal should appear (first launch only)
        """
        # Only show on first launch or if explicitly requested
        # Never force it after user has made a choice
        return self.permission_state is None
    
    def can_track_location(self) -> bool:
        """
        Check if location tracking is available
        
        Returns:
            True if permission is granted
        """
        if self.permission_state is None:
            return False
        return self.permission_state.status == "granted"
    
    def get_current_state(self) -> Dict:
        """
        Get current state for UI
        
        Returns:
            Complete state object
        """
        return {
            "permission_state": self.permission_state.model_dump() if self.permission_state else None,
            "exploration_mode": self.exploration_mode,
            "tracking_active": self.tracking_active,
            "last_location": self.last_location,
            "modal_required": self.should_show_modal()
        }
    
    def enter_exploration_mode(self) -> Dict:
        """
        Explicitly enter exploration mode (no GPS)
        
        Returns:
            Exploration mode configuration
        """
        self.exploration_mode = True
        self.tracking_active = False
        
        return {
            "mode": "exploration",
            "features_available": [
                "map_viewing",
                "route_planning",
                "landmark_search",
                "offline_maps"
            ],
            "features_disabled": [
                "live_location",
                "navigation",
                "eta_updates"
            ],
            "message": "Exploration mode active - enter locations manually"
        }
    
    def enable_tracking(self, latitude: float, longitude: float, accuracy: float) -> Dict:
        """
        Enable live tracking with permission
        
        Args:
            latitude: Current latitude
            longitude: Current longitude
            accuracy: GPS accuracy in meters
            
        Returns:
            Tracking state
        """
        self.tracking_active = True
        self.exploration_mode = False
        self.last_location = {
            "latitude": latitude,
            "longitude": longitude,
            "accuracy": accuracy,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        
        self.update_permission_state(
            status="granted",
            latitude=latitude,
            longitude=longitude,
            accuracy=accuracy
        )
        
        return {
            "tracking_active": True,
            "location": self.last_location,
            "message": "Live location tracking enabled"
        }


# Global instance
_trust_location_flow: Optional[TrustLocationFlow] = None


def get_trust_location_flow() -> TrustLocationFlow:
    """Get global TrustLocationFlow instance"""
    global _trust_location_flow
    if _trust_location_flow is None:
        _trust_location_flow = TrustLocationFlow()
    return _trust_location_flow
