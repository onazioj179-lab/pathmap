"""
PATHMAP - Push Notification Tests
=================================
Tests for the push notification service.
"""

import pytest
import asyncio
import time
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from notifications.push_service import (
    Platform,
    NotificationPriority,
    NotificationType,
    DeviceToken,
    PushNotification,
    NotificationResult,
    DeviceTokenStore,
    PushNotificationService,
    get_push_service,
    send_geofence_alert,
    send_device_alert,
    send_security_alert
)


class TestPlatformEnum:
    """Test Platform enum."""
    
    def test_platform_values(self):
        """Test platform enum values."""
        assert Platform.ANDROID.value == "android"
        assert Platform.IOS.value == "ios"
        assert Platform.WEB.value == "web"
    
    def test_platform_from_string(self):
        """Test creating platform from string."""
        assert Platform("android") == Platform.ANDROID
        assert Platform("ios") == Platform.IOS
        assert Platform("web") == Platform.WEB


class TestNotificationTypes:
    """Test notification type enums."""
    
    def test_notification_types(self):
        """Test all notification types exist."""
        assert NotificationType.GEOFENCE_ALERT.value == "geofence_alert"
        assert NotificationType.DEVICE_ALERT.value == "device_alert"
        assert NotificationType.SECURITY_ALERT.value == "security_alert"
        assert NotificationType.LOCATION_SHARE.value == "location_share"
    
    def test_priority_levels(self):
        """Test priority levels."""
        assert NotificationPriority.HIGH.value == "high"
        assert NotificationPriority.NORMAL.value == "normal"
        assert NotificationPriority.LOW.value == "low"


class TestDeviceToken:
    """Test DeviceToken dataclass."""
    
    def test_device_token_creation(self):
        """Test creating a device token."""
        token = DeviceToken(
            token="test-token-123",
            platform=Platform.ANDROID,
            user_id="user-456"
        )
        
        assert token.token == "test-token-123"
        assert token.platform == Platform.ANDROID
        assert token.user_id == "user-456"
        assert token.is_active is True
    
    def test_device_token_with_optional_fields(self):
        """Test device token with all optional fields."""
        token = DeviceToken(
            token="test-token",
            platform=Platform.IOS,
            user_id="user-123",
            device_id="device-789",
            app_version="1.0.0"
        )
        
        assert token.device_id == "device-789"
        assert token.app_version == "1.0.0"


class TestPushNotification:
    """Test PushNotification dataclass."""
    
    def test_notification_creation(self):
        """Test creating a notification."""
        notification = PushNotification(
            title="Test Title",
            body="Test body message"
        )
        
        assert notification.title == "Test Title"
        assert notification.body == "Test body message"
        assert notification.priority == NotificationPriority.HIGH
        assert notification.sound == "default"
    
    def test_notification_with_data(self):
        """Test notification with custom data."""
        notification = PushNotification(
            title="Alert",
            body="Something happened",
            notification_type=NotificationType.GEOFENCE_ALERT,
            data={"location_id": "123", "event": "enter"}
        )
        
        assert notification.data["location_id"] == "123"
        assert notification.notification_type == NotificationType.GEOFENCE_ALERT


class TestNotificationResult:
    """Test NotificationResult dataclass."""
    
    def test_success_result(self):
        """Test successful notification result."""
        result = NotificationResult(
            success=True,
            token="token-123",
            message_id="msg-456"
        )
        
        assert result.success is True
        assert result.message_id == "msg-456"
        assert result.should_remove_token is False
    
    def test_failure_result(self):
        """Test failed notification result."""
        result = NotificationResult(
            success=False,
            token="token-123",
            error="Token expired",
            should_remove_token=True
        )
        
        assert result.success is False
        assert result.error == "Token expired"
        assert result.should_remove_token is True


class TestDeviceTokenStore:
    """Test DeviceTokenStore functionality."""
    
    @pytest.fixture
    def store(self):
        """Create fresh token store."""
        return DeviceTokenStore()
    
    @pytest.mark.asyncio
    async def test_register_token(self, store):
        """Test registering a token."""
        token = await store.register_token(
            token="test-token-abc",
            platform=Platform.ANDROID,
            user_id="user-123"
        )
        
        assert token.token == "test-token-abc"
        assert token.platform == Platform.ANDROID
        assert token.user_id == "user-123"
    
    @pytest.mark.asyncio
    async def test_get_user_tokens(self, store):
        """Test getting tokens for a user."""
        # Register multiple tokens
        await store.register_token("token-1", Platform.ANDROID, "user-multi")
        await store.register_token("token-2", Platform.IOS, "user-multi")
        await store.register_token("token-3", Platform.WEB, "user-multi")
        
        tokens = await store.get_user_tokens("user-multi")
        
        assert len(tokens) == 3
        platforms = {t.platform for t in tokens}
        assert Platform.ANDROID in platforms
        assert Platform.IOS in platforms
        assert Platform.WEB in platforms
    
    @pytest.mark.asyncio
    async def test_remove_token(self, store):
        """Test removing a token."""
        await store.register_token("remove-token", Platform.ANDROID, "user-remove")
        
        tokens_before = await store.get_user_tokens("user-remove")
        assert len(tokens_before) == 1
        
        await store.remove_token("remove-token")
        
        tokens_after = await store.get_user_tokens("user-remove")
        assert len(tokens_after) == 0
    
    @pytest.mark.asyncio
    async def test_device_id_replaces_old_token(self, store):
        """Test that registering with same device_id replaces old token."""
        # Register first token
        await store.register_token(
            token="old-token",
            platform=Platform.ANDROID,
            user_id="user-device",
            device_id="device-123"
        )
        
        # Register new token with same device_id
        await store.register_token(
            token="new-token",
            platform=Platform.ANDROID,
            user_id="user-device",
            device_id="device-123"
        )
        
        tokens = await store.get_user_tokens("user-device")
        
        # Should only have the new token
        assert len(tokens) == 1
        assert tokens[0].token == "new-token"
    
    @pytest.mark.asyncio
    async def test_deactivate_token(self, store):
        """Test deactivating a token."""
        await store.register_token("deactivate-token", Platform.IOS, "user-deactivate")
        
        await store.deactivate_token("deactivate-token")
        
        # Deactivated tokens should not appear in get_user_tokens
        tokens = await store.get_user_tokens("user-deactivate")
        assert len(tokens) == 0
    
    @pytest.mark.asyncio
    async def test_mark_token_used(self, store):
        """Test marking a token as used updates timestamp."""
        await store.register_token("used-token", Platform.WEB, "user-used")
        
        token_before = await store.get_token("used-token")
        original_time = token_before.last_used
        
        await asyncio.sleep(0.01)
        await store.mark_token_used("used-token")
        
        token_after = await store.get_token("used-token")
        assert token_after.last_used >= original_time


class TestPushNotificationService:
    """Test PushNotificationService functionality."""
    
    @pytest.fixture
    def service(self):
        """Create fresh service instance."""
        return PushNotificationService()
    
    @pytest.mark.asyncio
    async def test_service_initialization(self, service):
        """Test service initializes correctly."""
        await service.initialize()
        assert service._initialized is True
    
    @pytest.mark.asyncio
    async def test_register_device(self, service):
        """Test registering a device."""
        await service.initialize()
        
        token = await service.register_device(
            token="service-test-token",
            platform="android",
            user_id="service-test-user"
        )
        
        assert token.token == "service-test-token"
        assert token.platform == Platform.ANDROID
    
    @pytest.mark.asyncio
    async def test_send_to_user_no_tokens(self, service):
        """Test sending to user with no tokens."""
        await service.initialize()
        
        notification = PushNotification(
            title="Test",
            body="Test message"
        )
        
        results = await service.send_to_user("nonexistent-user", notification)
        assert len(results) == 0
    
    @pytest.mark.asyncio
    async def test_send_to_user_mock(self, service):
        """Test sending to user uses mock when no providers."""
        await service.initialize()
        
        # Register a token
        await service.register_device(
            token="mock-test-token",
            platform="android",
            user_id="mock-test-user"
        )
        
        notification = PushNotification(
            title="Test Notification",
            body="This is a test"
        )
        
        results = await service.send_to_user("mock-test-user", notification)
        
        assert len(results) == 1
        assert results[0].success is True
        assert "mock" in results[0].message_id.lower()
    
    @pytest.mark.asyncio
    async def test_get_stats(self, service):
        """Test getting service stats."""
        await service.initialize()
        
        stats = service.get_stats()
        
        assert "sent" in stats
        assert "failed" in stats
        assert "fcm_enabled" in stats
        assert "apns_enabled" in stats


class TestConvenienceFunctions:
    """Test convenience notification functions."""
    
    @pytest.mark.asyncio
    async def test_send_geofence_alert(self):
        """Test send_geofence_alert function."""
        # Register a device first
        service = await get_push_service()
        await service.register_device(
            token="geofence-test-token",
            platform="ios",
            user_id="geofence-user"
        )
        
        results = await send_geofence_alert(
            user_id="geofence-user",
            geofence_name="Home",
            device_name="iPhone",
            event_type="entered",
            location={"lat": 9.0, "lng": 7.5}
        )
        
        assert len(results) == 1
        assert results[0].success is True
    
    @pytest.mark.asyncio
    async def test_send_device_alert(self):
        """Test send_device_alert function."""
        service = await get_push_service()
        await service.register_device(
            token="device-alert-token",
            platform="android",
            user_id="device-alert-user"
        )
        
        results = await send_device_alert(
            user_id="device-alert-user",
            device_name="Tracker-01",
            alert_type="low_battery",
            message="Battery is below 20%"
        )
        
        assert len(results) == 1
    
    @pytest.mark.asyncio
    async def test_send_security_alert(self):
        """Test send_security_alert function."""
        service = await get_push_service()
        await service.register_device(
            token="security-alert-token",
            platform="web",
            user_id="security-alert-user"
        )
        
        results = await send_security_alert(
            user_id="security-alert-user",
            title="Suspicious Activity",
            message="Multiple failed login attempts detected",
            severity="high"
        )
        
        assert len(results) == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
