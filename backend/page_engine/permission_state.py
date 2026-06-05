"""
PATHFINDER V46 — PERMISSION STATE MODEL (PSM)

Intelligent permission state tracking with browser-level block detection,
fallback modes, and universal error handling across all platforms.
"""

from enum import Enum
from dataclasses import dataclass
from typing import Optional, Dict
import time


class LocationPermissionState(Enum):
    """
    V46 Permission State Model (PSM)
    
    Distinguishes between different permission failure modes
    for intelligent fallback and user guidance.
    """
    # Unknown - initial state before any permission request
    UNKNOWN = "unknown"
    
    # Enabled - full GPS access granted
    LOCATION_ENABLED = "enabled"
    
    # Denied - user actively rejected permission popup
    LOCATION_DENIED = "denied"
    
    # Blocked - browser/OS blocks geolocation (no popup shown)
    LOCATION_BLOCKED = "blocked"
    
    # Unavailable - hardware/GPS temporarily not available
    LOCATION_UNAVAILABLE = "unavailable"
    
    # Restricted - allowed once but not persistent (iOS Safari)
    LOCATION_RESTRICTED = "restricted"
    
    # Skipped - user chose "Continue Without Location"
    LOCATION_SKIPPED = "skipped"


class GeolocationErrorCode(Enum):
    """Standard geolocation error codes"""
    PERMISSION_DENIED = 1
    POSITION_UNAVAILABLE = 2
    TIMEOUT = 3


@dataclass
class PermissionDiagnostics:
    """
    Diagnostic information for permission failures
    
    Used to generate appropriate user guidance and fallback behavior
    """
    state: LocationPermissionState
    error_code: Optional[int] = None
    error_message: Optional[str] = None
    browser: Optional[str] = None  # 'chrome', 'safari', 'firefox', etc.
    platform: Optional[str] = None  # 'android', 'ios', 'desktop'
    can_retry: bool = False
    retry_interval_seconds: int = 8
    show_settings_link: bool = False
    user_message: str = ""
    technical_details: str = ""
    timestamp: float = 0.0
    
    def __post_init__(self):
        if self.timestamp == 0.0:
            self.timestamp = time.time()
        
        # Auto-generate user-friendly messages
        if not self.user_message:
            self.user_message = self._generate_user_message()
        
        if not self.technical_details:
            self.technical_details = self._generate_technical_details()
    
    def _generate_user_message(self) -> str:
        """Generate minimal, user-friendly message"""
        messages = {
            LocationPermissionState.LOCATION_DENIED: "Location access was turned off.",
            LocationPermissionState.LOCATION_BLOCKED: "Location is blocked in your browser.",
            LocationPermissionState.LOCATION_UNAVAILABLE: "GPS signal not available right now.",
            LocationPermissionState.LOCATION_RESTRICTED: "Location allowed once. Enable permanently for full routing.",
            LocationPermissionState.LOCATION_ENABLED: "Location enabled successfully.",
            LocationPermissionState.LOCATION_SKIPPED: "Continuing without location.",
        }
        return messages.get(self.state, "Location status unknown.")
    
    def _generate_technical_details(self) -> str:
        """Generate technical context for diagnostics"""
        if self.error_code:
            error_names = {
                1: "PERMISSION_DENIED",
                2: "POSITION_UNAVAILABLE",
                3: "TIMEOUT"
            }
            return f"Error {self.error_code} ({error_names.get(self.error_code, 'UNKNOWN')})"
        return ""


class PermissionDetector:
    """
    V46 Smart Permission Detection
    
    Analyzes geolocation errors and browser behavior to determine
    the exact permission state and appropriate fallback mode.
    """
    
    @staticmethod
    def detect_from_error(
        error_code: int,
        browser: str = "unknown",
        platform: str = "unknown",
        popup_shown: bool = False
    ) -> PermissionDiagnostics:
        """
        Detect permission state from geolocation error
        
        Args:
            error_code: GeolocationPositionError.code (1, 2, or 3)
            browser: Browser type ('chrome', 'safari', 'firefox')
            platform: Platform ('android', 'ios', 'desktop')
            popup_shown: Whether permission popup was displayed
            
        Returns:
            PermissionDiagnostics with state and guidance
        """
        
        # Error code 1: PERMISSION_DENIED
        if error_code == GeolocationErrorCode.PERMISSION_DENIED.value:
            # Check if popup was shown
            if not popup_shown and platform in ['android', 'ios']:
                # No popup + error = BLOCKED at browser/OS level
                return PermissionDiagnostics(
                    state=LocationPermissionState.LOCATION_BLOCKED,
                    error_code=error_code,
                    browser=browser,
                    platform=platform,
                    can_retry=False,
                    show_settings_link=True,
                    user_message="Location is blocked. Enable it in your browser settings."
                )
            else:
                # Popup shown + denied = USER DENIED
                return PermissionDiagnostics(
                    state=LocationPermissionState.LOCATION_DENIED,
                    error_code=error_code,
                    browser=browser,
                    platform=platform,
                    can_retry=True,
                    retry_interval_seconds=30,
                    show_settings_link=True,
                    user_message="Location access was denied. You can enable it anytime."
                )
        
        # Error code 2: POSITION_UNAVAILABLE
        elif error_code == GeolocationErrorCode.POSITION_UNAVAILABLE.value:
            return PermissionDiagnostics(
                state=LocationPermissionState.LOCATION_UNAVAILABLE,
                error_code=error_code,
                browser=browser,
                platform=platform,
                can_retry=True,
                retry_interval_seconds=8,
                show_settings_link=False,
                user_message="GPS signal not available. Retrying automatically..."
            )
        
        # Error code 3: TIMEOUT
        elif error_code == GeolocationErrorCode.TIMEOUT.value:
            return PermissionDiagnostics(
                state=LocationPermissionState.LOCATION_UNAVAILABLE,
                error_code=error_code,
                browser=browser,
                platform=platform,
                can_retry=True,
                retry_interval_seconds=5,
                show_settings_link=False,
                user_message="GPS is taking longer than usual. Retrying..."
            )
        
        # Unknown error
        else:
            return PermissionDiagnostics(
                state=LocationPermissionState.LOCATION_UNAVAILABLE,
                error_code=error_code,
                browser=browser,
                platform=platform,
                can_retry=True,
                retry_interval_seconds=8,
                show_settings_link=False,
                user_message="Unable to get location. Retrying..."
            )
    
    @staticmethod
    def detect_restricted_mode(
        granted_once: bool,
        persistent_permission: bool,
        platform: str = "unknown"
    ) -> Optional[PermissionDiagnostics]:
        """
        Detect iOS-style restricted permission (allowed once, not persistent)
        
        Returns:
            PermissionDiagnostics if restricted, None otherwise
        """
        if granted_once and not persistent_permission and platform == "ios":
            return PermissionDiagnostics(
                state=LocationPermissionState.LOCATION_RESTRICTED,
                platform=platform,
                can_retry=False,
                show_settings_link=True,
                user_message="Location allowed once. For continuous routing, enable permanently in Settings."
            )
        return None


class FallbackNavigationMode:
    """
    V46 Fallback Navigation Modes
    
    Defines what the app can do in each permission state.
    """
    
    @staticmethod
    def get_capabilities(state: LocationPermissionState) -> Dict[str, bool]:
        """
        Get app capabilities for given permission state
        
        Returns:
            Dictionary of feature flags
        """
        if state == LocationPermissionState.LOCATION_ENABLED:
            return {
                "realtime_routing": True,
                "safe_return": True,
                "live_tracking": True,
                "scan_animation": True,
                "map_browsing": True,
                "route_planning": True,
                "accuracy_warning": False,
                "retry_gps": False
            }
        
        elif state == LocationPermissionState.LOCATION_DENIED:
            return {
                "realtime_routing": False,
                "safe_return": False,
                "live_tracking": False,
                "scan_animation": True,
                "map_browsing": True,
                "route_planning": False,
                "accuracy_warning": True,
                "retry_gps": True
            }
        
        elif state == LocationPermissionState.LOCATION_BLOCKED:
            return {
                "realtime_routing": False,
                "safe_return": False,
                "live_tracking": False,
                "scan_animation": True,
                "map_browsing": True,
                "route_planning": False,
                "accuracy_warning": True,
                "retry_gps": False  # No point retrying if blocked
            }
        
        elif state == LocationPermissionState.LOCATION_UNAVAILABLE:
            return {
                "realtime_routing": False,
                "safe_return": False,
                "live_tracking": False,
                "scan_animation": True,
                "map_browsing": True,
                "route_planning": False,
                "accuracy_warning": True,
                "retry_gps": True  # Keep retrying silently
            }
        
        elif state == LocationPermissionState.LOCATION_RESTRICTED:
            return {
                "realtime_routing": True,  # Works but may break
                "safe_return": True,
                "live_tracking": True,
                "scan_animation": True,
                "map_browsing": True,
                "route_planning": True,
                "accuracy_warning": True,
                "retry_gps": False
            }
        
        elif state == LocationPermissionState.LOCATION_SKIPPED:
            return {
                "realtime_routing": False,
                "safe_return": False,
                "live_tracking": False,
                "scan_animation": True,
                "map_browsing": True,
                "route_planning": False,
                "accuracy_warning": False,  # User knows they skipped
                "retry_gps": True  # Allow enabling later
            }
        
        else:  # UNKNOWN
            return {
                "realtime_routing": False,
                "safe_return": False,
                "live_tracking": False,
                "scan_animation": True,
                "map_browsing": True,
                "route_planning": False,
                "accuracy_warning": False,
                "retry_gps": False
            }


# Global singleton for permission diagnostics
_current_diagnostics: Optional[PermissionDiagnostics] = None


def get_current_diagnostics() -> Optional[PermissionDiagnostics]:
    """Get current permission diagnostics"""
    return _current_diagnostics


def set_current_diagnostics(diagnostics: PermissionDiagnostics) -> None:
    """Update current permission diagnostics"""
    global _current_diagnostics
    _current_diagnostics = diagnostics
