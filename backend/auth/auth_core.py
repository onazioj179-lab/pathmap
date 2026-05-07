"""
PATHMAP - Authentication Core
=============================
Core authentication logic: registration, login, sessions.
SQLite-based for 20+ year stability.
"""

import sqlite3
import time
import uuid
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass

from .password_utils import PasswordUtils
from .jwt_handler import get_jwt_handler


@dataclass
class User:
    """User data model"""
    id: str
    username: str
    email: str
    phone: Optional[str]
    display_name: str
    avatar_url: Optional[str]
    password_hash: str
    is_verified: bool
    is_active: bool
    created_at: float
    updated_at: float
    last_login: Optional[float]
    
    def to_public_dict(self) -> Dict[str, Any]:
        """Return user data safe for public exposure (no password)."""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'phone': self.phone,
            'display_name': self.display_name,
            'avatar_url': self.avatar_url,
            'is_verified': self.is_verified,
            'created_at': self.created_at,
            'last_login': self.last_login
        }


@dataclass
class Session:
    """User session data model"""
    id: str
    user_id: str
    device_id: str
    device_name: str
    ip_address: str
    refresh_token_hash: str
    created_at: float
    last_active: float
    expires_at: float
    is_active: bool


class AuthCore:
    """
    Core Authentication Engine.
    
    Features:
    - User registration with email/username
    - Password authentication
    - JWT token management
    - Session tracking
    - Account verification
    """
    
    def __init__(self, db_path: str = "pathmap_users.db"):
        """
        Initialize AuthCore with SQLite database.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.conn: sqlite3.Connection = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.jwt_handler = get_jwt_handler()
        self._initialize_database()
    
    def _initialize_database(self):
        """Initialize SQLite database with user tables."""
        cursor = self.conn.cursor()
        
        # Users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT UNIQUE,
                display_name TEXT NOT NULL,
                avatar_url TEXT,
                password_hash TEXT NOT NULL,
                is_verified INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                last_login REAL
            )
        """)
        
        # Sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                device_name TEXT,
                ip_address TEXT,
                refresh_token_hash TEXT NOT NULL,
                created_at REAL NOT NULL,
                last_active REAL NOT NULL,
                expires_at REAL NOT NULL,
                is_active INTEGER DEFAULT 1,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        
        # Verification codes table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS verification_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                code TEXT NOT NULL,
                code_type TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                used INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        
        # Password reset tokens table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS password_resets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                token_hash TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                used INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        
        # OAuth connections table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS oauth_connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                provider_user_id TEXT NOT NULL,
                access_token TEXT,
                refresh_token TEXT,
                token_expires_at REAL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(provider, provider_user_id)
            )
        """)
        
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active)")
        
        self.conn.commit()
    
    def register(
        self,
        username: str,
        email: str,
        password: str,
        display_name: Optional[str] = None,
        phone: Optional[str] = None
    ) -> Tuple[bool, str, Optional[User]]:
        """
        Register a new user.
        
        Args:
            username: Unique username
            email: Unique email address
            password: Plain text password (will be hashed)
            display_name: Display name (defaults to username)
            phone: Optional phone number
            
        Returns:
            Tuple of (success, message, user_or_none)
        """
        cursor = self.conn.cursor()
        
        # Validate inputs
        if len(username) < 3:
            return False, "Username must be at least 3 characters", None
        if len(password) < 8:
            return False, "Password must be at least 8 characters", None
        if '@' not in email:
            return False, "Invalid email address", None
        
        # Check if username exists
        cursor.execute("SELECT id FROM users WHERE username = ?", (username.lower(),))
        if cursor.fetchone():
            return False, "Username already taken", None
        
        # Check if email exists
        cursor.execute("SELECT id FROM users WHERE email = ?", (email.lower(),))
        if cursor.fetchone():
            return False, "Email already registered", None
        
        # Check if phone exists (if provided)
        if phone:
            cursor.execute("SELECT id FROM users WHERE phone = ?", (phone,))
            if cursor.fetchone():
                return False, "Phone number already registered", None
        
        # Create user
        now = time.time()
        user_id = str(uuid.uuid4())
        password_hash = PasswordUtils.hash_password(password)
        
        user = User(
            id=user_id,
            username=username.lower(),
            email=email.lower(),
            phone=phone,
            display_name=display_name or username,
            avatar_url=None,
            password_hash=password_hash,
            is_verified=False,
            is_active=True,
            created_at=now,
            updated_at=now,
            last_login=None
        )
        
        try:
            cursor.execute("""
                INSERT INTO users (
                    id, username, email, phone, display_name, avatar_url,
                    password_hash, is_verified, is_active, created_at, updated_at, last_login
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user.id, user.username, user.email, user.phone,
                user.display_name, user.avatar_url, user.password_hash,
                int(user.is_verified), int(user.is_active),
                user.created_at, user.updated_at, user.last_login
            ))
            self.conn.commit()
            return True, "Registration successful", user
            
        except sqlite3.IntegrityError as e:
            return False, f"Registration failed: {str(e)}", None
    
    def login(
        self,
        identifier: str,
        password: str,
        device_id: str = "unknown",
        device_name: str = "Unknown Device",
        ip_address: str = "0.0.0.0"
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Login a user with username/email and password.
        
        Args:
            identifier: Username or email
            password: Plain text password
            device_id: Device identifier for session
            device_name: Human-readable device name
            ip_address: Client IP address
            
        Returns:
            Tuple of (success, message, token_data_or_none)
        """
        cursor = self.conn.cursor()
        
        # Find user by username or email
        cursor.execute("""
            SELECT * FROM users 
            WHERE (username = ? OR email = ?) AND is_active = 1
        """, (identifier.lower(), identifier.lower()))
        
        row = cursor.fetchone()
        if not row:
            return False, "Invalid username or password", None
        
        user = self._row_to_user(row)
        
        # Verify password
        if not PasswordUtils.verify_password(password, user.password_hash):
            return False, "Invalid username or password", None
        
        # Update last login
        now = time.time()
        cursor.execute(
            "UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?",
            (now, now, user.id)
        )
        
        # Create tokens
        tokens = self.jwt_handler.create_token_pair(
            user_id=user.id,
            username=user.username,
            email=user.email
        )
        
        # Create session
        session_id = str(uuid.uuid4())
        refresh_token_hash = PasswordUtils.hash_password(tokens['refresh_token'][:32])
        
        cursor.execute("""
            INSERT INTO sessions (
                id, user_id, device_id, device_name, ip_address,
                refresh_token_hash, created_at, last_active, expires_at, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        """, (
            session_id, user.id, device_id, device_name, ip_address,
            refresh_token_hash, now, now, now + self.jwt_handler.REFRESH_TOKEN_EXPIRE
        ))
        
        self.conn.commit()
        
        return True, "Login successful", {
            **tokens,
            'user': user.to_public_dict(),
            'session_id': session_id
        }
    
    def logout(self, session_id: str) -> bool:
        """
        Logout a session.
        
        Args:
            session_id: Session ID to invalidate
            
        Returns:
            True if session was found and invalidated
        """
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE sessions SET is_active = 0 WHERE id = ?",
            (session_id,)
        )
        self.conn.commit()
        return cursor.rowcount > 0
    
    def logout_all(self, user_id: str) -> int:
        """
        Logout all sessions for a user.
        
        Args:
            user_id: User ID
            
        Returns:
            Number of sessions invalidated
        """
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE sessions SET is_active = 0 WHERE user_id = ?",
            (user_id,)
        )
        self.conn.commit()
        return cursor.rowcount
    
    def get_user(self, user_id: str) -> Optional[User]:
        """Get user by ID."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return self._row_to_user(row) if row else None
    
    def get_user_by_username(self, username: str) -> Optional[User]:
        """Get user by username."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username.lower(),))
        row = cursor.fetchone()
        return self._row_to_user(row) if row else None
    
    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email.lower(),))
        row = cursor.fetchone()
        return self._row_to_user(row) if row else None
    
    def update_profile(
        self,
        user_id: str,
        display_name: Optional[str] = None,
        avatar_url: Optional[str] = None,
        phone: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Update user profile."""
        cursor = self.conn.cursor()
        
        updates: List[str] = []
        values: List[Any] = []
        
        if display_name is not None:
            updates.append("display_name = ?")
            values.append(display_name)
        if avatar_url is not None:
            updates.append("avatar_url = ?")
            values.append(avatar_url)
        if phone is not None:
            updates.append("phone = ?")
            values.append(phone)
        
        if not updates:
            return False, "No updates provided"
        
        updates.append("updated_at = ?")
        values.append(time.time())
        values.append(user_id)
        
        try:
            cursor.execute(
                f"UPDATE users SET {', '.join(updates)} WHERE id = ?",
                values
            )
            self.conn.commit()
            return True, "Profile updated"
        except sqlite3.IntegrityError:
            return False, "Phone number already in use"
    
    def change_password(
        self,
        user_id: str,
        current_password: str,
        new_password: str
    ) -> Tuple[bool, str]:
        """Change user password."""
        user = self.get_user(user_id)
        if not user:
            return False, "User not found"
        
        if not PasswordUtils.verify_password(current_password, user.password_hash):
            return False, "Current password is incorrect"
        
        if len(new_password) < 8:
            return False, "New password must be at least 8 characters"
        
        new_hash = PasswordUtils.hash_password(new_password)
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (new_hash, time.time(), user_id)
        )
        
        # Invalidate all sessions for security
        self.logout_all(user_id)
        self.conn.commit()
        
        return True, "Password changed successfully"
    
    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify an access token and return payload."""
        return self.jwt_handler.verify_token(token)
    
    def refresh_token(self, refresh_token: str) -> Optional[Dict[str, Any]]:
        """Refresh an access token."""
        payload = self.jwt_handler.verify_token(refresh_token)
        if not payload or payload.get('type') != 'refresh':
            return None
        
        # Create new access token
        new_access = self.jwt_handler.create_token(
            user_id=payload['sub'],
            username=payload['username'],
            email=payload['email'],
            token_type='access'
        )
        
        return {
            'access_token': new_access,
            'token_type': 'bearer',
            'expires_in': self.jwt_handler.ACCESS_TOKEN_EXPIRE
        }
    
    def search_users(
        self,
        query: str,
        limit: int = 20,
        exclude_user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Search users by username, email, or display name.
        
        Args:
            query: Search query
            limit: Maximum results
            exclude_user_id: User ID to exclude (typically current user)
            
        Returns:
            List of matching users (public data only)
        """
        cursor = self.conn.cursor()
        search_pattern = f"%{query}%"
        
        if exclude_user_id:
            cursor.execute("""
                SELECT id, username, display_name, avatar_url 
                FROM users 
                WHERE is_active = 1 
                AND id != ?
                AND (username LIKE ? OR display_name LIKE ? OR email LIKE ?)
                LIMIT ?
            """, (exclude_user_id, search_pattern, search_pattern, search_pattern, limit))
        else:
            cursor.execute("""
                SELECT id, username, display_name, avatar_url 
                FROM users 
                WHERE is_active = 1 
                AND (username LIKE ? OR display_name LIKE ? OR email LIKE ?)
                LIMIT ?
            """, (search_pattern, search_pattern, search_pattern, limit))
        
        return [dict(row) for row in cursor.fetchall()]
    
    def _row_to_user(self, row: sqlite3.Row) -> User:
        """Convert database row to User object."""
        return User(
            id=row['id'],
            username=row['username'],
            email=row['email'],
            phone=row['phone'],
            display_name=row['display_name'],
            avatar_url=row['avatar_url'],
            password_hash=row['password_hash'],
            is_verified=bool(row['is_verified']),
            is_active=bool(row['is_active']),
            created_at=row['created_at'],
            updated_at=row['updated_at'],
            last_login=row['last_login']
        )


# Singleton instance
_auth_core: Optional[AuthCore] = None


def get_auth_core() -> AuthCore:
    """Get or create the AuthCore singleton."""
    global _auth_core
    if _auth_core is None:
        _auth_core = AuthCore()
    return _auth_core
