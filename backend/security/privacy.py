"""
PATHMAP - Privacy Manager
=========================
GDPR/CCPA compliance, data retention, and privacy controls.
"""

import sqlite3
import time
import hashlib
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass


@dataclass
class PrivacySettings:
    """User privacy settings"""
    user_id: str
    data_retention_days: int  # How long to keep location history
    share_analytics: bool     # Share anonymized usage data
    allow_tracking: bool      # Allow location tracking
    discoverable: bool        # Can be found in user search
    show_online_status: bool  # Show online/offline status
    show_last_location: bool  # Show last known location


@dataclass
class DataExportRequest:
    """Data export request"""
    id: str
    user_id: str
    status: str  # 'pending', 'processing', 'ready', 'expired'
    requested_at: float
    completed_at: Optional[float]
    download_url: Optional[str]
    expires_at: Optional[float]


class PrivacyManager:
    """
    Privacy Management System.
    
    Features:
    - GDPR data export
    - Data retention policies
    - Account deletion with data purge
    - Privacy settings management
    - Anonymization utilities
    """
    
    # Default data retention (days)
    DEFAULT_RETENTION_DAYS = 90
    
    # Export request validity (hours)
    EXPORT_VALIDITY_HOURS = 72
    
    def __init__(self, db_path: str = "pathmap_users.db"):
        """
        Initialize PrivacyManager with SQLite database.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.conn: sqlite3.Connection = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._initialize_tables()
    
    def _initialize_tables(self):
        """Initialize SQLite database tables."""
        cursor = self.conn.cursor()
        
        # Privacy settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS privacy_settings (
                user_id TEXT PRIMARY KEY,
                data_retention_days INTEGER DEFAULT 90,
                share_analytics INTEGER DEFAULT 0,
                allow_tracking INTEGER DEFAULT 1,
                discoverable INTEGER DEFAULT 1,
                show_online_status INTEGER DEFAULT 1,
                show_last_location INTEGER DEFAULT 0,
                updated_at REAL
            )
        """)
        
        # Data export requests table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS data_exports (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                requested_at REAL NOT NULL,
                completed_at REAL,
                file_path TEXT,
                expires_at REAL
            )
        """)
        
        # Account deletion requests table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS deletion_requests (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                reason TEXT,
                requested_at REAL NOT NULL,
                scheduled_for REAL NOT NULL,
                cancelled INTEGER DEFAULT 0
            )
        """)
        
        # Consent log table (GDPR requirement)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS consent_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                consent_type TEXT NOT NULL,
                granted INTEGER NOT NULL,
                timestamp REAL NOT NULL,
                ip_address TEXT,
                user_agent TEXT
            )
        """)
        
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_exports_user ON data_exports(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_deletion_user ON deletion_requests(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_log(user_id)")
        
        self.conn.commit()
    
    def get_privacy_settings(self, user_id: str) -> PrivacySettings:
        """
        Get user's privacy settings.
        
        Args:
            user_id: User ID
            
        Returns:
            PrivacySettings with defaults if not set
        """
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT * FROM privacy_settings WHERE user_id = ?",
            (user_id,)
        )
        row = cursor.fetchone()
        
        if row:
            return PrivacySettings(
                user_id=row['user_id'],
                data_retention_days=row['data_retention_days'],
                share_analytics=bool(row['share_analytics']),
                allow_tracking=bool(row['allow_tracking']),
                discoverable=bool(row['discoverable']),
                show_online_status=bool(row['show_online_status']),
                show_last_location=bool(row['show_last_location'])
            )
        
        # Return defaults
        return PrivacySettings(
            user_id=user_id,
            data_retention_days=self.DEFAULT_RETENTION_DAYS,
            share_analytics=False,
            allow_tracking=True,
            discoverable=True,
            show_online_status=True,
            show_last_location=False
        )
    
    def update_privacy_settings(
        self,
        user_id: str,
        data_retention_days: Optional[int] = None,
        share_analytics: Optional[bool] = None,
        allow_tracking: Optional[bool] = None,
        discoverable: Optional[bool] = None,
        show_online_status: Optional[bool] = None,
        show_last_location: Optional[bool] = None
    ) -> bool:
        """
        Update user's privacy settings.
        
        Args:
            user_id: User ID
            Various privacy settings (optional)
            
        Returns:
            True if update successful
        """
        cursor = self.conn.cursor()
        
        # Ensure record exists
        cursor.execute("""
            INSERT OR IGNORE INTO privacy_settings (user_id, updated_at)
            VALUES (?, ?)
        """, (user_id, time.time()))
        
        updates: List[str] = []
        values: List[Any] = []
        
        if data_retention_days is not None:
            updates.append("data_retention_days = ?")
            values.append(max(1, min(365, data_retention_days)))  # Limit to 1-365 days
        if share_analytics is not None:
            updates.append("share_analytics = ?")
            values.append(int(share_analytics))
        if allow_tracking is not None:
            updates.append("allow_tracking = ?")
            values.append(int(allow_tracking))
        if discoverable is not None:
            updates.append("discoverable = ?")
            values.append(int(discoverable))
        if show_online_status is not None:
            updates.append("show_online_status = ?")
            values.append(int(show_online_status))
        if show_last_location is not None:
            updates.append("show_last_location = ?")
            values.append(int(show_last_location))
        
        if not updates:
            return False
        
        updates.append("updated_at = ?")
        values.append(time.time())
        values.append(user_id)
        
        cursor.execute(
            f"UPDATE privacy_settings SET {', '.join(updates)} WHERE user_id = ?",
            values
        )
        
        self.conn.commit()
        return True
    
    def request_data_export(self, user_id: str) -> Tuple[bool, str, Optional[str]]:
        """
        Request a GDPR data export.
        
        Args:
            user_id: User ID
            
        Returns:
            Tuple of (success, message, request_id_or_none)
        """
        cursor = self.conn.cursor()
        
        # Check for existing pending request
        cursor.execute("""
            SELECT id FROM data_exports 
            WHERE user_id = ? AND status IN ('pending', 'processing')
        """, (user_id,))
        
        if cursor.fetchone():
            return False, "Data export already in progress", None
        
        import uuid
        request_id = str(uuid.uuid4())
        now = time.time()
        
        cursor.execute("""
            INSERT INTO data_exports (id, user_id, status, requested_at)
            VALUES (?, ?, 'pending', ?)
        """, (request_id, user_id, now))
        
        self.conn.commit()
        
        return True, "Data export requested. You will be notified when ready.", request_id
    
    def get_export_status(self, user_id: str, request_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a data export request."""
        cursor = self.conn.cursor()
        
        cursor.execute("""
            SELECT * FROM data_exports 
            WHERE id = ? AND user_id = ?
        """, (request_id, user_id))
        
        row = cursor.fetchone()
        if not row:
            return None
        
        return {
            'id': row['id'],
            'status': row['status'],
            'requested_at': row['requested_at'],
            'completed_at': row['completed_at'],
            'expires_at': row['expires_at']
        }
    
    def generate_data_export(self, user_id: str, request_id: str) -> Optional[Dict[str, Any]]:
        """
        Generate user data export (GDPR compliance).
        
        Args:
            user_id: User ID
            request_id: Export request ID
            
        Returns:
            Dict with all user data or None if failed
        """
        cursor = self.conn.cursor()
        
        # Update status to processing
        cursor.execute(
            "UPDATE data_exports SET status = 'processing' WHERE id = ?",
            (request_id,)
        )
        
        export_data: Dict[str, Any] = {
            'export_date': time.time(),
            'user_id': user_id,
            'data': {}
        }
        
        try:
            # User profile
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            user = cursor.fetchone()
            if user:
                export_data['data']['profile'] = {
                    'id': user['id'],
                    'username': user['username'],
                    'email': user['email'],
                    'phone': user['phone'],
                    'display_name': user['display_name'],
                    'created_at': user['created_at'],
                    'last_login': user['last_login']
                }
            
            # Friends
            cursor.execute("""
                SELECT f.*, u.username, u.display_name 
                FROM friendships f
                JOIN users u ON f.friend_id = u.id
                WHERE f.user_id = ?
            """, (user_id,))
            export_data['data']['friends'] = [dict(row) for row in cursor.fetchall()]
            
            # Friend groups
            cursor.execute(
                "SELECT * FROM friend_groups WHERE user_id = ?",
                (user_id,)
            )
            export_data['data']['friend_groups'] = [dict(row) for row in cursor.fetchall()]
            
            # Location history
            cursor.execute(
                "SELECT * FROM location_history WHERE user_id = ? ORDER BY timestamp DESC",
                (user_id,)
            )
            export_data['data']['location_history'] = [dict(row) for row in cursor.fetchall()]
            
            # Sharing sessions
            cursor.execute(
                "SELECT * FROM sharing_sessions WHERE owner_id = ? OR shared_with_id = ?",
                (user_id, user_id)
            )
            export_data['data']['sharing_sessions'] = [dict(row) for row in cursor.fetchall()]
            
            # Geofences
            cursor.execute(
                "SELECT * FROM geofences WHERE owner_id = ?",
                (user_id,)
            )
            export_data['data']['geofences'] = [dict(row) for row in cursor.fetchall()]
            
            # Named locations
            cursor.execute(
                "SELECT * FROM named_locations WHERE user_id = ?",
                (user_id,)
            )
            export_data['data']['saved_locations'] = [dict(row) for row in cursor.fetchall()]
            
            # Privacy settings
            cursor.execute(
                "SELECT * FROM privacy_settings WHERE user_id = ?",
                (user_id,)
            )
            row = cursor.fetchone()
            if row:
                export_data['data']['privacy_settings'] = dict(row)
            
            # Consent log
            cursor.execute(
                "SELECT * FROM consent_log WHERE user_id = ? ORDER BY timestamp DESC",
                (user_id,)
            )
            export_data['data']['consent_history'] = [dict(row) for row in cursor.fetchall()]
            
            # Update export status
            now = time.time()
            expires = now + (self.EXPORT_VALIDITY_HOURS * 3600)
            
            cursor.execute("""
                UPDATE data_exports 
                SET status = 'ready', completed_at = ?, expires_at = ?
                WHERE id = ?
            """, (now, expires, request_id))
            
            self.conn.commit()
            
            return export_data
            
        except Exception:
            cursor.execute(
                "UPDATE data_exports SET status = 'failed' WHERE id = ?",
                (request_id,)
            )
            self.conn.commit()
            return None
    
    def request_account_deletion(
        self,
        user_id: str,
        reason: Optional[str] = None,
        grace_period_days: int = 30
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Request account deletion (with grace period).
        
        Args:
            user_id: User ID
            reason: Optional reason for deletion
            grace_period_days: Days before permanent deletion
            
        Returns:
            Tuple of (success, message, request_id_or_none)
        """
        cursor = self.conn.cursor()
        
        # Check for existing request
        cursor.execute("""
            SELECT id FROM deletion_requests 
            WHERE user_id = ? AND cancelled = 0
        """, (user_id,))
        
        if cursor.fetchone():
            return False, "Deletion already scheduled", None
        
        import uuid
        request_id = str(uuid.uuid4())
        now = time.time()
        scheduled = now + (grace_period_days * 86400)
        
        cursor.execute("""
            INSERT INTO deletion_requests (id, user_id, reason, requested_at, scheduled_for)
            VALUES (?, ?, ?, ?, ?)
        """, (request_id, user_id, reason, now, scheduled))
        
        self.conn.commit()
        
        return True, f"Account scheduled for deletion in {grace_period_days} days", request_id
    
    def cancel_deletion_request(self, user_id: str) -> Tuple[bool, str]:
        """Cancel a pending account deletion."""
        cursor = self.conn.cursor()
        
        cursor.execute("""
            UPDATE deletion_requests 
            SET cancelled = 1 
            WHERE user_id = ? AND cancelled = 0 AND scheduled_for > ?
        """, (user_id, time.time()))
        
        if cursor.rowcount == 0:
            return False, "No active deletion request found"
        
        self.conn.commit()
        return True, "Deletion request cancelled"
    
    def execute_account_deletion(self, user_id: str) -> bool:
        """
        Permanently delete all user data.
        
        Args:
            user_id: User ID
            
        Returns:
            True if deletion successful
        """
        cursor = self.conn.cursor()
        
        try:
            # Delete all user data from all tables
            tables_and_columns = [
                ("users", "id"),
                ("sessions", "user_id"),
                ("verification_codes", "user_id"),
                ("password_resets", "user_id"),
                ("oauth_connections", "user_id"),
                ("friendships", "user_id"),
                ("friendships", "friend_id"),
                ("friend_requests", "from_user_id"),
                ("friend_requests", "to_user_id"),
                ("blocked_users", "user_id"),
                ("blocked_users", "blocked_user_id"),
                ("user_presence", "user_id"),
                ("friend_groups", "user_id"),
                ("group_members", "friend_id"),
                ("sharing_sessions", "owner_id"),
                ("sharing_sessions", "shared_with_id"),
                ("sharing_preferences", "user_id"),
                ("sharing_requests", "from_user_id"),
                ("sharing_requests", "to_user_id"),
                ("location_history", "user_id"),
                ("geofences", "owner_id"),
                ("geofence_users", "user_id"),
                ("geofence_alerts", "user_id"),
                ("named_locations", "user_id"),
                ("privacy_settings", "user_id"),
                ("data_exports", "user_id"),
                ("deletion_requests", "user_id"),
                ("consent_log", "user_id"),
            ]
            
            for table, column in tables_and_columns:
                try:
                    cursor.execute(f"DELETE FROM {table} WHERE {column} = ?", (user_id,))
                except sqlite3.OperationalError:
                    pass  # Table might not exist
            
            self.conn.commit()
            return True
            
        except Exception:
            self.conn.rollback()
            return False
    
    def log_consent(
        self,
        user_id: str,
        consent_type: str,
        granted: bool,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """
        Log a consent action (GDPR requirement).
        
        Args:
            user_id: User ID
            consent_type: Type of consent (e.g., 'location_tracking', 'analytics')
            granted: Whether consent was granted
            ip_address: Client IP (optional)
            user_agent: Client user agent (optional)
        """
        cursor = self.conn.cursor()
        
        cursor.execute("""
            INSERT INTO consent_log 
            (user_id, consent_type, granted, timestamp, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, consent_type, int(granted), time.time(), ip_address, user_agent))
        
        self.conn.commit()
    
    def apply_data_retention(self) -> int:
        """
        Apply data retention policies - delete old data.
        
        Returns:
            Number of records deleted
        """
        cursor = self.conn.cursor()
        now = time.time()
        deleted_count = 0
        
        # Get all users with their retention settings
        cursor.execute("SELECT user_id, data_retention_days FROM privacy_settings")
        
        for row in cursor.fetchall():
            user_id = row['user_id']
            retention_days = row['data_retention_days'] or self.DEFAULT_RETENTION_DAYS
            cutoff = now - (retention_days * 86400)
            
            # Delete old location history
            cursor.execute("""
                DELETE FROM location_history 
                WHERE user_id = ? AND timestamp < ?
            """, (user_id, cutoff))
            deleted_count += cursor.rowcount
        
        # Clean up expired data exports
        cursor.execute("""
            DELETE FROM data_exports 
            WHERE status = 'ready' AND expires_at < ?
        """, (now,))
        deleted_count += cursor.rowcount
        
        self.conn.commit()
        return deleted_count
    
    def anonymize_user_id(self, user_id: str) -> str:
        """
        Create anonymized user ID for analytics.
        
        Args:
            user_id: Real user ID
            
        Returns:
            Anonymized hash
        """
        # Use SHA-256 with a salt for anonymization
        salt = "pathmap-anon-v1"
        return hashlib.sha256(f"{salt}:{user_id}".encode()).hexdigest()[:16]


# Singleton instance
_privacy_manager: Optional[PrivacyManager] = None


def get_privacy_manager() -> PrivacyManager:
    """Get or create the PrivacyManager singleton."""
    global _privacy_manager
    if _privacy_manager is None:
        _privacy_manager = PrivacyManager()
    return _privacy_manager
