"""
PATHMAP - Push Notification Service
====================================
FCM (Firebase Cloud Messaging) and APNs integration for mobile push notifications.

Supports:
- Firebase Cloud Messaging (Android, Web, iOS via FCM)
- Apple Push Notification service (APNs) - direct iOS
- Device token management
- Topic-based messaging
- Batch notifications
"""
# pyright: reportMissingImports=false

import os
import logging
import time
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from enum import Enum
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ============== CONFIGURATION ==============

FCM_CREDENTIALS_PATH = os.getenv("FCM_CREDENTIALS_PATH", "")
FCM_PROJECT_ID = os.getenv("FCM_PROJECT_ID", "")
APNS_KEY_PATH = os.getenv("APNS_KEY_PATH", "")
APNS_KEY_ID = os.getenv("APNS_KEY_ID", "")
APNS_TEAM_ID = os.getenv("APNS_TEAM_ID", "")
APNS_BUNDLE_ID = os.getenv("APNS_BUNDLE_ID", "com.pathmap.app")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Try to import Firebase Admin SDK
try:
    import firebase_admin  # type: ignore[import-not-found]
    from firebase_admin import credentials, messaging  # type: ignore[import-not-found]
    HAS_FIREBASE = True
except ImportError:
    HAS_FIREBASE = False
    firebase_admin = None
    credentials = None
    messaging = None

# Try to import APNs library
try:
    import aioapns  # type: ignore[import-not-found]
    HAS_APNS = True
except ImportError:
    HAS_APNS = False
    aioapns = None


# ============== ENUMS AND TYPES ==============

class Platform(str, Enum):
    """Device platform types."""
    ANDROID = "android"
    IOS = "ios"
    WEB = "web"


class NotificationPriority(str, Enum):
    """Notification priority levels."""
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"


class NotificationType(str, Enum):
    """Notification types for categorization."""
    GEOFENCE_ALERT = "geofence_alert"
    DEVICE_ALERT = "device_alert"
    LOCATION_SHARE = "location_share"
    SECURITY_ALERT = "security_alert"
    SYSTEM = "system"
    CHAT = "chat"


@dataclass
class DeviceToken:
    """Represents a registered device token."""
    token: str
    platform: Platform
    user_id: str
    device_id: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    last_used: float = field(default_factory=time.time)
    is_active: bool = True
    app_version: Optional[str] = None


@dataclass
class PushNotification:
    """Represents a push notification to be sent."""
    title: str
    body: str
    notification_type: NotificationType = NotificationType.SYSTEM
    priority: NotificationPriority = NotificationPriority.HIGH
    data: Dict[str, str] = field(default_factory=dict)
    image_url: Optional[str] = None
    click_action: Optional[str] = None
    badge: Optional[int] = None
    sound: str = "default"
    ttl_seconds: int = 86400  # 24 hours


@dataclass
class NotificationResult:
    """Result of sending a notification."""
    success: bool
    token: str
    message_id: Optional[str] = None
    error: Optional[str] = None
    should_remove_token: bool = False


# ============== TOKEN STORAGE ==============

class DeviceTokenStore:
    """
    In-memory device token storage.
    Replace with database storage in production.
    """
    
    def __init__(self):
        self._tokens: Dict[str, DeviceToken] = {}  # token -> DeviceToken
        self._user_tokens: Dict[str, List[str]] = {}  # user_id -> [tokens]
        self._device_tokens: Dict[str, str] = {}  # device_id -> token
    
    async def register_token(
        self,
        token: str,
        platform: Platform,
        user_id: str,
        device_id: Optional[str] = None,
        app_version: Optional[str] = None
    ) -> DeviceToken:
        """Register or update a device token."""
        # Remove old token for same device
        if device_id and device_id in self._device_tokens:
            old_token = self._device_tokens[device_id]
            await self.remove_token(old_token)
        
        device_token = DeviceToken(
            token=token,
            platform=platform,
            user_id=user_id,
            device_id=device_id,
            app_version=app_version
        )
        
        self._tokens[token] = device_token
        
        if user_id not in self._user_tokens:
            self._user_tokens[user_id] = []
        if token not in self._user_tokens[user_id]:
            self._user_tokens[user_id].append(token)
        
        if device_id:
            self._device_tokens[device_id] = token
        
        logger.info(f"Registered push token for user {user_id[:8]}... ({platform.value})")
        return device_token
    
    async def remove_token(self, token: str):
        """Remove a device token."""
        if token in self._tokens:
            device_token = self._tokens[token]
            
            # Remove from user tokens
            if device_token.user_id in self._user_tokens:
                self._user_tokens[device_token.user_id] = [
                    t for t in self._user_tokens[device_token.user_id] if t != token
                ]
            
            # Remove from device tokens
            if device_token.device_id and device_token.device_id in self._device_tokens:
                del self._device_tokens[device_token.device_id]
            
            del self._tokens[token]
            logger.info(f"Removed push token for user {device_token.user_id[:8]}...")
    
    async def get_user_tokens(self, user_id: str) -> List[DeviceToken]:
        """Get all active tokens for a user."""
        tokens = []
        for token in self._user_tokens.get(user_id, []):
            if token in self._tokens and self._tokens[token].is_active:
                tokens.append(self._tokens[token])
        return tokens
    
    async def get_token(self, token: str) -> Optional[DeviceToken]:
        """Get a device token by its value."""
        return self._tokens.get(token)
    
    async def mark_token_used(self, token: str):
        """Update last_used timestamp."""
        if token in self._tokens:
            self._tokens[token].last_used = time.time()
    
    async def deactivate_token(self, token: str):
        """Mark a token as inactive (don't delete, for tracking)."""
        if token in self._tokens:
            self._tokens[token].is_active = False


# ============== PUSH SERVICE ==============

class PushNotificationService:
    """
    Unified push notification service supporting FCM and APNs.
    """
    
    def __init__(self):
        self._initialized = False
        self._fcm_app: Optional[Any] = None
        self._apns_client: Optional[Any] = None
        self.token_store = DeviceTokenStore()
        
        # Stats
        self._stats = {
            "sent": 0,
            "failed": 0,
            "removed_tokens": 0
        }
    
    async def initialize(self):
        """Initialize push notification providers."""
        if self._initialized:
            return
        
        # Initialize Firebase
        if HAS_FIREBASE and FCM_CREDENTIALS_PATH and os.path.exists(FCM_CREDENTIALS_PATH):
            try:
                cred = credentials.Certificate(FCM_CREDENTIALS_PATH)
                self._fcm_app = firebase_admin.initialize_app(cred)
                logger.info("Firebase Cloud Messaging initialized")
            except Exception as e:
                logger.warning(f"FCM initialization failed: {e}")
        else:
            logger.info("FCM not configured (missing credentials or firebase-admin package)")
        
        # Initialize APNs
        if HAS_APNS and APNS_KEY_PATH and os.path.exists(APNS_KEY_PATH):
            try:
                self._apns_client = aioapns.APNs(
                    key=APNS_KEY_PATH,
                    key_id=APNS_KEY_ID,
                    team_id=APNS_TEAM_ID,
                    topic=APNS_BUNDLE_ID,
                    use_sandbox=(ENVIRONMENT != "production")
                )
                logger.info("Apple Push Notification service initialized")
            except Exception as e:
                logger.warning(f"APNs initialization failed: {e}")
        else:
            logger.info("APNs not configured (missing credentials or aioapns package)")
        
        self._initialized = True
    
    async def register_device(
        self,
        token: str,
        platform: Union[Platform, str],
        user_id: str,
        device_id: Optional[str] = None,
        app_version: Optional[str] = None
    ) -> DeviceToken:
        """Register a device for push notifications."""
        if isinstance(platform, str):
            platform = Platform(platform.lower())
        
        return await self.token_store.register_token(
            token=token,
            platform=platform,
            user_id=user_id,
            device_id=device_id,
            app_version=app_version
        )
    
    async def unregister_device(self, token: str):
        """Unregister a device from push notifications."""
        await self.token_store.remove_token(token)
    
    async def send_to_user(
        self,
        user_id: str,
        notification: PushNotification
    ) -> List[NotificationResult]:
        """Send notification to all devices of a user."""
        tokens = await self.token_store.get_user_tokens(user_id)
        
        if not tokens:
            logger.debug(f"No push tokens for user {user_id[:8]}...")
            return []
        
        results = []
        for device_token in tokens:
            result = await self._send_to_device(device_token, notification)
            results.append(result)
            
            if result.should_remove_token:
                await self.token_store.remove_token(device_token.token)
                self._stats["removed_tokens"] += 1
        
        return results
    
    async def send_to_token(
        self,
        token: str,
        notification: PushNotification
    ) -> NotificationResult:
        """Send notification to a specific token."""
        device_token = await self.token_store.get_token(token)
        
        if not device_token:
            return NotificationResult(
                success=False,
                token=token,
                error="Token not registered"
            )
        
        result = await self._send_to_device(device_token, notification)
        
        if result.should_remove_token:
            await self.token_store.remove_token(token)
            self._stats["removed_tokens"] += 1
        
        return result
    
    async def send_to_multiple(
        self,
        user_ids: List[str],
        notification: PushNotification,
        batch_size: int = 500
    ) -> Dict[str, List[NotificationResult]]:
        """Send notification to multiple users."""
        results: Dict[str, List[NotificationResult]] = {}
        
        for user_id in user_ids:
            results[user_id] = await self.send_to_user(user_id, notification)
        
        return results
    
    async def _send_to_device(
        self,
        device_token: DeviceToken,
        notification: PushNotification
    ) -> NotificationResult:
        """Send notification to a specific device."""
        await self.token_store.mark_token_used(device_token.token)
        
        if device_token.platform == Platform.IOS and self._apns_client:
            return await self._send_apns(device_token, notification)
        elif self._fcm_app:
            return await self._send_fcm(device_token, notification)
        else:
            # Simulate send for development
            return await self._send_mock(device_token, notification)
    
    async def _send_fcm(
        self,
        device_token: DeviceToken,
        notification: PushNotification
    ) -> NotificationResult:
        """Send via Firebase Cloud Messaging."""
        try:
            # Build FCM message
            android_config = messaging.AndroidConfig(
                priority="high" if notification.priority == NotificationPriority.HIGH else "normal",
                ttl=datetime.timedelta(seconds=notification.ttl_seconds),
                notification=messaging.AndroidNotification(
                    title=notification.title,
                    body=notification.body,
                    icon="ic_notification",
                    sound=notification.sound,
                    click_action=notification.click_action
                )
            )
            
            web_config = messaging.WebpushConfig(
                notification=messaging.WebpushNotification(
                    title=notification.title,
                    body=notification.body,
                    icon="/icon-192.png"
                )
            )
            
            apns_config = messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        alert=messaging.ApsAlert(
                            title=notification.title,
                            body=notification.body
                        ),
                        badge=notification.badge,
                        sound=notification.sound
                    )
                )
            )
            
            message = messaging.Message(
                notification=messaging.Notification(
                    title=notification.title,
                    body=notification.body,
                    image=notification.image_url
                ),
                data={
                    **notification.data,
                    "type": notification.notification_type.value
                },
                android=android_config,
                webpush=web_config,
                apns=apns_config,
                token=device_token.token
            )
            
            # Send message
            response = messaging.send(message)
            
            self._stats["sent"] += 1
            logger.debug(f"FCM sent to {device_token.token[:20]}...: {response}")
            
            return NotificationResult(
                success=True,
                token=device_token.token,
                message_id=response
            )
            
        except messaging.UnregisteredError:
            self._stats["failed"] += 1
            return NotificationResult(
                success=False,
                token=device_token.token,
                error="Token unregistered",
                should_remove_token=True
            )
        except messaging.InvalidArgumentError as e:
            self._stats["failed"] += 1
            return NotificationResult(
                success=False,
                token=device_token.token,
                error=f"Invalid token: {e}",
                should_remove_token=True
            )
        except Exception as e:
            self._stats["failed"] += 1
            logger.error(f"FCM send error: {e}")
            return NotificationResult(
                success=False,
                token=device_token.token,
                error=str(e)
            )
    
    async def _send_apns(
        self,
        device_token: DeviceToken,
        notification: PushNotification
    ) -> NotificationResult:
        """Send via Apple Push Notification service."""
        try:
            request = aioapns.NotificationRequest(
                device_token=device_token.token,
                message={
                    "aps": {
                        "alert": {
                            "title": notification.title,
                            "body": notification.body
                        },
                        "badge": notification.badge,
                        "sound": notification.sound
                    },
                    **notification.data,
                    "type": notification.notification_type.value
                },
                priority=aioapns.PRIORITY_HIGH if notification.priority == NotificationPriority.HIGH else aioapns.PRIORITY_NORMAL,
                time_to_live=notification.ttl_seconds
            )
            
            response = await self._apns_client.send_notification(request)
            
            if response.is_successful:
                self._stats["sent"] += 1
                return NotificationResult(
                    success=True,
                    token=device_token.token,
                    message_id=response.notification_id
                )
            else:
                self._stats["failed"] += 1
                should_remove = response.status in ("Unregistered", "BadDeviceToken", "ExpiredToken")
                return NotificationResult(
                    success=False,
                    token=device_token.token,
                    error=response.description,
                    should_remove_token=should_remove
                )
                
        except Exception as e:
            self._stats["failed"] += 1
            logger.error(f"APNs send error: {e}")
            return NotificationResult(
                success=False,
                token=device_token.token,
                error=str(e)
            )
    
    async def _send_mock(
        self,
        device_token: DeviceToken,
        notification: PushNotification
    ) -> NotificationResult:
        """Mock send for development/testing."""
        logger.info(
            f"[MOCK PUSH] To: {device_token.platform.value} {device_token.token[:20]}... | "
            f"Title: {notification.title} | Body: {notification.body}"
        )
        
        self._stats["sent"] += 1
        
        return NotificationResult(
            success=True,
            token=device_token.token,
            message_id=f"mock-{int(time.time())}"
        )
    
    def get_stats(self) -> Dict[str, Any]:
        """Get push notification statistics."""
        return {
            **self._stats,
            "fcm_enabled": self._fcm_app is not None,
            "apns_enabled": self._apns_client is not None,
            "registered_tokens": len(self.token_store._tokens)
        }


# ============== SINGLETON AND HELPERS ==============

_push_service: Optional[PushNotificationService] = None


async def get_push_service() -> PushNotificationService:
    """Get or create the PushNotificationService singleton."""
    global _push_service
    if _push_service is None:
        _push_service = PushNotificationService()
        await _push_service.initialize()
    return _push_service


# ============== CONVENIENCE FUNCTIONS ==============

async def send_geofence_alert(
    user_id: str,
    geofence_name: str,
    device_name: str,
    event_type: str,  # "entered" or "exited"
    location: Optional[Dict[str, float]] = None
) -> List[NotificationResult]:
    """Send a geofence alert notification."""
    service = await get_push_service()
    
    notification = PushNotification(
        title=f"Geofence Alert: {geofence_name}",
        body=f"{device_name} {event_type} {geofence_name}",
        notification_type=NotificationType.GEOFENCE_ALERT,
        priority=NotificationPriority.HIGH,
        data={
            "geofence_name": geofence_name,
            "device_name": device_name,
            "event_type": event_type,
            "lat": str(location.get("lat", "")) if location else "",
            "lng": str(location.get("lng", "")) if location else ""
        }
    )
    
    return await service.send_to_user(user_id, notification)


async def send_device_alert(
    user_id: str,
    device_name: str,
    alert_type: str,
    message: str
) -> List[NotificationResult]:
    """Send a device alert notification."""
    service = await get_push_service()
    
    notification = PushNotification(
        title=f"Device Alert: {device_name}",
        body=message,
        notification_type=NotificationType.DEVICE_ALERT,
        priority=NotificationPriority.HIGH,
        data={
            "device_name": device_name,
            "alert_type": alert_type
        }
    )
    
    return await service.send_to_user(user_id, notification)


async def send_security_alert(
    user_id: str,
    title: str,
    message: str,
    severity: str = "high"
) -> List[NotificationResult]:
    """Send a security alert notification."""
    service = await get_push_service()
    
    notification = PushNotification(
        title=title,
        body=message,
        notification_type=NotificationType.SECURITY_ALERT,
        priority=NotificationPriority.HIGH,
        data={
            "severity": severity
        }
    )
    
    return await service.send_to_user(user_id, notification)


async def send_location_share_notification(
    user_id: str,
    from_user: str,
    message: str = "Someone shared their location with you"
) -> List[NotificationResult]:
    """Send a location share notification."""
    service = await get_push_service()
    
    notification = PushNotification(
        title="Location Shared",
        body=message,
        notification_type=NotificationType.LOCATION_SHARE,
        priority=NotificationPriority.NORMAL,
        data={
            "from_user": from_user
        }
    )
    
    return await service.send_to_user(user_id, notification)
