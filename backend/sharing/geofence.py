"""
PATHMAP - Geofence Manager
==========================
Geofence alerts: notify when friends arrive/leave locations.
"""

import sqlite3
import time
import uuid
import math
from typing import Optional, Dict, Any, List, Tuple, Callable
from dataclasses import dataclass
from enum import Enum


class GeofenceTrigger(Enum):
    """Geofence trigger types"""
    ENTER = "enter"
    EXIT = "exit"
    BOTH = "both"


@dataclass
class Geofence:
    """Geofence definition"""
    id: str
    owner_id: str
    name: str
    latitude: float
    longitude: float
    radius_meters: float
    trigger_type: GeofenceTrigger
    notify_for_users: List[str]  # User IDs to monitor
    is_active: bool
    created_at: float


@dataclass
class GeofenceAlert:
    """Geofence triggered alert"""
    geofence_id: str
    geofence_name: str
    user_id: str
    username: str
    display_name: str
    trigger_type: str  # 'enter' or 'exit'
    latitude: float
    longitude: float
    timestamp: float


class GeofenceManager:
    """
    Geofence Alert System.
    
    Features:
    - Create geofences around locations (home, work, etc.)
    - Monitor friends entering/leaving geofences
    - Real-time notifications
    - Named location presets
    """
    
    # Earth radius in meters for distance calculation
    EARTH_RADIUS = 6371000
    
    def __init__(self, db_path: str = "pathmap_users.db"):
        """
        Initialize GeofenceManager with SQLite database.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.conn: sqlite3.Connection = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._alert_callbacks: Dict[str, List[Callable[..., Any]]] = {}
        self._user_geofence_state: Dict[str, Dict[str, bool]] = {}  # {user_id: {geofence_id: inside}}
        self._initialize_tables()
    
    def _initialize_tables(self):
        """Initialize SQLite database tables."""
        cursor = self.conn.cursor()
        
        # Geofences table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS geofences (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                name TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                radius_meters REAL NOT NULL DEFAULT 100,
                trigger_type TEXT NOT NULL DEFAULT 'both',
                is_active INTEGER DEFAULT 1,
                created_at REAL NOT NULL
            )
        """)
        
        # Geofence monitored users
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS geofence_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                geofence_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                FOREIGN KEY (geofence_id) REFERENCES geofences(id),
                UNIQUE(geofence_id, user_id)
            )
        """)
        
        # Geofence alert history
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS geofence_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                geofence_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                trigger_type TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                timestamp REAL NOT NULL,
                is_read INTEGER DEFAULT 0,
                FOREIGN KEY (geofence_id) REFERENCES geofences(id)
            )
        """)
        
        # Named locations (home, work, etc.)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS named_locations (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                address TEXT,
                icon TEXT DEFAULT 'location',
                created_at REAL NOT NULL,
                UNIQUE(user_id, name)
            )
        """)
        
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_geofences_owner ON geofences(owner_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_geofence_users_gf ON geofence_users(geofence_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_geofence_users_user ON geofence_users(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_alerts_geofence ON geofence_alerts(geofence_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_named_locations_user ON named_locations(user_id)")
        
        self.conn.commit()
    
    def _haversine_distance(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float
    ) -> float:
        """
        Calculate distance between two GPS coordinates.
        
        Returns:
            Distance in meters
        """
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)
        
        a = (math.sin(delta_lat / 2) ** 2 +
             math.cos(lat1_rad) * math.cos(lat2_rad) * 
             math.sin(delta_lon / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return self.EARTH_RADIUS * c
    
    def create_geofence(
        self,
        owner_id: str,
        name: str,
        latitude: float,
        longitude: float,
        radius_meters: float = 100,
        trigger_type: str = 'both',
        user_ids: Optional[List[str]] = None
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Create a new geofence.
        
        Args:
            owner_id: Owner user ID
            name: Geofence name
            latitude: Center latitude
            longitude: Center longitude
            radius_meters: Radius in meters
            trigger_type: 'enter', 'exit', or 'both'
            user_ids: User IDs to monitor (default: all friends)
            
        Returns:
            Tuple of (success, message, geofence_id_or_none)
        """
        cursor = self.conn.cursor()
        now = time.time()
        geofence_id = str(uuid.uuid4())
        
        try:
            cursor.execute("""
                INSERT INTO geofences 
                (id, owner_id, name, latitude, longitude, radius_meters, trigger_type, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
            """, (geofence_id, owner_id, name, latitude, longitude, radius_meters, trigger_type, now))
            
            # Add monitored users
            if user_ids:
                for user_id in user_ids:
                    cursor.execute("""
                        INSERT OR IGNORE INTO geofence_users (geofence_id, user_id)
                        VALUES (?, ?)
                    """, (geofence_id, user_id))
            
            self.conn.commit()
            return True, "Geofence created", geofence_id
            
        except sqlite3.Error as e:
            return False, f"Failed to create geofence: {e}", None
    
    def update_geofence(
        self,
        owner_id: str,
        geofence_id: str,
        name: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        radius_meters: Optional[float] = None,
        trigger_type: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> Tuple[bool, str]:
        """Update a geofence."""
        cursor = self.conn.cursor()
        
        updates: List[str] = []
        values: List[Any] = []
        
        if name is not None:
            updates.append("name = ?")
            values.append(name)
        if latitude is not None:
            updates.append("latitude = ?")
            values.append(latitude)
        if longitude is not None:
            updates.append("longitude = ?")
            values.append(longitude)
        if radius_meters is not None:
            updates.append("radius_meters = ?")
            values.append(radius_meters)
        if trigger_type is not None:
            updates.append("trigger_type = ?")
            values.append(trigger_type)
        if is_active is not None:
            updates.append("is_active = ?")
            values.append(int(is_active))
        
        if not updates:
            return False, "No updates provided"
        
        values.extend([geofence_id, owner_id])
        
        cursor.execute(
            f"UPDATE geofences SET {', '.join(updates)} WHERE id = ? AND owner_id = ?",
            values
        )
        
        if cursor.rowcount == 0:
            return False, "Geofence not found"
        
        self.conn.commit()
        return True, "Geofence updated"
    
    def delete_geofence(self, owner_id: str, geofence_id: str) -> Tuple[bool, str]:
        """Delete a geofence."""
        cursor = self.conn.cursor()
        
        # Remove monitored users
        cursor.execute("DELETE FROM geofence_users WHERE geofence_id = ?", (geofence_id,))
        
        # Remove alerts
        cursor.execute("DELETE FROM geofence_alerts WHERE geofence_id = ?", (geofence_id,))
        
        # Delete geofence
        cursor.execute(
            "DELETE FROM geofences WHERE id = ? AND owner_id = ?",
            (geofence_id, owner_id)
        )
        
        if cursor.rowcount == 0:
            return False, "Geofence not found"
        
        self.conn.commit()
        return True, "Geofence deleted"
    
    def add_monitored_user(
        self,
        owner_id: str,
        geofence_id: str,
        user_id: str
    ) -> Tuple[bool, str]:
        """Add a user to monitor for a geofence."""
        cursor = self.conn.cursor()
        
        # Verify ownership
        cursor.execute(
            "SELECT id FROM geofences WHERE id = ? AND owner_id = ?",
            (geofence_id, owner_id)
        )
        if not cursor.fetchone():
            return False, "Geofence not found"
        
        try:
            cursor.execute("""
                INSERT INTO geofence_users (geofence_id, user_id) VALUES (?, ?)
            """, (geofence_id, user_id))
            self.conn.commit()
            return True, "User added to geofence"
        except sqlite3.IntegrityError:
            return False, "User already monitored"
    
    def remove_monitored_user(
        self,
        owner_id: str,
        geofence_id: str,
        user_id: str
    ) -> Tuple[bool, str]:
        """Remove a user from geofence monitoring."""
        cursor = self.conn.cursor()
        
        # Verify ownership
        cursor.execute(
            "SELECT id FROM geofences WHERE id = ? AND owner_id = ?",
            (geofence_id, owner_id)
        )
        if not cursor.fetchone():
            return False, "Geofence not found"
        
        cursor.execute(
            "DELETE FROM geofence_users WHERE geofence_id = ? AND user_id = ?",
            (geofence_id, user_id)
        )
        
        if cursor.rowcount == 0:
            return False, "User not monitored"
        
        self.conn.commit()
        return True, "User removed from geofence"
    
    def check_location(
        self,
        user_id: str,
        latitude: float,
        longitude: float
    ) -> List[GeofenceAlert]:
        """
        Check user location against all relevant geofences.
        
        Args:
            user_id: User whose location is being checked
            latitude: Current latitude
            longitude: Current longitude
            
        Returns:
            List of triggered alerts
        """
        cursor = self.conn.cursor()
        now = time.time()
        alerts: List[GeofenceAlert] = []
        
        # Get all geofences monitoring this user
        cursor.execute("""
            SELECT 
                g.id,
                g.owner_id,
                g.name,
                g.latitude,
                g.longitude,
                g.radius_meters,
                g.trigger_type
            FROM geofences g
            JOIN geofence_users gu ON g.id = gu.geofence_id
            WHERE gu.user_id = ? AND g.is_active = 1
        """, (user_id,))
        
        geofences = cursor.fetchall()
        
        for gf in geofences:
            geofence_id = gf['id']
            distance = self._haversine_distance(
                latitude, longitude,
                gf['latitude'], gf['longitude']
            )
            
            is_inside = distance <= gf['radius_meters']
            
            # Get previous state
            if user_id not in self._user_geofence_state:
                self._user_geofence_state[user_id] = {}
            
            was_inside = self._user_geofence_state[user_id].get(geofence_id)
            
            # Check for state change
            trigger = None
            if was_inside is not None:
                if not was_inside and is_inside:
                    trigger = 'enter'
                elif was_inside and not is_inside:
                    trigger = 'exit'
            
            # Update state
            self._user_geofence_state[user_id][geofence_id] = is_inside
            
            # Create alert if triggered
            if trigger:
                trigger_type = GeofenceTrigger(gf['trigger_type'])
                should_alert = (
                    trigger_type == GeofenceTrigger.BOTH or
                    trigger_type.value == trigger
                )
                
                if should_alert:
                    # Get user info
                    cursor.execute(
                        "SELECT username, display_name FROM users WHERE id = ?",
                        (user_id,)
                    )
                    user = cursor.fetchone()
                    
                    alert = GeofenceAlert(
                        geofence_id=geofence_id,
                        geofence_name=gf['name'],
                        user_id=user_id,
                        username=user['username'] if user else '',
                        display_name=user['display_name'] if user else '',
                        trigger_type=trigger,
                        latitude=latitude,
                        longitude=longitude,
                        timestamp=now
                    )
                    alerts.append(alert)
                    
                    # Store alert in database
                    cursor.execute("""
                        INSERT INTO geofence_alerts 
                        (geofence_id, user_id, trigger_type, latitude, longitude, timestamp)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (geofence_id, user_id, trigger, latitude, longitude, now))
                    
                    # Notify owner
                    owner_id = gf['owner_id']
                    if owner_id in self._alert_callbacks:
                        for callback in self._alert_callbacks[owner_id]:
                            try:
                                callback(alert)
                            except Exception:
                                pass
        
        self.conn.commit()
        return alerts
    
    def get_geofences(self, owner_id: str) -> List[Dict[str, Any]]:
        """Get all geofences for a user."""
        cursor = self.conn.cursor()
        
        cursor.execute("""
            SELECT 
                g.id,
                g.name,
                g.latitude,
                g.longitude,
                g.radius_meters,
                g.trigger_type,
                g.is_active,
                g.created_at,
                COUNT(gu.id) as user_count
            FROM geofences g
            LEFT JOIN geofence_users gu ON g.id = gu.geofence_id
            WHERE g.owner_id = ?
            GROUP BY g.id
            ORDER BY g.name ASC
        """, (owner_id,))
        
        return [
            {
                'id': row['id'],
                'name': row['name'],
                'latitude': row['latitude'],
                'longitude': row['longitude'],
                'radius_meters': row['radius_meters'],
                'trigger_type': row['trigger_type'],
                'is_active': bool(row['is_active']),
                'user_count': row['user_count'],
                'created_at': row['created_at']
            }
            for row in cursor.fetchall()
        ]
    
    def get_alerts(
        self,
        owner_id: str,
        limit: int = 50,
        unread_only: bool = False
    ) -> List[Dict[str, Any]]:
        """Get geofence alerts for a user."""
        cursor = self.conn.cursor()
        
        unread_filter = "AND a.is_read = 0" if unread_only else ""
        
        cursor.execute(f"""
            SELECT 
                a.id,
                a.geofence_id,
                a.user_id,
                a.trigger_type,
                a.latitude,
                a.longitude,
                a.timestamp,
                a.is_read,
                g.name as geofence_name,
                u.username,
                u.display_name,
                u.avatar_url
            FROM geofence_alerts a
            JOIN geofences g ON a.geofence_id = g.id
            JOIN users u ON a.user_id = u.id
            WHERE g.owner_id = ? {unread_filter}
            ORDER BY a.timestamp DESC
            LIMIT ?
        """, (owner_id, limit))
        
        return [dict(row) for row in cursor.fetchall()]
    
    def mark_alerts_read(self, owner_id: str, alert_ids: List[int]) -> int:
        """Mark alerts as read."""
        cursor = self.conn.cursor()
        
        placeholders = ','.join('?' * len(alert_ids))
        cursor.execute(f"""
            UPDATE geofence_alerts 
            SET is_read = 1 
            WHERE id IN ({placeholders})
            AND geofence_id IN (SELECT id FROM geofences WHERE owner_id = ?)
        """, (*alert_ids, owner_id))
        
        count = cursor.rowcount
        self.conn.commit()
        return count
    
    # Named Locations
    def save_location(
        self,
        user_id: str,
        name: str,
        latitude: float,
        longitude: float,
        address: Optional[str] = None,
        icon: str = 'location'
    ) -> Tuple[bool, str, Optional[str]]:
        """Save a named location."""
        cursor = self.conn.cursor()
        location_id = str(uuid.uuid4())
        
        try:
            cursor.execute("""
                INSERT INTO named_locations 
                (id, user_id, name, latitude, longitude, address, icon, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, name) DO UPDATE SET
                    latitude = excluded.latitude,
                    longitude = excluded.longitude,
                    address = excluded.address,
                    icon = excluded.icon
            """, (location_id, user_id, name, latitude, longitude, address, icon, time.time()))
            
            self.conn.commit()
            return True, "Location saved", location_id
            
        except sqlite3.Error as e:
            return False, f"Failed to save location: {e}", None
    
    def get_saved_locations(self, user_id: str) -> List[Dict[str, Any]]:
        """Get user's saved locations."""
        cursor = self.conn.cursor()
        
        cursor.execute("""
            SELECT id, name, latitude, longitude, address, icon, created_at
            FROM named_locations
            WHERE user_id = ?
            ORDER BY name ASC
        """, (user_id,))
        
        return [dict(row) for row in cursor.fetchall()]
    
    def delete_saved_location(self, user_id: str, location_id: str) -> bool:
        """Delete a saved location."""
        cursor = self.conn.cursor()
        
        cursor.execute(
            "DELETE FROM named_locations WHERE id = ? AND user_id = ?",
            (location_id, user_id)
        )
        
        success = cursor.rowcount > 0
        if success:
            self.conn.commit()
        return success
    
    def register_alert_callback(
        self,
        user_id: str,
        callback: Callable[[GeofenceAlert], None]
    ):
        """Register callback for geofence alerts."""
        if user_id not in self._alert_callbacks:
            self._alert_callbacks[user_id] = []
        self._alert_callbacks[user_id].append(callback)
    
    def unregister_alert_callback(
        self,
        user_id: str,
        callback: Callable[[GeofenceAlert], None]
    ):
        """Unregister alert callback."""
        if user_id in self._alert_callbacks:
            self._alert_callbacks[user_id] = [
                cb for cb in self._alert_callbacks[user_id]
                if cb != callback
            ]


# Singleton instance
_geofence_manager: Optional[GeofenceManager] = None


def get_geofence_manager() -> GeofenceManager:
    """Get or create the GeofenceManager singleton."""
    global _geofence_manager
    if _geofence_manager is None:
        _geofence_manager = GeofenceManager()
    return _geofence_manager
