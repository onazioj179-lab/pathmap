"""
PATHMAP - Admin Dashboard API
=============================
Administrative endpoints for system management, analytics, and monitoring.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
import logging

from auth.admin_auth import require_admin, AdminUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ============== MODELS ==============

class SystemStats(BaseModel):
    """System statistics."""
    total_users: int
    active_users_24h: int
    total_devices: int
    active_devices_24h: int
    total_locations: int
    total_geofences: int
    storage_used_mb: float
    api_requests_24h: int


class UserListItem(BaseModel):
    """User list item."""
    id: str
    username: str
    email: str
    display_name: Optional[str]
    is_active: bool
    is_verified: bool
    is_admin: bool
    devices_count: int
    created_at: datetime
    last_login: Optional[datetime]


class UserDetails(UserListItem):
    """User details."""
    phone: Optional[str]
    settings: Dict[str, Any]
    failed_login_attempts: int
    two_factor_enabled: bool


class AuditLogEntry(BaseModel):
    """Audit log entry."""
    id: int
    user_id: Optional[str]
    username: Optional[str]
    action: str
    resource: str
    resource_id: Optional[str]
    ip_address: Optional[str]
    created_at: datetime
    details: Optional[Dict[str, Any]]


class SystemHealth(BaseModel):
    """System health status."""
    status: str  # healthy, degraded, unhealthy
    database: str
    redis: str
    storage: str
    api: str
    uptime_seconds: float
    version: str


class AnalyticsData(BaseModel):
    """Analytics data point."""
    date: str
    value: float
    label: Optional[str]


# ============== MOCK DATA (Replace with real DB queries) ==============

async def get_mock_stats() -> SystemStats:
    """Get mock system stats."""
    return SystemStats(
        total_users=1250,
        active_users_24h=342,
        total_devices=2847,
        active_devices_24h=891,
        total_locations=1547382,
        total_geofences=4821,
        storage_used_mb=2847.5,
        api_requests_24h=158432
    )


async def get_mock_users(
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    status: Optional[str] = None
) -> List[UserListItem]:
    """Get mock user list."""
    users: List[UserListItem] = []
    for i in range(limit):
        users.append(UserListItem(
            id=f"user-{page * limit + i}",
            username=f"user{page * limit + i}",
            email=f"user{page * limit + i}@example.com",
            display_name=f"User {page * limit + i}",
            is_active=True,
            is_verified=i % 3 != 0,
            is_admin=i == 0,
            devices_count=i % 5 + 1,
            created_at=datetime.now(timezone.utc) - timedelta(days=i * 10),
            last_login=datetime.now(timezone.utc) - timedelta(hours=i * 2)
        ))
    return users


async def get_mock_audit_logs(
    page: int = 1,
    limit: int = 50,
    user_id: Optional[str] = None,
    action: Optional[str] = None
) -> List[AuditLogEntry]:
    """Get mock audit logs."""
    actions = ["login", "logout", "create", "update", "delete", "view"]
    resources = ["user", "device", "geofence", "location", "share"]
    
    logs: List[AuditLogEntry] = []
    for i in range(limit):
        logs.append(AuditLogEntry(
            id=page * limit + i,
            user_id=f"user-{i % 10}",
            username=f"user{i % 10}",
            action=actions[i % len(actions)],
            resource=resources[i % len(resources)],
            resource_id=f"resource-{i}",
            ip_address=f"192.168.1.{i % 255}",
            created_at=datetime.now(timezone.utc) - timedelta(minutes=i * 5),
            details={"browser": "Chrome", "os": "Windows"}
        ))
    return logs


# ============== ENDPOINTS ==============

@router.get("/stats", response_model=SystemStats)
async def get_system_stats(admin_user: AdminUser = Depends(require_admin)):
    """Get system-wide statistics."""
    logger.info(f"Admin {admin_user.username} requested system stats")
    return await get_mock_stats()


@router.get("/health", response_model=SystemHealth)
async def get_system_health():
    """Get system health status."""
    # Check various services
    db_status = "healthy"  # Would check actual DB connection
    redis_status = "healthy"  # Would check Redis
    storage_status = "healthy"  # Would check storage
    
    overall = "healthy"
    if any(s != "healthy" for s in [db_status, redis_status, storage_status]):
        overall = "degraded"
    
    return SystemHealth(
        status=overall,
        database=db_status,
        redis=redis_status,
        storage=storage_status,
        api="healthy",
        uptime_seconds=86400.0,  # Would calculate from start time
        version="1.0.0"
    )


@router.get("/users", response_model=List[UserListItem])
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = Query(None, regex="^(active|inactive|all)$"),
    admin_user: AdminUser = Depends(require_admin)
):
    """List all users with pagination."""
    logger.info(f"Admin {admin_user.username} requested user list (page={page})")
    return await get_mock_users(page, limit, search, status)


@router.get("/users/{user_id}", response_model=UserDetails)
async def get_user(
    user_id: str,
    admin_user: AdminUser = Depends(require_admin)
):
    """Get user details."""
    logger.info(f"Admin {admin_user.username} requested details for user {user_id}")
    # Would fetch from DB
    return UserDetails(
        id=user_id,
        username="testuser",
        email="test@example.com",
        display_name="Test User",
        phone="+1234567890",
        is_active=True,
        is_verified=True,
        is_admin=False,
        devices_count=3,
        created_at=datetime.now(timezone.utc) - timedelta(days=30),
        last_login=datetime.now(timezone.utc) - timedelta(hours=2),
        settings={"notifications": True, "theme": "dark"},
        failed_login_attempts=0,
        two_factor_enabled=False
    )


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    is_active: Optional[bool] = None,
    is_verified: Optional[bool] = None,
    is_admin: Optional[bool] = None,
    admin_user: AdminUser = Depends(require_admin)
) -> Dict[str, Any]:
    """Update user status."""
    logger.warning(f"Admin {admin_user.username} updating user {user_id}: active={is_active}, verified={is_verified}, admin={is_admin}")
    # Would update in DB
    return {
        "success": True,
        "message": f"User {user_id} updated",
        "changes": {
            "is_active": is_active,
            "is_verified": is_verified,
            "is_admin": is_admin
        }
    }


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    permanent: bool = False,
    admin_user: AdminUser = Depends(require_admin)
) -> Dict[str, Any]:
    """Delete or deactivate user."""
    action = "permanently deleted" if permanent else "deactivated"
    logger.warning(f"Admin {admin_user.username} {action} user {user_id}")
    return {
        "success": True,
        "message": f"User {user_id} {action}"
    }


@router.get("/audit", response_model=List[AuditLogEntry])
async def get_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    admin_user: AdminUser = Depends(require_admin)
):
    """Get audit logs with filtering."""
    logger.info(f"Admin {admin_user.username} requested audit logs")
    return await get_mock_audit_logs(page, limit, user_id, action)


@router.get("/analytics/users")
async def get_user_analytics(
    period: str = Query("7d", regex="^(24h|7d|30d|90d)$"),
    admin_user: AdminUser = Depends(require_admin)
) -> List[AnalyticsData]:
    """Get user registration analytics."""
    days = {"24h": 1, "7d": 7, "30d": 30, "90d": 90}[period]
    
    data: List[AnalyticsData] = []
    for i in range(days):
        date = datetime.now(timezone.utc) - timedelta(days=days - i - 1)
        data.append(AnalyticsData(
            date=date.strftime("%Y-%m-%d"),
            value=50 + (i * 5) % 30,
            label="New Users"
        ))
    return data


@router.get("/analytics/locations")
async def get_location_analytics(
    period: str = Query("7d", regex="^(24h|7d|30d|90d)$"),
    admin_user: AdminUser = Depends(require_admin)
) -> List[AnalyticsData]:
    """Get location update analytics."""
    days = {"24h": 1, "7d": 7, "30d": 30, "90d": 90}[period]
    
    data: List[AnalyticsData] = []
    for i in range(days):
        date = datetime.now(timezone.utc) - timedelta(days=days - i - 1)
        data.append(AnalyticsData(
            date=date.strftime("%Y-%m-%d"),
            value=10000 + (i * 500) % 5000,
            label="Location Updates"
        ))
    return data


@router.get("/analytics/api")
async def get_api_analytics(
    period: str = Query("7d", regex="^(24h|7d|30d|90d)$"),
    admin_user: AdminUser = Depends(require_admin)
) -> Dict[str, Any]:
    """Get API usage analytics."""
    return {
        "total_requests": 158432,
        "avg_response_time_ms": 45.2,
        "error_rate": 0.02,
        "top_endpoints": [
            {"path": "/api/v1/tracking/location", "count": 45000},
            {"path": "/api/v1/auth/login", "count": 12000},
            {"path": "/api/v1/route", "count": 8500},
        ],
        "status_codes": {
            "200": 145000,
            "201": 8000,
            "400": 2000,
            "401": 1500,
            "500": 432
        }
    }


@router.post("/broadcast")
async def send_broadcast(
    title: str,
    message: str,
    target: str = Query("all", regex="^(all|active|admin)$"),
    admin_user: AdminUser = Depends(require_admin)
) -> Dict[str, Any]:
    """Send broadcast notification to users."""
    logger.warning(f"Admin {admin_user.username} sending broadcast to {target} users: {title}")
    # Would send push/email notifications
    return {
        "success": True,
        "message": f"Broadcast sent to {target} users",
        "recipients_count": 1000
    }


@router.post("/maintenance")
async def set_maintenance_mode(
    enabled: bool,
    message: Optional[str] = "System maintenance in progress",
    admin_user: AdminUser = Depends(require_admin)
) -> Dict[str, Any]:
    """Enable/disable maintenance mode."""
    logger.warning(f"Admin {admin_user.username} set maintenance mode: {enabled}")
    return {
        "success": True,
        "maintenance_mode": enabled,
        "message": message
    }


@router.get("/config")
async def get_system_config(
    admin_user: AdminUser = Depends(require_admin)
) -> Dict[str, Any]:
    """Get system configuration."""
    return {
        "environment": os.getenv("ENVIRONMENT", "development"),
        "version": "1.0.0",
        "features": {
            "registration_enabled": True,
            "email_verification_required": True,
            "two_factor_available": True,
            "social_login_enabled": False
        },
        "limits": {
            "max_devices_per_user": 10,
            "max_geofences_per_user": 50,
            "location_history_days": 30,
            "share_link_max_hours": 168
        },
        "integrations": {
            "sentry_enabled": bool(os.getenv("SENTRY_DSN")),
            "sendgrid_enabled": bool(os.getenv("SENDGRID_API_KEY")),
            "s3_enabled": bool(os.getenv("AWS_S3_BUCKET"))
        }
    }


@router.patch("/config")
async def update_system_config(
    config: Dict[str, Any],
    admin_user: AdminUser = Depends(require_admin)
) -> Dict[str, Any]:
    """Update system configuration."""
    logger.warning(f"Admin {admin_user.username} updating config keys: {list(config.keys())}")
    # Would update config in DB/cache
    return {
        "success": True,
        "message": "Configuration updated",
        "updated_keys": list(config.keys())
    }


@router.post("/backup")
async def trigger_backup(
    backup_type: str = Query("manual", regex="^(manual|full)$"),
    admin_user: AdminUser = Depends(require_admin)
) -> Dict[str, Any]:
    """Trigger database backup."""
    logger.warning(f"Admin {admin_user.username} triggering {backup_type} backup")
    from database.backup import BackupManager
    
    manager = BackupManager()
    result = manager.create_backup(backup_type)
    
    if result:
        return {
            "success": True,
            "message": "Backup created",
            "file": result
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Backup failed"
        )


@router.get("/backups")
async def list_backups(
    admin_user: AdminUser = Depends(require_admin)
) -> List[Dict[str, Any]]:
    """List available backups."""
    from database.backup import BackupManager
    
    manager = BackupManager()
    return manager.list_backups()
