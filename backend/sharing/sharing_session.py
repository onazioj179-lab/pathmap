"""
PATHMAP - Sharing Session Models
================================
Data models for location sharing sessions.
"""

from enum import Enum
from dataclasses import dataclass
from typing import Optional


class SharingPrecision(Enum):
    """Location sharing precision levels"""
    EXACT = "exact"           # Full GPS accuracy (street level)
    APPROXIMATE = "approximate"  # ~500m radius
    CITY = "city"             # City-level only
    HIDDEN = "hidden"         # Ghost mode - no location shared


class SharingDuration(Enum):
    """Pre-defined sharing durations"""
    ONE_HOUR = 3600
    FOUR_HOURS = 14400
    EIGHT_HOURS = 28800
    UNTIL_DISABLED = -1  # Indefinite


@dataclass
class SharingSession:
    """Active location sharing session"""
    id: str
    owner_id: str           # User sharing their location
    shared_with_id: str     # User receiving location
    precision: SharingPrecision
    started_at: float
    expires_at: Optional[float]  # None = indefinite
    is_active: bool
    last_location_update: Optional[float]
    
    def is_expired(self, current_time: float) -> bool:
        """Check if session has expired."""
        if self.expires_at is None:
            return False
        return current_time > self.expires_at


@dataclass
class LocationUpdate:
    """Location update data sent to friends"""
    user_id: str
    latitude: float
    longitude: float
    accuracy: float
    altitude: Optional[float]
    speed: Optional[float]
    heading: Optional[float]
    timestamp: float
    precision: SharingPrecision
    
    def apply_precision(self) -> Optional['LocationUpdate']:
        """Apply precision filtering to location."""
        if self.precision == SharingPrecision.EXACT:
            return self
        
        if self.precision == SharingPrecision.APPROXIMATE:
            # Round to ~500m precision
            return LocationUpdate(
                user_id=self.user_id,
                latitude=round(self.latitude, 3),  # ~111m per 0.001
                longitude=round(self.longitude, 3),
                accuracy=500.0,
                altitude=None,
                speed=None,
                heading=None,
                timestamp=self.timestamp,
                precision=self.precision
            )
        
        if self.precision == SharingPrecision.CITY:
            # Round to ~11km precision
            return LocationUpdate(
                user_id=self.user_id,
                latitude=round(self.latitude, 1),
                longitude=round(self.longitude, 1),
                accuracy=11000.0,
                altitude=None,
                speed=None,
                heading=None,
                timestamp=self.timestamp,
                precision=self.precision
            )
        
        # HIDDEN - return None (handled by caller)
        return None


@dataclass
class SharingPreferences:
    """User's default sharing preferences"""
    user_id: str
    default_precision: SharingPrecision
    default_duration: int  # seconds, -1 for indefinite
    auto_share_with_family: bool
    ghost_mode_enabled: bool
    show_last_seen: bool
    allow_location_requests: bool
