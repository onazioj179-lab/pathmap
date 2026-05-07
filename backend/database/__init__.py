"""
PATHMAP - Database Package
==========================
PostgreSQL database with migrations and models.
"""
# pyright: reportUnknownVariableType=false

from .postgres import (  # type: ignore[attr-defined]
    # Engine & Sessions
    async_engine,
    sync_engine,
    AsyncSessionLocal,
    SyncSessionLocal,
    get_db,
    get_db_context,
    Base,
    
    # Models
    User,
    Session,
    Device,
    Location,
    Geofence,
    GeofenceEvent,
    ShareLink,
    AuditLog,
    
    # Utilities
    init_db,
    drop_db,
    check_db_connection,
    get_db_stats,
)

__all__ = [
    # Engine & Sessions
    "async_engine",
    "sync_engine",
    "AsyncSessionLocal",
    "SyncSessionLocal",
    "get_db",
    "get_db_context",
    "Base",
    
    # Models
    "User",
    "Session",
    "Device",
    "Location",
    "Geofence",
    "GeofenceEvent",
    "ShareLink",
    "AuditLog",
    
    # Utilities
    "init_db",
    "drop_db",
    "check_db_connection",
    "get_db_stats",
]
