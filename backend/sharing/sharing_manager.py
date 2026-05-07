"""
PATHMAP - Location Sharing Manager
==================================
Core location sharing: start/stop sessions, broadcast locations.
SQLite-based for 20+ year stability.
"""

import sqlite3
import time
import uuid
from typing import Optional, Dict, Any, List, Tuple, Callable

from .sharing_session import (
    SharingPrecision,
    LocationUpdate
)


class LocationSharingManager:
    """
    Location Sharing System.
    
    Features:
    - Start/stop location sharing sessions
    - Precision control (exact, approximate, city)
    - Duration control (timed or indefinite)
    - Ghost mode
    - Real-time location broadcasts
    - Request-based sharing
    """
    
    def __init__(self, db_path: str = "pathmap_users.db"):
        """
        Initialize LocationSharingManager with SQLite database.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.conn: sqlite3.Connection = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._location_callbacks: Dict[str, List[Callable[..., Any]]] = {}
        self._user_locations: Dict[str, LocationUpdate] = {}  # Cache
        self._initialize_tables()
    
    def _initialize_tables(self):
        """Initialize SQLite database tables."""
        cursor = self.conn.cursor()
        
        # Sharing sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sharing_sessions (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                shared_with_id TEXT NOT NULL,
                precision TEXT NOT NULL DEFAULT 'approximate',
                started_at REAL NOT NULL,
                expires_at REAL,
                is_active INTEGER DEFAULT 1,
                last_location_update REAL,
                UNIQUE(owner_id, shared_with_id)
            )
        """)
        
        # User sharing preferences
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sharing_preferences (
                user_id TEXT PRIMARY KEY,
                default_precision TEXT DEFAULT 'approximate',
                default_duration INTEGER DEFAULT 14400,
                auto_share_with_family INTEGER DEFAULT 0,
                ghost_mode_enabled INTEGER DEFAULT 0,
                show_last_seen INTEGER DEFAULT 1,
                allow_location_requests INTEGER DEFAULT 1
            )
        """)
        
        # Location sharing requests
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sharing_requests (
                id TEXT PRIMARY KEY,
                from_user_id TEXT NOT NULL,
                to_user_id TEXT NOT NULL,
                message TEXT,
                status TEXT DEFAULT 'pending',
                created_at REAL NOT NULL,
                responded_at REAL,
                UNIQUE(from_user_id, to_user_id)
            )
        """)
        
        # Location history (for "last seen" feature)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS location_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                accuracy REAL,
                timestamp REAL NOT NULL
            )
        """)
        
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sharing_sessions(owner_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_shared ON sharing_sessions(shared_with_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_active ON sharing_sessions(is_active)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_history_user ON location_history(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_history_time ON location_history(timestamp)")
        
        self.conn.commit()
    
    def start_sharing(
        self,
        owner_id: str,
        shared_with_id: str,
        precision: str = 'approximate',
        duration_seconds: Optional[int] = None
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Start sharing location with another user.
        
        Args:
            owner_id: User sharing their location
            shared_with_id: User to share with
            precision: 'exact', 'approximate', or 'city'
            duration_seconds: How long to share (None = indefinite)
            
        Returns:
            Tuple of (success, message, session_id_or_none)
        """
        if owner_id == shared_with_id:
            return False, "Cannot share location with yourself", None
        
        # Check ghost mode
        prefs = self.get_preferences(owner_id)
        if prefs and prefs.get('ghost_mode_enabled'):
            return False, "Ghost mode is enabled. Disable it to share location.", None
        
        cursor = self.conn.cursor()
        now = time.time()
        
        # Calculate expiration
        expires_at = None
        if duration_seconds and duration_seconds > 0:
            expires_at = now + duration_seconds
        
        session_id = str(uuid.uuid4())
        
        try:
            # Insert or update existing session
            cursor.execute("""
                INSERT INTO sharing_sessions 
                (id, owner_id, shared_with_id, precision, started_at, expires_at, is_active)
                VALUES (?, ?, ?, ?, ?, ?, 1)
                ON CONFLICT(owner_id, shared_with_id) DO UPDATE SET
                    precision = excluded.precision,
                    started_at = excluded.started_at,
                    expires_at = excluded.expires_at,
                    is_active = 1
            """, (session_id, owner_id, shared_with_id, precision, now, expires_at))
            
            self.conn.commit()
            return True, "Location sharing started", session_id
            
        except sqlite3.Error as e:
            return False, f"Failed to start sharing: {e}", None
    
    def stop_sharing(
        self,
        owner_id: str,
        shared_with_id: str
    ) -> Tuple[bool, str]:
        """
        Stop sharing location with a user.
        
        Args:
            owner_id: User who is sharing
            shared_with_id: User to stop sharing with
            
        Returns:
            Tuple of (success, message)
        """
        cursor = self.conn.cursor()
        
        cursor.execute("""
            UPDATE sharing_sessions 
            SET is_active = 0 
            WHERE owner_id = ? AND shared_with_id = ?
        """, (owner_id, shared_with_id))
        
        if cursor.rowcount == 0:
            return False, "No active sharing session found"
        
        self.conn.commit()
        return True, "Location sharing stopped"
    
    def stop_sharing_all(self, owner_id: str) -> int:
        """
        Stop sharing location with everyone.
        
        Args:
            owner_id: User who is sharing
            
        Returns:
            Number of sessions stopped
        """
        cursor = self.conn.cursor()
        
        cursor.execute("""
            UPDATE sharing_sessions 
            SET is_active = 0 
            WHERE owner_id = ? AND is_active = 1
        """, (owner_id,))
        
        count = cursor.rowcount
        self.conn.commit()
        return count
    
    def enable_ghost_mode(self, user_id: str) -> bool:
        """
        Enable ghost mode (stop all sharing, become invisible).
        
        Args:
            user_id: User ID
            
        Returns:
            True if ghost mode was enabled
        """
        # Stop all active sharing
        self.stop_sharing_all(user_id)
        
        # Update preferences
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO sharing_preferences (user_id, ghost_mode_enabled)
            VALUES (?, 1)
            ON CONFLICT(user_id) DO UPDATE SET ghost_mode_enabled = 1
        """, (user_id,))
        
        self.conn.commit()
        return True
    
    def disable_ghost_mode(self, user_id: str) -> bool:
        """
        Disable ghost mode.
        
        Args:
            user_id: User ID
            
        Returns:
            True if ghost mode was disabled
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE sharing_preferences 
            SET ghost_mode_enabled = 0 
            WHERE user_id = ?
        """, (user_id,))
        
        self.conn.commit()
        return True
    
    def update_location(
        self,
        user_id: str,
        latitude: float,
        longitude: float,
        accuracy: float = 0.0,
        altitude: Optional[float] = None,
        speed: Optional[float] = None,
        heading: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Update user's location and broadcast to authorized friends.
        
        Args:
            user_id: User ID
            latitude: GPS latitude
            longitude: GPS longitude
            accuracy: GPS accuracy in meters
            altitude: Altitude (optional)
            speed: Speed in m/s (optional)
            heading: Heading in degrees (optional)
            
        Returns:
            Dict with broadcast statistics
        """
        now = time.time()
        cursor = self.conn.cursor()
        
        # Check ghost mode
        prefs = self.get_preferences(user_id)
        if prefs and prefs.get('ghost_mode_enabled'):
            return {'broadcasts': 0, 'reason': 'ghost_mode'}
        
        # Store in history
        cursor.execute("""
            INSERT INTO location_history (user_id, latitude, longitude, accuracy, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, latitude, longitude, accuracy, now))
        
        # Clean old history (keep last 24 hours)
        cursor.execute("""
            DELETE FROM location_history 
            WHERE user_id = ? AND timestamp < ?
        """, (user_id, now - 86400))
        
        # Get all active sharing sessions
        cursor.execute("""
            SELECT id, shared_with_id, precision 
            FROM sharing_sessions 
            WHERE owner_id = ? AND is_active = 1
            AND (expires_at IS NULL OR expires_at > ?)
        """, (user_id, now))
        
        sessions = cursor.fetchall()
        broadcasts = 0
        
        for session in sessions:
            precision = SharingPrecision(session['precision'])
            
            location = LocationUpdate(
                user_id=user_id,
                latitude=latitude,
                longitude=longitude,
                accuracy=accuracy,
                altitude=altitude,
                speed=speed,
                heading=heading,
                timestamp=now,
                precision=precision
            )
            
            # Apply precision filtering
            filtered_location = location.apply_precision()
            
            if filtered_location:
                # Cache the location
                cache_key = f"{user_id}:{session['shared_with_id']}"
                self._user_locations[cache_key] = filtered_location
                
                # Notify callbacks
                shared_with_id = session['shared_with_id']
                if shared_with_id in self._location_callbacks:
                    for callback in self._location_callbacks[shared_with_id]:
                        try:
                            callback(filtered_location)
                        except Exception:
                            pass
                
                broadcasts += 1
        
        # Update session timestamps
        cursor.execute("""
            UPDATE sharing_sessions 
            SET last_location_update = ?
            WHERE owner_id = ? AND is_active = 1
        """, (now, user_id))
        
        self.conn.commit()
        
        return {'broadcasts': broadcasts}
    
    def get_friend_location(
        self,
        user_id: str,
        friend_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get a friend's shared location.
        
        Args:
            user_id: Current user ID
            friend_id: Friend's user ID
            
        Returns:
            Location data or None if not shared
        """
        cursor = self.conn.cursor()
        now = time.time()
        
        # Check if friend is sharing with user
        cursor.execute("""
            SELECT precision, last_location_update
            FROM sharing_sessions 
            WHERE owner_id = ? AND shared_with_id = ? AND is_active = 1
            AND (expires_at IS NULL OR expires_at > ?)
        """, (friend_id, user_id, now))
        
        session = cursor.fetchone()
        if not session:
            return None
        
        # Get latest location from history
        cursor.execute("""
            SELECT latitude, longitude, accuracy, timestamp
            FROM location_history
            WHERE user_id = ?
            ORDER BY timestamp DESC
            LIMIT 1
        """, (friend_id,))
        
        location = cursor.fetchone()
        if not location:
            return None
        
        precision = SharingPrecision(session['precision'])
        
        result: Dict[str, Any] = {
            'user_id': friend_id,
            'latitude': location['latitude'],
            'longitude': location['longitude'],
            'accuracy': location['accuracy'],
            'timestamp': location['timestamp'],
            'precision': precision.value
        }
        
        # Apply precision
        if precision == SharingPrecision.APPROXIMATE:
            result['latitude'] = round(result['latitude'], 3)
            result['longitude'] = round(result['longitude'], 3)
            result['accuracy'] = 500.0
        elif precision == SharingPrecision.CITY:
            result['latitude'] = round(result['latitude'], 1)
            result['longitude'] = round(result['longitude'], 1)
            result['accuracy'] = 11000.0
        
        return result
    
    def get_all_friend_locations(
        self,
        user_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get locations of all friends sharing with user.
        
        Args:
            user_id: Current user ID
            
        Returns:
            List of friend locations
        """
        cursor = self.conn.cursor()
        now = time.time()
        
        # Get all active sessions where friends are sharing with this user
        cursor.execute("""
            SELECT 
                s.owner_id,
                s.precision,
                s.expires_at,
                h.latitude,
                h.longitude,
                h.accuracy,
                h.timestamp,
                u.username,
                u.display_name,
                u.avatar_url
            FROM sharing_sessions s
            JOIN users u ON s.owner_id = u.id
            LEFT JOIN (
                SELECT user_id, latitude, longitude, accuracy, timestamp,
                       ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp DESC) as rn
                FROM location_history
            ) h ON s.owner_id = h.user_id AND h.rn = 1
            WHERE s.shared_with_id = ? AND s.is_active = 1
            AND (s.expires_at IS NULL OR s.expires_at > ?)
        """, (user_id, now))
        
        locations: List[Dict[str, Any]] = []
        for row in cursor.fetchall():
            if row['latitude'] is None:
                continue
            
            precision = SharingPrecision(row['precision'])
            lat, lon, acc = row['latitude'], row['longitude'], row['accuracy']
            
            # Apply precision
            if precision == SharingPrecision.APPROXIMATE:
                lat, lon, acc = round(lat, 3), round(lon, 3), 500.0
            elif precision == SharingPrecision.CITY:
                lat, lon, acc = round(lat, 1), round(lon, 1), 11000.0
            
            locations.append({
                'user_id': row['owner_id'],
                'username': row['username'],
                'display_name': row['display_name'],
                'avatar_url': row['avatar_url'],
                'latitude': lat,
                'longitude': lon,
                'accuracy': acc,
                'timestamp': row['timestamp'],
                'precision': precision.value,
                'expires_at': row['expires_at']
            })
        
        return locations
    
    def get_sharing_sessions(
        self,
        user_id: str,
        direction: str = 'both'
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get active sharing sessions.
        
        Args:
            user_id: User ID
            direction: 'outgoing', 'incoming', or 'both'
            
        Returns:
            Dict with 'outgoing' and/or 'incoming' session lists
        """
        cursor = self.conn.cursor()
        now = time.time()
        result: Dict[str, List[Dict[str, Any]]] = {}
        
        if direction in ('outgoing', 'both'):
            # Sessions where user is sharing with others
            cursor.execute("""
                SELECT 
                    s.id,
                    s.shared_with_id,
                    s.precision,
                    s.started_at,
                    s.expires_at,
                    u.username,
                    u.display_name,
                    u.avatar_url
                FROM sharing_sessions s
                JOIN users u ON s.shared_with_id = u.id
                WHERE s.owner_id = ? AND s.is_active = 1
                AND (s.expires_at IS NULL OR s.expires_at > ?)
            """, (user_id, now))
            
            result['outgoing'] = [
                {
                    'session_id': row['id'],
                    'user_id': row['shared_with_id'],
                    'username': row['username'],
                    'display_name': row['display_name'],
                    'avatar_url': row['avatar_url'],
                    'precision': row['precision'],
                    'started_at': row['started_at'],
                    'expires_at': row['expires_at']
                }
                for row in cursor.fetchall()
            ]
        
        if direction in ('incoming', 'both'):
            # Sessions where others are sharing with user
            cursor.execute("""
                SELECT 
                    s.id,
                    s.owner_id,
                    s.precision,
                    s.started_at,
                    s.expires_at,
                    u.username,
                    u.display_name,
                    u.avatar_url
                FROM sharing_sessions s
                JOIN users u ON s.owner_id = u.id
                WHERE s.shared_with_id = ? AND s.is_active = 1
                AND (s.expires_at IS NULL OR s.expires_at > ?)
            """, (user_id, now))
            
            result['incoming'] = [
                {
                    'session_id': row['id'],
                    'user_id': row['owner_id'],
                    'username': row['username'],
                    'display_name': row['display_name'],
                    'avatar_url': row['avatar_url'],
                    'precision': row['precision'],
                    'started_at': row['started_at'],
                    'expires_at': row['expires_at']
                }
                for row in cursor.fetchall()
            ]
        
        return result
    
    def request_location(
        self,
        from_user_id: str,
        to_user_id: str,
        message: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Send a request to share location.
        
        Args:
            from_user_id: User requesting location
            to_user_id: User to request from
            message: Optional message
            
        Returns:
            Tuple of (success, message)
        """
        cursor = self.conn.cursor()
        
        # Check if requests are allowed
        prefs = self.get_preferences(to_user_id)
        if prefs and not prefs.get('allow_location_requests', True):
            return False, "User does not accept location requests"
        
        request_id = str(uuid.uuid4())
        now = time.time()
        
        try:
            cursor.execute("""
                INSERT INTO sharing_requests 
                (id, from_user_id, to_user_id, message, status, created_at)
                VALUES (?, ?, ?, ?, 'pending', ?)
                ON CONFLICT(from_user_id, to_user_id) DO UPDATE SET
                    message = excluded.message,
                    status = 'pending',
                    created_at = excluded.created_at
            """, (request_id, from_user_id, to_user_id, message, now))
            
            self.conn.commit()
            return True, "Location request sent"
            
        except sqlite3.Error as e:
            return False, f"Failed to send request: {e}"
    
    def get_preferences(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user's sharing preferences."""
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT * FROM sharing_preferences WHERE user_id = ?",
            (user_id,)
        )
        row = cursor.fetchone()
        if row:
            return {key: row[key] for key in row.keys()}
        return None
    
    def update_preferences(
        self,
        user_id: str,
        default_precision: Optional[str] = None,
        default_duration: Optional[int] = None,
        auto_share_with_family: Optional[bool] = None,
        ghost_mode_enabled: Optional[bool] = None,
        show_last_seen: Optional[bool] = None,
        allow_location_requests: Optional[bool] = None
    ) -> bool:
        """Update user's sharing preferences."""
        cursor = self.conn.cursor()
        
        # Ensure preferences exist
        cursor.execute("""
            INSERT OR IGNORE INTO sharing_preferences (user_id) VALUES (?)
        """, (user_id,))
        
        updates: List[str] = []
        values: List[Any] = []
        
        if default_precision is not None:
            updates.append("default_precision = ?")
            values.append(default_precision)
        if default_duration is not None:
            updates.append("default_duration = ?")
            values.append(default_duration)
        if auto_share_with_family is not None:
            updates.append("auto_share_with_family = ?")
            values.append(int(auto_share_with_family))
        if ghost_mode_enabled is not None:
            updates.append("ghost_mode_enabled = ?")
            values.append(int(ghost_mode_enabled))
        if show_last_seen is not None:
            updates.append("show_last_seen = ?")
            values.append(int(show_last_seen))
        if allow_location_requests is not None:
            updates.append("allow_location_requests = ?")
            values.append(int(allow_location_requests))
        
        if not updates:
            return False
        
        values.append(user_id)
        
        cursor.execute(
            f"UPDATE sharing_preferences SET {', '.join(updates)} WHERE user_id = ?",
            values
        )
        
        self.conn.commit()
        return True
    
    def register_location_callback(
        self,
        user_id: str,
        callback: Callable[[LocationUpdate], None]
    ):
        """Register callback for location updates."""
        if user_id not in self._location_callbacks:
            self._location_callbacks[user_id] = []
        self._location_callbacks[user_id].append(callback)
    
    def unregister_location_callback(
        self,
        user_id: str,
        callback: Callable[[LocationUpdate], None]
    ):
        """Unregister location callback."""
        if user_id in self._location_callbacks:
            self._location_callbacks[user_id] = [
                cb for cb in self._location_callbacks[user_id]
                if cb != callback
            ]
    
    def cleanup_expired_sessions(self) -> int:
        """Clean up expired sharing sessions."""
        cursor = self.conn.cursor()
        now = time.time()
        
        cursor.execute("""
            UPDATE sharing_sessions 
            SET is_active = 0 
            WHERE expires_at IS NOT NULL AND expires_at < ? AND is_active = 1
        """, (now,))
        
        count = cursor.rowcount
        self.conn.commit()
        return count


# Singleton instance
_sharing_manager: Optional[LocationSharingManager] = None


def get_sharing_manager() -> LocationSharingManager:
    """Get or create the LocationSharingManager singleton."""
    global _sharing_manager
    if _sharing_manager is None:
        _sharing_manager = LocationSharingManager()
    return _sharing_manager
