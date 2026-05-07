"""
PATHMAP - Friend Groups (Circles)
=================================
Organize friends into groups for location sharing control.
"""

import sqlite3
import time
import uuid
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass


@dataclass
class FriendGroup:
    """Friend group (circle) data model"""
    id: str
    user_id: str
    name: str
    color: str
    icon: str
    member_count: int
    can_see_location: bool
    location_precision: str  # 'exact', 'approximate', 'city'
    created_at: float
    updated_at: float


class FriendGroups:
    """
    Friend Groups (Circles) System.
    
    Features:
    - Create custom friend groups (Family, Work, Close Friends)
    - Assign friends to groups
    - Group-level location sharing permissions
    - Default groups
    """
    
    # Default groups created for new users
    DEFAULT_GROUPS: List[Dict[str, Any]] = [
        {'name': 'Family', 'color': '#FF6B6B', 'icon': 'family', 'can_see_location': True, 'precision': 'exact'},
        {'name': 'Close Friends', 'color': '#4ECDC4', 'icon': 'heart', 'can_see_location': True, 'precision': 'exact'},
        {'name': 'Friends', 'color': '#45B7D1', 'icon': 'users', 'can_see_location': True, 'precision': 'approximate'},
        {'name': 'Work', 'color': '#96CEB4', 'icon': 'briefcase', 'can_see_location': False, 'precision': 'city'},
    ]
    
    def __init__(self, db_path: str = "pathmap_users.db"):
        """
        Initialize FriendGroups with SQLite database.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.conn: sqlite3.Connection = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._initialize_tables()
    
    def _initialize_tables(self):
        """Initialize SQLite database with group tables."""
        cursor = self.conn.cursor()
        
        # Friend groups table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS friend_groups (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                color TEXT DEFAULT '#45B7D1',
                icon TEXT DEFAULT 'users',
                can_see_location INTEGER DEFAULT 1,
                location_precision TEXT DEFAULT 'approximate',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                UNIQUE(user_id, name)
            )
        """)
        
        # Group members table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS group_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id TEXT NOT NULL,
                friend_id TEXT NOT NULL,
                added_at REAL NOT NULL,
                FOREIGN KEY (group_id) REFERENCES friend_groups(id),
                UNIQUE(group_id, friend_id)
            )
        """)
        
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_groups_user ON friend_groups(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_members_group ON group_members(group_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_members_friend ON group_members(friend_id)")
        
        self.conn.commit()
    
    def create_default_groups(self, user_id: str):
        """
        Create default groups for a new user.
        
        Args:
            user_id: User ID
        """
        for group in self.DEFAULT_GROUPS:
            self.create_group(
                user_id=user_id,
                name=group['name'],
                color=group['color'],
                icon=group['icon'],
                can_see_location=group['can_see_location'],
                location_precision=group['precision']
            )
    
    def create_group(
        self,
        user_id: str,
        name: str,
        color: str = '#45B7D1',
        icon: str = 'users',
        can_see_location: bool = True,
        location_precision: str = 'approximate'
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Create a new friend group.
        
        Args:
            user_id: Owner user ID
            name: Group name
            color: Group color (hex)
            icon: Group icon name
            can_see_location: Whether group can see location
            location_precision: 'exact', 'approximate', 'city'
            
        Returns:
            Tuple of (success, message, group_id_or_none)
        """
        cursor = self.conn.cursor()  # type: ignore
        now = time.time()
        group_id = str(uuid.uuid4())
        
        try:
            cursor.execute("""
                INSERT INTO friend_groups 
                (id, user_id, name, color, icon, can_see_location, location_precision, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (group_id, user_id, name, color, icon, int(can_see_location), location_precision, now, now))
            self.conn.commit()  # type: ignore
            return True, "Group created", group_id
        except sqlite3.IntegrityError:
            return False, "Group with this name already exists", None
    
    def update_group(
        self,
        user_id: str,
        group_id: str,
        name: Optional[str] = None,
        color: Optional[str] = None,
        icon: Optional[str] = None,
        can_see_location: Optional[bool] = None,
        location_precision: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Update a friend group.
        
        Args:
            user_id: Owner user ID
            group_id: Group ID
            name: New name (optional)
            color: New color (optional)
            icon: New icon (optional)
            can_see_location: New permission (optional)
            location_precision: New precision (optional)
            
        Returns:
            Tuple of (success, message)
        """
        cursor = self.conn.cursor()  # type: ignore
        
        updates: List[str] = []
        values: List[Any] = []
        
        if name is not None:
            updates.append("name = ?")
            values.append(name)
        if color is not None:
            updates.append("color = ?")
            values.append(color)
        if icon is not None:
            updates.append("icon = ?")
            values.append(icon)
        if can_see_location is not None:
            updates.append("can_see_location = ?")
            values.append(int(can_see_location))
        if location_precision is not None:
            updates.append("location_precision = ?")
            values.append(location_precision)
        
        if not updates:
            return False, "No updates provided"
        
        updates.append("updated_at = ?")
        values.append(time.time())
        values.extend([group_id, user_id])
        
        try:
            cursor.execute(
                f"UPDATE friend_groups SET {', '.join(updates)} WHERE id = ? AND user_id = ?",
                values
            )
            if cursor.rowcount == 0:
                return False, "Group not found"
            self.conn.commit()
            return True, "Group updated"
        except sqlite3.IntegrityError:
            return False, "Group name already exists"
    
    def delete_group(self, user_id: str, group_id: str) -> Tuple[bool, str]:
        """
        Delete a friend group.
        
        Args:
            user_id: Owner user ID
            group_id: Group ID
            
        Returns:
            Tuple of (success, message)
        """
        cursor = self.conn.cursor()
        
        # Remove all members first
        cursor.execute("DELETE FROM group_members WHERE group_id = ?", (group_id,))
        
        # Delete group
        cursor.execute(
            "DELETE FROM friend_groups WHERE id = ? AND user_id = ?",
            (group_id, user_id)
        )
        
        if cursor.rowcount == 0:
            return False, "Group not found"
        
        self.conn.commit()
        return True, "Group deleted"
    
    def add_member(
        self,
        user_id: str,
        group_id: str,
        friend_id: str
    ) -> Tuple[bool, str]:
        """
        Add a friend to a group.
        
        Args:
            user_id: Owner user ID
            group_id: Group ID
            friend_id: Friend's user ID
            
        Returns:
            Tuple of (success, message)
        """
        cursor = self.conn.cursor()
        
        # Verify group belongs to user
        cursor.execute(
            "SELECT id FROM friend_groups WHERE id = ? AND user_id = ?",
            (group_id, user_id)
        )
        if not cursor.fetchone():
            return False, "Group not found"
        
        # Add member
        try:
            cursor.execute("""
                INSERT INTO group_members (group_id, friend_id, added_at)
                VALUES (?, ?, ?)
            """, (group_id, friend_id, time.time()))
            self.conn.commit()
            return True, "Member added"
        except sqlite3.IntegrityError:
            return False, "Friend already in group"
    
    def remove_member(
        self,
        user_id: str,
        group_id: str,
        friend_id: str
    ) -> Tuple[bool, str]:
        """
        Remove a friend from a group.
        
        Args:
            user_id: Owner user ID
            group_id: Group ID
            friend_id: Friend's user ID
            
        Returns:
            Tuple of (success, message)
        """
        cursor = self.conn.cursor()
        
        # Verify group belongs to user
        cursor.execute(
            "SELECT id FROM friend_groups WHERE id = ? AND user_id = ?",
            (group_id, user_id)
        )
        if not cursor.fetchone():
            return False, "Group not found"
        
        # Remove member
        cursor.execute(
            "DELETE FROM group_members WHERE group_id = ? AND friend_id = ?",
            (group_id, friend_id)
        )
        
        if cursor.rowcount == 0:
            return False, "Friend not in group"
        
        self.conn.commit()
        return True, "Member removed"
    
    def get_groups(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all groups for a user with member counts.
        
        Args:
            user_id: User ID
            
        Returns:
            List of group data
        """
        cursor = self.conn.cursor()
        
        cursor.execute("""
            SELECT 
                g.id,
                g.name,
                g.color,
                g.icon,
                g.can_see_location,
                g.location_precision,
                g.created_at,
                g.updated_at,
                COUNT(m.id) as member_count
            FROM friend_groups g
            LEFT JOIN group_members m ON g.id = m.group_id
            WHERE g.user_id = ?
            GROUP BY g.id
            ORDER BY g.name ASC
        """, (user_id,))
        
        groups: List[Dict[str, Any]] = []
        for row in cursor.fetchall():
            groups.append({
                'id': row['id'],
                'name': row['name'],
                'color': row['color'],
                'icon': row['icon'],
                'can_see_location': bool(row['can_see_location']),
                'location_precision': row['location_precision'],
                'member_count': row['member_count'],
                'created_at': row['created_at'],
                'updated_at': row['updated_at']
            })
        
        return groups
    
    def get_group_members(
        self,
        user_id: str,
        group_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all members of a group.
        
        Args:
            user_id: Owner user ID
            group_id: Group ID
            
        Returns:
            List of member data
        """
        cursor = self.conn.cursor()
        
        # Verify group belongs to user
        cursor.execute(
            "SELECT id FROM friend_groups WHERE id = ? AND user_id = ?",
            (group_id, user_id)
        )
        if not cursor.fetchone():
            return []
        
        cursor.execute("""
            SELECT 
                m.friend_id,
                m.added_at,
                u.username,
                u.display_name,
                u.avatar_url
            FROM group_members m
            JOIN users u ON m.friend_id = u.id
            WHERE m.group_id = ?
            ORDER BY u.display_name ASC
        """, (group_id,))
        
        members: List[Dict[str, Any]] = []
        for row in cursor.fetchall():
            members.append({
                'user_id': row['friend_id'],
                'username': row['username'],
                'display_name': row['display_name'],
                'avatar_url': row['avatar_url'],
                'added_at': row['added_at']
            })
        
        return members
    
    def get_friend_groups(
        self,
        user_id: str,
        friend_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all groups a friend belongs to.
        
        Args:
            user_id: Owner user ID
            friend_id: Friend's user ID
            
        Returns:
            List of group data
        """
        cursor = self.conn.cursor()
        
        cursor.execute("""
            SELECT 
                g.id,
                g.name,
                g.color,
                g.icon
            FROM friend_groups g
            JOIN group_members m ON g.id = m.group_id
            WHERE g.user_id = ? AND m.friend_id = ?
        """, (user_id, friend_id))
        
        return [dict(row) for row in cursor.fetchall()]
    
    def get_location_permission(
        self,
        user_id: str,
        friend_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get the best location permission for a friend.
        Returns highest precision allowed across all groups.
        
        Args:
            user_id: Owner user ID
            friend_id: Friend's user ID
            
        Returns:
            Permission dict or None if no access
        """
        cursor = self.conn.cursor()
        
        # Get best permission across all groups the friend is in
        cursor.execute("""
            SELECT 
                g.can_see_location,
                g.location_precision
            FROM friend_groups g
            JOIN group_members m ON g.id = m.group_id
            WHERE g.user_id = ? AND m.friend_id = ? AND g.can_see_location = 1
            ORDER BY 
                CASE g.location_precision 
                    WHEN 'exact' THEN 1 
                    WHEN 'approximate' THEN 2 
                    WHEN 'city' THEN 3 
                END ASC
            LIMIT 1
        """, (user_id, friend_id))
        
        row = cursor.fetchone()
        if not row:
            return None
        
        return {
            'can_see_location': bool(row['can_see_location']),
            'precision': row['location_precision']
        }


# Singleton instance
_friend_groups: Optional[FriendGroups] = None


def get_friend_groups() -> FriendGroups:
    """Get or create the FriendGroups singleton."""
    global _friend_groups
    if _friend_groups is None:
        _friend_groups = FriendGroups()
    return _friend_groups
