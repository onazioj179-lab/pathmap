"""
PATHMAP - PostgreSQL Database Module
====================================
Production-ready PostgreSQL with connection pooling, migrations, and async support.
"""
# pyright: reportMissingImports=false
# pyright: reportUnknownMemberType=false
# pyright: reportUnknownVariableType=false
# pyright: reportUnknownArgumentType=false
# pyright: reportUnusedImport=false
# pyright: reportGeneralTypeIssues=false

import asyncio  # noqa: F401
import os
from datetime import datetime
from typing import Optional, List, Dict, Any, AsyncGenerator  # noqa: F401
from contextlib import asynccontextmanager
import logging

from sqlalchemy import (  # type: ignore[import-not-found]
    create_engine,
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    Text,  # noqa: F401
    ForeignKey,
    Index,
    UniqueConstraint,  # noqa: F401
    JSON,  # noqa: F401
    Enum as SQLEnum,  # noqa: F401
    event,  # noqa: F401
)
from sqlalchemy.ext.asyncio import (  # type: ignore[import-not-found]
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.orm import (  # type: ignore[import-not-found]
    declarative_base,
    relationship,
    sessionmaker,
    Session,
)
from sqlalchemy.pool import QueuePool  # type: ignore[import-not-found]
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY  # type: ignore[import-not-found]
import uuid

logger = logging.getLogger(__name__)

# ============== CONFIGURATION ==============

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://pathmap:pathmap@localhost:5432/pathmap"
)

# Sync URL for migrations
SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")

# Pool settings
POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))
MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))
POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))


# ============== ENGINE SETUP ==============

# Async engine for application
async_engine = create_async_engine(
    DATABASE_URL,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=POOL_TIMEOUT,
    pool_pre_ping=True,
    echo=os.getenv("SQL_DEBUG", "false").lower() == "true",
)

# Sync engine for migrations
sync_engine = create_engine(
    SYNC_DATABASE_URL,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=POOL_TIMEOUT,
    pool_pre_ping=True,
)

# Session factories
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

SyncSessionLocal = sessionmaker(
    sync_engine,
    class_=Session,
    expire_on_commit=False,
)

# Base class for models
Base = declarative_base()


# ============== DEPENDENCY INJECTION ==============

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ============== BASE MODELS ==============

def _utc_now() -> datetime:
    """Get current UTC time (timezone-aware)."""
    from datetime import timezone
    return datetime.now(timezone.utc)


class TimestampMixin:
    """Mixin for created_at and updated_at timestamps."""
    created_at = Column(DateTime, default=_utc_now, nullable=False)
    updated_at = Column(DateTime, default=_utc_now, onupdate=_utc_now, nullable=False)


class UUIDMixin:
    """Mixin for UUID primary key."""
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


# ============== USER MODEL ==============

class User(Base, UUIDMixin, TimestampMixin):
    """User account model."""
    __tablename__ = "users"
    
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    password_salt = Column(String(64), nullable=False)
    display_name = Column(String(100))
    avatar_url = Column(String(500))
    phone = Column(String(20))
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    
    # Security
    last_login = Column(DateTime)
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime)
    two_factor_enabled = Column(Boolean, default=False)
    two_factor_secret = Column(String(32))
    
    # Settings
    settings = Column(JSONB, default={})
    
    # Relationships
    devices = relationship("Device", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    geofences = relationship("Geofence", back_populates="user", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("ix_users_email_lower", "email"),
        Index("ix_users_username_lower", "username"),
    )


# ============== SESSION MODEL ==============

class Session(Base, UUIDMixin, TimestampMixin):
    """User session / refresh token model."""
    __tablename__ = "sessions"
    
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    refresh_token = Column(String(255), unique=True, nullable=False, index=True)
    device_info = Column(JSONB, default={})
    ip_address = Column(String(45))
    user_agent = Column(String(500))
    
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    revoked_at = Column(DateTime)
    
    # Relationships
    user = relationship("User", back_populates="sessions")


# ============== DEVICE MODEL ==============

class Device(Base, UUIDMixin, TimestampMixin):
    """Tracked device model."""
    __tablename__ = "devices"
    
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    device_type = Column(String(50), nullable=False)  # phone, tablet, watch
    platform = Column(String(50))  # iOS, Android, Web
    model = Column(String(100))
    os_version = Column(String(50))
    app_version = Column(String(20))
    
    # Push notifications
    push_token = Column(String(500))
    push_enabled = Column(Boolean, default=True)
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    last_seen = Column(DateTime)
    battery_level = Column(Float)
    
    # Settings
    settings = Column(JSONB, default={})
    
    # Relationships
    user = relationship("User", back_populates="devices")
    locations = relationship("Location", back_populates="device", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("ix_devices_user_active", "user_id", "is_active"),
    )


# ============== LOCATION MODEL ==============

class Location(Base, TimestampMixin):
    """Location history model."""
    __tablename__ = "locations"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    
    # Position
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    altitude = Column(Float)
    accuracy = Column(Float)
    altitude_accuracy = Column(Float)
    
    # Motion
    speed = Column(Float)
    heading = Column(Float)
    
    # Metadata
    source = Column(String(20))  # gps, network, fused
    timestamp = Column(DateTime, nullable=False, index=True)
    
    # Relationships
    device = relationship("Device", back_populates="locations")
    
    __table_args__ = (
        Index("ix_locations_device_timestamp", "device_id", "timestamp"),
        Index("ix_locations_coords", "latitude", "longitude"),
    )


# ============== GEOFENCE MODEL ==============

class Geofence(Base, UUIDMixin, TimestampMixin):
    """Geofence zone model."""
    __tablename__ = "geofences"
    
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    
    # Zone
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radius = Column(Float, nullable=False)  # meters
    
    # Type
    zone_type = Column(String(50), default="custom")  # home, work, school, custom
    
    # Settings
    notify_on_enter = Column(Boolean, default=True)
    notify_on_exit = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Schedule (optional)
    schedule = Column(JSONB)  # { days: [0-6], start_time, end_time }
    
    # Relationships
    user = relationship("User", back_populates="geofences")
    events = relationship("GeofenceEvent", back_populates="geofence", cascade="all, delete-orphan")


# ============== GEOFENCE EVENT MODEL ==============

class GeofenceEvent(Base, TimestampMixin):
    """Geofence entry/exit event model."""
    __tablename__ = "geofence_events"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    geofence_id = Column(UUID(as_uuid=True), ForeignKey("geofences.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    
    event_type = Column(String(10), nullable=False)  # enter, exit
    timestamp = Column(DateTime, nullable=False, index=True)
    
    # Location at event
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    
    # Notification
    notified = Column(Boolean, default=False)
    
    # Relationships
    geofence = relationship("Geofence", back_populates="events")
    
    __table_args__ = (
        Index("ix_geofence_events_geofence_timestamp", "geofence_id", "timestamp"),
    )


# ============== SHARE LINK MODEL ==============

class ShareLink(Base, UUIDMixin, TimestampMixin):
    """Location sharing link model."""
    __tablename__ = "share_links"
    
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(100), unique=True, nullable=False, index=True)
    
    # Access settings
    expires_at = Column(DateTime, nullable=False)
    max_views = Column(Integer)
    view_count = Column(Integer, default=0)
    
    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    revoked_at = Column(DateTime)
    
    __table_args__ = (
        Index("ix_share_links_token_active", "token", "is_active"),
    )


# ============== AUDIT LOG MODEL ==============

class AuditLog(Base, TimestampMixin):
    """Audit log for security and compliance."""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    
    action = Column(String(50), nullable=False, index=True)  # login, logout, create, update, delete
    resource = Column(String(50), nullable=False)  # user, device, geofence, etc
    resource_id = Column(String(100))
    
    # Details
    details = Column(JSONB)
    ip_address = Column(String(45))
    user_agent = Column(String(500))
    
    __table_args__ = (
        Index("ix_audit_logs_user_created", "user_id", "created_at"),
        Index("ix_audit_logs_action_created", "action", "created_at"),
    )


# ============== DATABASE UTILITIES ==============

async def init_db():
    """Initialize database - create all tables."""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized successfully")


async def drop_db():
    """Drop all tables - USE WITH CAUTION."""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    logger.warning("All database tables dropped")


async def check_db_connection() -> bool:
    """Check if database is reachable."""
    try:
        async with async_engine.begin() as conn:
            await conn.execute("SELECT 1")
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False


def get_db_stats() -> Dict[str, Any]:
    """Get database connection pool statistics."""
    pool = async_engine.pool
    return {
        "pool_size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "invalid": pool.invalidatedcount(),
    }
