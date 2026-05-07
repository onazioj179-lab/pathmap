"""
PATHMAP - Friend Manager
========================
Core friend management: add, remove, list, block friends.
SQLite-based for 20+ year stability.
"""

import sqlite3
import time
import uuid
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass
from enum import Enum


class FriendStatus(Enum):
    """Friend relationship status"""
    PENDING = "pending"
    ACCEPTED = "accepted"
    BLOCKED = "blocked"
    DECLINED = "declined"


@dataclass
class Friend:
    """Friend relationship data model"""
    id: str
    user_id: str
    friend_id: str
    status: FriendStatus
    nickname: Optional[str]
    created_at: float
    updated_at: float
    accepted_at: Optional[float]


@dataclass
class FriendProfile:
    """Friend profile for display"""
    user_id: str
    username: str
    display_name: str
    avatar_url: Optional[str]
    nickname: Optional[str]
    status: str
    since: float  # Friendship start time
    is_online: bool
    last_seen: Optional[float]


class FriendManager:
    """
    Friend Management System.
    
    Features:
    - Send/accept/decline friend requests
    - Block/unblock users
    - Friend nicknames
    - Mutual friends detection
    - Friend search
    """
    
    def __init__(self, db_path: str = "pathmap_users.db"):
        """
        Initialize FriendManager with SQLite database.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.conn: sqlite3.Connection = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._initialize_database()
    
    def _initialize_database(self):
        """Initialize SQLite database with friend tables."""
        cursor = self.conn.cursor()
        
        # Friendships table (bidirectional)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS friendships (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                friend_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                nickname TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                accepted_at REAL,
                UNIQUE(user_id, friend_id)
            )
        """)
        
        # Friend requests table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS friend_requests (
                id TEXT PRIMARY KEY,
                from_user_id TEXT NOT NULL,
                to_user_id TEXT NOT NULL,
                message TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at REAL NOT NULL,
                responded_at REAL,
                UNIQUE(from_user_id, to_user_id)
            )
        """)
        
        # Blocked users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS blocked_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                blocked_user_id TEXT NOT NULL,
                reason TEXT,
                created_at REAL NOT NULL,
                UNIQUE(user_id, blocked_user_id)
            )
        """)
        
        # Online status table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_presence (
                user_id TEXT PRIMARY KEY,
                is_online INTEGER DEFAULT 0,
                last_seen REAL,
                status_message TEXT
            )
        """)
        
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_requests_to ON friend_requests(to_user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_requests_from ON friend_requests(from_user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_blocked_user ON blocked_users(user_id)")
        
        self.conn.commit()
    
    def send_friend_request(
        self,
        from_user_id: str,
        to_user_id: str,
        message: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Send a friend request.
        
        Args:
            from_user_id: Sender user ID
            to_user_id: Recipient user ID
            message: Optional message with request
            
        Returns:
            Tuple of (success, message)
        """
        if from_user_id == to_user_id:
            return False, "Cannot send friend request to yourself"
        
        cursor = self.conn.cursor()
        
        # Check if blocked
        cursor.execute("""
            SELECT id FROM blocked_users 
            WHERE (user_id = ? AND blocked_user_id = ?)
            OR (user_id = ? AND blocked_user_id = ?)
        """, (from_user_id, to_user_id, to_user_id, from_user_id))
        if cursor.fetchone():
            return False, "Cannot send friend request to this user"
        
        # Check if already friends
        cursor.execute("""
            SELECT status FROM friendships 
            WHERE user_id = ? AND friend_id = ?
        """, (from_user_id, to_user_id))
        row = cursor.fetchone()
        if row:
            if row['status'] == 'accepted':
                return False, "Already friends with this user"
            elif row['status'] == 'pending':
                return False, "Friend request already sent"
        
        # Check for existing request from other user
        cursor.execute("""
            SELECT id FROM friend_requests 
            WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'
        """, (to_user_id, from_user_id))
        if cursor.fetchone():
            # Auto-accept if other user already sent request
            return self.accept_friend_request(to_user_id, from_user_id)
        
        # Create friend request
        now = time.time()
        request_id = str(uuid.uuid4())
        
        try:
            cursor.execute("""
                INSERT INTO friend_requests (id, from_user_id, to_user_id, message, status, created_at)
                VALUES (?, ?, ?, ?, 'pending', ?)
            """, (request_id, from_user_id, to_user_id, message, now))
            self.conn.commit()
            return True, "Friend request sent"
        except sqlite3.IntegrityError:
            return False, "Friend request already exists"
    
    def accept_friend_request(
        self,
        from_user_id: str,
        to_user_id: str
    ) -> Tuple[bool, str]:
        """
        Accept a friend request (called by recipient).
        
        Args:
            from_user_id: Original sender user ID
            to_user_id: Recipient user ID (current user)
            
        Returns:
            Tuple of (success, message)
        """
        cursor = self.conn.cursor()
        now = time.time()
        
        # Update request status
        cursor.execute("""
            UPDATE friend_requests 
            SET status = 'accepted', responded_at = ?
            WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'
        """, (now, from_user_id, to_user_id))
        
        if cursor.rowcount == 0:
            return False, "Friend request not found"
        
        # Create bidirectional friendship
        friendship_id1 = str(uuid.uuid4())
        friendship_id2 = str(uuid.uuid4())
        
        try:
            # User -> Friend
            cursor.execute("""
                INSERT OR REPLACE INTO friendships 
                (id, user_id, friend_id, status, created_at, updated_at, accepted_at)
                VALUES (?, ?, ?, 'accepted', ?, ?, ?)
            """, (friendship_id1, to_user_id, from_user_id, now, now, now))
            
            # Friend -> User
            cursor.execute("""
                INSERT OR REPLACE INTO friendships 
                (id, user_id, friend_id, status, created_at, updated_at, accepted_at)
                VALUES (?, ?, ?, 'accepted', ?, ?, ?)
            """, (friendship_id2, from_user_id, to_user_id, now, now, now))
            
            self.conn.commit()
            return True, "Friend request accepted"
        except sqlite3.IntegrityError as e:
            return False, f"Failed to create friendship: {e}"
    
    def decline_friend_request(
        self,
        from_user_id: str,
        to_user_id: str
    ) -> Tuple[bool, str]:
        """
        Decline a friend request.
        
        Args:
            from_user_id: Original sender user ID
            to_user_id: Recipient user ID (current user)
            
        Returns:
            Tuple of (success, message)
        """
        cursor = self.conn.cursor()
        
        cursor.execute("""
            UPDATE friend_requests 
            SET status = 'declined', responded_at = ?
            WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'
        """, (time.time(), from_user_id, to_user_id))
        
        if cursor.rowcount == 0:
            return False, "Friend request not found"
        
        self.conn.commit()
        return True, "Friend request declined"
    
    def remove_friend(self, user_id: str, friend_id: str) -> Tuple[bool, str]:
        """
        Remove a friend (unfriend).
        
        Args:
            user_id: Current user ID
            friend_id: Friend to remove
            
        Returns:
            Tuple of (success, message)
        """
        cursor = self.conn.cursor()
        
        # Remove bidirectional friendship
        cursor.execute("""
            DELETE FROM friendships 
            WHERE (user_id = ? AND friend_id = ?) 
            OR (user_id = ? AND friend_id = ?)
        """, (user_id, friend_id, friend_id, user_id))
        
        if cursor.rowcount == 0:
            return False, "Friendship not found"
        
        # Also remove any pending requests
        cursor.execute("""
            DELETE FROM friend_requests 
            WHERE (from_user_id = ? AND to_user_id = ?)
            OR (from_user_id = ? AND to_user_id = ?)
        """, (user_id, friend_id, friend_id, user_id))
        
        self.conn.commit()
        return True, "Friend removed"
    
    def block_user(
        self,
        user_id: str,
        blocked_user_id: str,
        reason: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Block a user.
        
        Args:
            user_id: Current user ID
            blocked_user_id: User to block
            reason: Optional reason for blocking
            
        Returns:
            Tuple of (success, message)
        """
        if user_id == blocked_user_id:
            return False, "Cannot block yourself"
        
        cursor = self.conn.cursor()
        
        # Remove existing friendship
        cursor.execute("""
            DELETE FROM friendships 
            WHERE (user_id = ? AND friend_id = ?) 
            OR (user_id = ? AND friend_id = ?)
        """, (user_id, blocked_user_id, blocked_user_id, user_id))
        
        # Remove pending requests
        cursor.execute("""
            DELETE FROM friend_requests 
            WHERE (from_user_id = ? AND to_user_id = ?)
            OR (from_user_id = ? AND to_user_id = ?)
        """, (user_id, blocked_user_id, blocked_user_id, user_id))
        
        # Add to blocked list
        try:
            cursor.execute("""
                INSERT INTO blocked_users (user_id, blocked_user_id, reason, created_at)
                VALUES (?, ?, ?, ?)
            """, (user_id, blocked_user_id, reason, time.time()))
            self.conn.commit()
            return True, "User blocked"
        except sqlite3.IntegrityError:
            return False, "User already blocked"
    
    def unblock_user(self, user_id: str, blocked_user_id: str) -> Tuple[bool, str]:
        """
        Unblock a user.
        
        Args:
            user_id: Current user ID
            blocked_user_id: User to unblock
            
        Returns:
            Tuple of (success, message)
        """
        cursor = self.conn.cursor()
        
        cursor.execute("""
            DELETE FROM blocked_users 
            WHERE user_id = ? AND blocked_user_id = ?
        """, (user_id, blocked_user_id))
        
        if cursor.rowcount == 0:
            return False, "User was not blocked"
        
        self.conn.commit()
        return True, "User unblocked"
    
    def get_friends(
        self,
        user_id: str,
        include_pending: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get list of friends for a user.
        
        Args:
            user_id: User ID
            include_pending: Whether to include pending requests
            
        Returns:
            List of friend data with user info
        """
        cursor = self.conn.cursor()
        
        status_filter = "('accepted')" if not include_pending else "('accepted', 'pending')"
        
        cursor.execute(f"""
            SELECT 
                f.id,
                f.friend_id,
                f.status,
                f.nickname,
                f.accepted_at,
                u.username,
                u.display_name,
                u.avatar_url,
                p.is_online,
                p.last_seen
            FROM friendships f
            JOIN users u ON f.friend_id = u.id
            LEFT JOIN user_presence p ON f.friend_id = p.user_id
            WHERE f.user_id = ? AND f.status IN {status_filter}
            ORDER BY p.is_online DESC, u.display_name ASC
        """, (user_id,))
        
        friends: List[Dict[str, Any]] = []
        for row in cursor.fetchall():
            friends.append({
                'friendship_id': row['id'],
                'user_id': row['friend_id'],
                'username': row['username'],
                'display_name': row['display_name'],
                'avatar_url': row['avatar_url'],
                'nickname': row['nickname'],
                'status': row['status'],
                'since': row['accepted_at'],
                'is_online': bool(row['is_online']),
                'last_seen': row['last_seen']
            })
        
        return friends
    
    def get_pending_requests(self, user_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get pending friend requests (sent and received).
        
        Args:
            user_id: User ID
            
        Returns:
            Dict with 'incoming' and 'outgoing' request lists
        """
        cursor = self.conn.cursor()
        
        # Incoming requests
        cursor.execute("""
            SELECT 
                r.id,
                r.from_user_id,
                r.message,
                r.created_at,
                u.username,
                u.display_name,
                u.avatar_url
            FROM friend_requests r
            JOIN users u ON r.from_user_id = u.id
            WHERE r.to_user_id = ? AND r.status = 'pending'
            ORDER BY r.created_at DESC
        """, (user_id,))
        
        incoming: List[Dict[str, Any]] = []
        for row in cursor.fetchall():
            incoming.append({
                'request_id': row['id'],
                'from_user_id': row['from_user_id'],
                'username': row['username'],
                'display_name': row['display_name'],
                'avatar_url': row['avatar_url'],
                'message': row['message'],
                'created_at': row['created_at']
            })
        
        # Outgoing requests
        cursor.execute("""
            SELECT 
                r.id,
                r.to_user_id,
                r.message,
                r.created_at,
                u.username,
                u.display_name,
                u.avatar_url
            FROM friend_requests r
            JOIN users u ON r.to_user_id = u.id
            WHERE r.from_user_id = ? AND r.status = 'pending'
            ORDER BY r.created_at DESC
        """, (user_id,))
        
        outgoing: List[Dict[str, Any]] = []
        for row in cursor.fetchall():
            outgoing.append({
                'request_id': row['id'],
                'to_user_id': row['to_user_id'],
                'username': row['username'],
                'display_name': row['display_name'],
                'avatar_url': row['avatar_url'],
                'message': row['message'],
                'created_at': row['created_at']
            })
        
        return {
            'incoming': incoming,
            'outgoing': outgoing
        }
    
    def get_blocked_users(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get list of blocked users.
        
        Args:
            user_id: User ID
            
        Returns:
            List of blocked user data
        """
        cursor = self.conn.cursor()
        
        cursor.execute("""
            SELECT 
                b.blocked_user_id,
                b.reason,
                b.created_at,
                u.username,
                u.display_name,
                u.avatar_url
            FROM blocked_users b
            JOIN users u ON b.blocked_user_id = u.id
            WHERE b.user_id = ?
            ORDER BY b.created_at DESC
        """, (user_id,))
        
        blocked: List[Dict[str, Any]] = []
        for row in cursor.fetchall():
            blocked.append({
                'user_id': row['blocked_user_id'],
                'username': row['username'],
                'display_name': row['display_name'],
                'avatar_url': row['avatar_url'],
                'reason': row['reason'],
                'blocked_at': row['created_at']
            })
        
        return blocked
    
    def set_friend_nickname(
        self,
        user_id: str,
        friend_id: str,
        nickname: Optional[str]
    ) -> Tuple[bool, str]:
        """
        Set a nickname for a friend.
        
        Args:
            user_id: Current user ID
            friend_id: Friend's user ID
            nickname: Nickname (None to remove)
            
        Returns:
            Tuple of (success, message)
        """
        cursor = self.conn.cursor()
        
        cursor.execute("""
            UPDATE friendships 
            SET nickname = ?, updated_at = ?
            WHERE user_id = ? AND friend_id = ? AND status = 'accepted'
        """, (nickname, time.time(), user_id, friend_id))
        
        if cursor.rowcount == 0:
            return False, "Friendship not found"
        
        self.conn.commit()
        return True, "Nickname updated" if nickname else "Nickname removed"
    
    def get_mutual_friends(
        self,
        user_id: str,
        other_user_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get mutual friends between two users.
        
        Args:
            user_id: First user ID
            other_user_id: Second user ID
            
        Returns:
            List of mutual friend data
        """
        cursor = self.conn.cursor()
        
        cursor.execute("""
            SELECT 
                u.id,
                u.username,
                u.display_name,
                u.avatar_url
            FROM friendships f1
            JOIN friendships f2 ON f1.friend_id = f2.friend_id
            JOIN users u ON f1.friend_id = u.id
            WHERE f1.user_id = ? 
            AND f2.user_id = ?
            AND f1.status = 'accepted'
            AND f2.status = 'accepted'
        """, (user_id, other_user_id))
        
        mutual: List[Dict[str, Any]] = []
        for row in cursor.fetchall():
            mutual.append({
                'user_id': row['id'],
                'username': row['username'],
                'display_name': row['display_name'],
                'avatar_url': row['avatar_url']
            })
        
        return mutual
    
    def is_friend(self, user_id: str, other_user_id: str) -> bool:
        """Check if two users are friends."""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT id FROM friendships 
            WHERE user_id = ? AND friend_id = ? AND status = 'accepted'
        """, (user_id, other_user_id))
        return cursor.fetchone() is not None
    
    def is_blocked(self, user_id: str, other_user_id: str) -> bool:
        """Check if a user is blocked (either direction)."""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT id FROM blocked_users 
            WHERE (user_id = ? AND blocked_user_id = ?)
            OR (user_id = ? AND blocked_user_id = ?)
        """, (user_id, other_user_id, other_user_id, user_id))
        return cursor.fetchone() is not None
    
    def update_presence(
        self,
        user_id: str,
        is_online: bool,
        status_message: Optional[str] = None
    ):
        """
        Update user's online presence.
        
        Args:
            user_id: User ID
            is_online: Whether user is online
            status_message: Optional status message
        """
        cursor = self.conn.cursor()
        now = time.time()
        
        cursor.execute("""
            INSERT INTO user_presence (user_id, is_online, last_seen, status_message)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                is_online = excluded.is_online,
                last_seen = excluded.last_seen,
                status_message = COALESCE(excluded.status_message, status_message)
        """, (user_id, int(is_online), now if not is_online else None, status_message))
        
        self.conn.commit()
    
    def get_friend_count(self, user_id: str) -> int:
        """Get number of friends for a user."""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT COUNT(*) FROM friendships 
            WHERE user_id = ? AND status = 'accepted'
        """, (user_id,))
        return cursor.fetchone()[0]


# Singleton instance
_friend_manager: Optional[FriendManager] = None


def get_friend_manager() -> FriendManager:
    """Get or create the FriendManager singleton."""
    global _friend_manager
    if _friend_manager is None:
        _friend_manager = FriendManager()
    return _friend_manager
