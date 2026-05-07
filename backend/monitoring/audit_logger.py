"""
PathMap Audit Logging System

Records security events, authentication attempts, API access, and data modifications.
Supports PostgreSQL persistence and real-time alerting.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field, asdict
from enum import Enum
from collections import deque
import uuid

logger = logging.getLogger(__name__)


class EventCategory(str, Enum):
    """Audit event categories."""
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    DATA_ACCESS = "data_access"
    DATA_MODIFICATION = "data_modification"
    SECURITY = "security"
    SYSTEM = "system"
    API = "api"


class EventType(str, Enum):
    """Specific audit event types."""
    # Authentication
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILURE = "login_failure"
    LOGOUT = "logout"
    TOKEN_REFRESH = "token_refresh"
    TOKEN_REVOKED = "token_revoked"
    PASSWORD_CHANGE = "password_change"
    PASSWORD_RESET_REQUEST = "password_reset_request"
    TWO_FACTOR_ENABLED = "two_factor_enabled"
    TWO_FACTOR_DISABLED = "two_factor_disabled"
    
    # Authorization
    ACCESS_DENIED = "access_denied"
    PERMISSION_GRANTED = "permission_granted"
    PERMISSION_REVOKED = "permission_revoked"
    RATE_LIMITED = "rate_limited"
    
    # Data Access
    LOCATION_VIEWED = "location_viewed"
    DEVICE_LIST_VIEWED = "device_list_viewed"
    GEOFENCE_LIST_VIEWED = "geofence_list_viewed"
    SHARING_SESSION_VIEWED = "sharing_session_viewed"
    
    # Data Modification
    USER_CREATED = "user_created"
    USER_UPDATED = "user_updated"
    USER_DELETED = "user_deleted"
    DEVICE_REGISTERED = "device_registered"
    DEVICE_UPDATED = "device_updated"
    DEVICE_DELETED = "device_deleted"
    GEOFENCE_CREATED = "geofence_created"
    GEOFENCE_UPDATED = "geofence_updated"
    GEOFENCE_DELETED = "geofence_deleted"
    SHARING_STARTED = "sharing_started"
    SHARING_STOPPED = "sharing_stopped"
    
    # Security
    TUNNEL_CONNECTED = "tunnel_connected"
    TUNNEL_DISCONNECTED = "tunnel_disconnected"
    KEY_ROTATION = "key_rotation"
    ENCRYPTION_FAILURE = "encryption_failure"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    BRUTE_FORCE_DETECTED = "brute_force_detected"
    IP_BLOCKED = "ip_blocked"
    
    # System
    SERVICE_STARTED = "service_started"
    SERVICE_STOPPED = "service_stopped"
    CONFIG_CHANGED = "config_changed"
    BACKUP_CREATED = "backup_created"
    BACKUP_RESTORED = "backup_restored"


class EventStatus(str, Enum):
    """Audit event outcome status."""
    SUCCESS = "success"
    FAILURE = "failure"
    BLOCKED = "blocked"


@dataclass
class AuditEvent:
    """Represents a single audit log entry."""
    event_type: EventType
    event_category: EventCategory
    action: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    status: EventStatus = EventStatus.SUCCESS
    details: Dict[str, Any] = field(default_factory=dict)
    request_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            "timestamp": self.timestamp.isoformat(),
            "user_id": self.user_id,
            "event_type": self.event_type.value,
            "event_category": self.event_category.value,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "action": self.action,
            "status": self.status.value,
            "details": self.details,
            "request_id": self.request_id,
        }
    
    def to_json(self) -> str:
        """Serialize to JSON."""
        return json.dumps(self.to_dict())


class AuditLogger:
    """
    Main audit logging service.
    
    Supports:
    - In-memory buffering for high throughput
    - Async PostgreSQL persistence
    - Real-time alerting for security events
    - Query interface for compliance
    """
    
    def __init__(
        self,
        buffer_size: int = 1000,
        flush_interval_seconds: float = 5.0,
        db_url: Optional[str] = None,
    ):
        self.buffer: deque = deque(maxlen=buffer_size)
        self.flush_interval = flush_interval_seconds
        self.db_url = db_url
        self._db_pool = None
        self._flush_task: Optional[asyncio.Task] = None
        self._running = False
        
        # Security event thresholds for alerting
        self.alert_thresholds = {
            EventType.LOGIN_FAILURE: 5,  # 5 failures triggers alert
            EventType.ACCESS_DENIED: 10,
            EventType.RATE_LIMITED: 20,
        }
        self.event_counts: Dict[str, Dict[str, int]] = {}  # ip -> event_type -> count
        
    async def start(self):
        """Start the audit logger background tasks."""
        if self._running:
            return
            
        self._running = True
        
        # Initialize database connection if URL provided
        if self.db_url:
            await self._init_db()
            
        # Start background flush task
        self._flush_task = asyncio.create_task(self._periodic_flush())
        logger.info("Audit logger started")
        
    async def stop(self):
        """Stop the audit logger and flush remaining events."""
        self._running = False
        
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
                
        # Final flush
        await self._flush_to_db()
        
        if self._db_pool:
            await self._db_pool.close()
            
        logger.info("Audit logger stopped")
        
    async def _init_db(self):
        """Initialize database connection pool."""
        try:
            import asyncpg
            self._db_pool = await asyncpg.create_pool(
                self.db_url.replace("+asyncpg", "").replace("postgresql", "postgres"),
                min_size=2,
                max_size=10,
            )
            logger.info("Audit logger connected to database")
        except ImportError:
            logger.warning("asyncpg not installed - audit logs will not be persisted")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            
    async def _periodic_flush(self):
        """Periodically flush buffer to database."""
        while self._running:
            try:
                await asyncio.sleep(self.flush_interval)
                await self._flush_to_db()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in audit flush: {e}")
                
    async def _flush_to_db(self):
        """Flush buffered events to database."""
        if not self.buffer or not self._db_pool:
            return
            
        events = []
        while self.buffer:
            try:
                events.append(self.buffer.popleft())
            except IndexError:
                break
                
        if not events:
            return
            
        try:
            async with self._db_pool.acquire() as conn:
                await conn.executemany(
                    """
                    INSERT INTO audit_log 
                    (timestamp, user_id, event_type, event_category, ip_address, 
                     user_agent, resource_type, resource_id, action, status, details, request_id)
                    VALUES ($1, $2::uuid, $3, $4, $5::inet, $6, $7, $8, $9, $10, $11::jsonb, $12::uuid)
                    """,
                    [
                        (
                            e.timestamp,
                            e.user_id if e.user_id else None,
                            e.event_type.value,
                            e.event_category.value,
                            e.ip_address,
                            e.user_agent,
                            e.resource_type,
                            e.resource_id,
                            e.action,
                            e.status.value,
                            json.dumps(e.details),
                            e.request_id,
                        )
                        for e in events
                    ]
                )
            logger.debug(f"Flushed {len(events)} audit events to database")
        except Exception as e:
            logger.error(f"Failed to flush audit events: {e}")
            # Re-add events to buffer on failure
            for event in events:
                self.buffer.appendleft(event)
                
    def log(self, event: AuditEvent):
        """
        Log an audit event.
        
        Args:
            event: The audit event to log
        """
        # Add to buffer
        self.buffer.append(event)
        
        # Log to standard logging
        log_msg = f"AUDIT [{event.event_category.value}] {event.event_type.value}: {event.action}"
        if event.user_id:
            log_msg += f" user={event.user_id}"
        if event.ip_address:
            log_msg += f" ip={event.ip_address}"
        if event.status != EventStatus.SUCCESS:
            log_msg += f" status={event.status.value}"
            
        if event.status == EventStatus.FAILURE:
            logger.warning(log_msg)
        elif event.event_category == EventCategory.SECURITY:
            logger.info(log_msg)
        else:
            logger.debug(log_msg)
            
        # Check for security alerts
        self._check_alerts(event)
        
    def _check_alerts(self, event: AuditEvent):
        """Check if event triggers security alert."""
        if event.event_type not in self.alert_thresholds:
            return
            
        ip = event.ip_address or "unknown"
        event_key = event.event_type.value
        
        if ip not in self.event_counts:
            self.event_counts[ip] = {}
        if event_key not in self.event_counts[ip]:
            self.event_counts[ip][event_key] = 0
            
        self.event_counts[ip][event_key] += 1
        
        threshold = self.alert_thresholds[event.event_type]
        if self.event_counts[ip][event_key] >= threshold:
            self._trigger_alert(event, self.event_counts[ip][event_key])
            # Reset counter after alert
            self.event_counts[ip][event_key] = 0
            
    def _trigger_alert(self, event: AuditEvent, count: int):
        """Trigger security alert."""
        alert_event = AuditEvent(
            event_type=EventType.SUSPICIOUS_ACTIVITY,
            event_category=EventCategory.SECURITY,
            action=f"Threshold exceeded: {event.event_type.value} ({count} occurrences)",
            ip_address=event.ip_address,
            user_id=event.user_id,
            status=EventStatus.BLOCKED,
            details={
                "trigger_event": event.event_type.value,
                "occurrence_count": count,
                "threshold": self.alert_thresholds.get(event.event_type),
            }
        )
        self.buffer.append(alert_event)
        logger.warning(f"SECURITY ALERT: {alert_event.action} from IP {event.ip_address}")
        
    # Convenience methods for common events
    
    def log_login_success(self, user_id: str, ip: str, user_agent: str = None):
        """Log successful login."""
        self.log(AuditEvent(
            event_type=EventType.LOGIN_SUCCESS,
            event_category=EventCategory.AUTHENTICATION,
            action="User logged in",
            user_id=user_id,
            ip_address=ip,
            user_agent=user_agent,
        ))
        
    def log_login_failure(self, username: str, ip: str, reason: str = "invalid_credentials"):
        """Log failed login attempt."""
        self.log(AuditEvent(
            event_type=EventType.LOGIN_FAILURE,
            event_category=EventCategory.AUTHENTICATION,
            action=f"Login failed: {reason}",
            ip_address=ip,
            status=EventStatus.FAILURE,
            details={"username": username, "reason": reason},
        ))
        
    def log_access_denied(self, user_id: str, resource: str, ip: str):
        """Log access denied event."""
        self.log(AuditEvent(
            event_type=EventType.ACCESS_DENIED,
            event_category=EventCategory.AUTHORIZATION,
            action=f"Access denied to {resource}",
            user_id=user_id,
            ip_address=ip,
            status=EventStatus.BLOCKED,
            details={"resource": resource},
        ))
        
    def log_rate_limited(self, ip: str, endpoint: str, user_id: str = None):
        """Log rate limiting event."""
        self.log(AuditEvent(
            event_type=EventType.RATE_LIMITED,
            event_category=EventCategory.SECURITY,
            action=f"Rate limited on {endpoint}",
            user_id=user_id,
            ip_address=ip,
            status=EventStatus.BLOCKED,
            details={"endpoint": endpoint},
        ))
        
    def log_data_access(self, user_id: str, resource_type: str, resource_id: str, ip: str):
        """Log data access event."""
        self.log(AuditEvent(
            event_type=EventType.LOCATION_VIEWED,
            event_category=EventCategory.DATA_ACCESS,
            action=f"Viewed {resource_type}",
            user_id=user_id,
            ip_address=ip,
            resource_type=resource_type,
            resource_id=resource_id,
        ))
        
    def log_data_modification(
        self, 
        event_type: EventType,
        user_id: str, 
        resource_type: str, 
        resource_id: str, 
        ip: str,
        changes: Dict[str, Any] = None
    ):
        """Log data modification event."""
        self.log(AuditEvent(
            event_type=event_type,
            event_category=EventCategory.DATA_MODIFICATION,
            action=f"Modified {resource_type}",
            user_id=user_id,
            ip_address=ip,
            resource_type=resource_type,
            resource_id=resource_id,
            details={"changes": changes} if changes else {},
        ))
        
    def log_tunnel_event(self, event_type: EventType, user_id: str, ip: str, session_id: str):
        """Log encrypted tunnel event."""
        self.log(AuditEvent(
            event_type=event_type,
            event_category=EventCategory.SECURITY,
            action=f"Tunnel {event_type.value.replace('tunnel_', '')}",
            user_id=user_id,
            ip_address=ip,
            resource_type="tunnel_session",
            resource_id=session_id,
        ))


# Global audit logger instance
_audit_logger: Optional[AuditLogger] = None


def get_audit_logger() -> AuditLogger:
    """Get the global audit logger instance."""
    global _audit_logger
    if _audit_logger is None:
        import os
        db_url = os.environ.get("DATABASE_URL")
        _audit_logger = AuditLogger(db_url=db_url)
    return _audit_logger


async def init_audit_logger(db_url: Optional[str] = None):
    """Initialize and start the audit logger."""
    global _audit_logger
    _audit_logger = AuditLogger(db_url=db_url)
    await _audit_logger.start()
    return _audit_logger
