"""
PATHMAP - Friend Request Handler
================================
Handle friend request notifications and processing.
"""

import sqlite3
from typing import Optional, Dict, Any, List, Callable
from dataclasses import dataclass


@dataclass
class FriendRequestNotification:
    """Friend request notification data"""
    request_id: str
    from_user_id: str
    from_username: str
    from_display_name: str
    from_avatar_url: Optional[str]
    message: Optional[str]
    created_at: float


class FriendRequestHandler:
    """
    Friend Request Notification Handler.
    
    Features:
    - Real-time request notifications
    - Request history
    - Notification callbacks
    """
    
    def __init__(self, db_path: str = "pathmap_users.db"):
        """
        Initialize FriendRequestHandler with SQLite database.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.conn: sqlite3.Connection = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._notification_callbacks: Dict[str, List[Callable[[FriendRequestNotification], None]]] = {}
    
    def register_notification_callback(
        self,
        user_id: str,
        callback: Callable[[FriendRequestNotification], None]
    ):
        """
        Register a callback for friend request notifications.
        
        Args:
            user_id: User ID to receive notifications for
            callback: Function to call on new request
        """
        if user_id not in self._notification_callbacks:
            self._notification_callbacks[user_id] = []
        self._notification_callbacks[user_id].append(callback)
    
    def unregister_notification_callback(
        self,
        user_id: str,
        callback: Callable[[FriendRequestNotification], None]
    ):
        """
        Unregister a notification callback.
        
        Args:
            user_id: User ID
            callback: Callback to remove
        """
        if user_id in self._notification_callbacks:
            self._notification_callbacks[user_id] = [
                cb for cb in self._notification_callbacks[user_id]
                if cb != callback
            ]
    
    def notify_new_request(self, notification: FriendRequestNotification):
        """
        Send notification for a new friend request.
        
        Args:
            notification: Request notification data
        """
        # Get target user ID from request
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT to_user_id FROM friend_requests WHERE id = ?",
            (notification.request_id,)
        )
        row = cursor.fetchone()
        if not row:
            return
        
        user_id = row['to_user_id']
        
        # Call registered callbacks
        if user_id in self._notification_callbacks:
            for callback in self._notification_callbacks[user_id]:
                try:
                    callback(notification)
                except Exception:
                    pass  # Don't let callback errors break the flow
    
    def get_unread_count(self, user_id: str) -> int:
        """
        Get count of unread/pending friend requests.
        
        Args:
            user_id: User ID
            
        Returns:
            Number of pending requests
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT COUNT(*) FROM friend_requests 
            WHERE to_user_id = ? AND status = 'pending'
        """, (user_id,))
        return cursor.fetchone()[0]
    
    def get_request_history(
        self,
        user_id: str,
        limit: int = 50,
        include_responded: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Get friend request history.
        
        Args:
            user_id: User ID
            limit: Maximum results
            include_responded: Include accepted/declined requests
            
        Returns:
            List of request history entries
        """
        cursor = self.conn.cursor()
        
        status_filter = "" if include_responded else "AND r.status = 'pending'"
        
        cursor.execute(f"""
            SELECT 
                r.id,
                r.from_user_id,
                r.status,
                r.message,
                r.created_at,
                r.responded_at,
                u.username,
                u.display_name,
                u.avatar_url
            FROM friend_requests r
            JOIN users u ON r.from_user_id = u.id
            WHERE r.to_user_id = ? {status_filter}
            ORDER BY r.created_at DESC
            LIMIT ?
        """, (user_id, limit))
        
        history: List[Dict[str, Any]] = []
        for row in cursor.fetchall():
            history.append({
                'request_id': row['id'],
                'from_user_id': row['from_user_id'],
                'username': row['username'],
                'display_name': row['display_name'],
                'avatar_url': row['avatar_url'],
                'status': row['status'],
                'message': row['message'],
                'created_at': row['created_at'],
                'responded_at': row['responded_at']
            })
        
        return history
    
    def cancel_request(self, from_user_id: str, to_user_id: str) -> bool:
        """
        Cancel a pending friend request.
        
        Args:
            from_user_id: Sender user ID
            to_user_id: Recipient user ID
            
        Returns:
            True if request was cancelled
        """
        cursor = self.conn.cursor()
        
        cursor.execute("""
            DELETE FROM friend_requests 
            WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'
        """, (from_user_id, to_user_id))
        
        success = cursor.rowcount > 0
        if success:
            self.conn.commit()
        return success


# Singleton instance
_friend_request_handler: Optional[FriendRequestHandler] = None


def get_friend_request_handler() -> FriendRequestHandler:
    """Get or create the FriendRequestHandler singleton."""
    global _friend_request_handler
    if _friend_request_handler is None:
        _friend_request_handler = FriendRequestHandler()
    return _friend_request_handler
