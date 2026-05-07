"""
PATHMAP - Rate Limiter Tests
============================
Tests for the Redis-backed distributed rate limiter.
"""

import pytest
import asyncio
import time
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from security.rate_limiter import (
    RedisRateLimiter,
    RateLimitConfig,
    get_rate_limiter,
    init_redis,
    close_redis,
    _redis_available
)


class TestRateLimiterMemoryFallback:
    """Test rate limiter with in-memory fallback (no Redis)."""
    
    @pytest.fixture
    def limiter(self):
        """Create fresh rate limiter instance."""
        return RedisRateLimiter()
    
    def test_allows_requests_under_limit(self, limiter):
        """Test that requests under the limit are allowed."""
        identifier = "test-user-1"
        
        # Check limit should succeed
        allowed, reason, retry = limiter.check_limit_sync(identifier, "api")
        assert allowed is True
        assert reason is None
        assert retry is None
    
    def test_burst_limit_enforced(self, limiter):
        """Test that burst limit is enforced."""
        identifier = "test-user-burst"
        
        # Record requests up to burst limit
        for i in range(20):  # API burst limit is 20
            allowed, _, _ = limiter.check_limit_sync(identifier, "api")
            if allowed:
                limiter.record_request_sync(identifier)
        
        # Next request should be blocked
        allowed, reason, retry = limiter.check_limit_sync(identifier, "api")
        assert allowed is False
        assert "Burst" in reason or "limit" in reason.lower()
    
    def test_minute_limit_enforced(self, limiter):
        """Test that per-minute limit is enforced."""
        identifier = "test-user-minute"
        
        # Use search endpoint which has 30/min limit and 10 burst
        # Record requests up to per-minute limit
        # Need to spread across time windows to avoid burst limit
        for i in range(30):
            limiter.record_request_sync(identifier)
        
        # Next request should be blocked by minute limit
        allowed, reason, retry = limiter.check_limit_sync(identifier, "search")
        assert allowed is False
        # Could be burst or minute limit depending on timing
        assert "limit" in reason.lower()
    
    def test_different_endpoint_types(self, limiter):
        """Test different endpoint types have different limits."""
        auth_user = "test-user-auth"
        api_user = "test-user-api"
        
        # Auth has lower limits (10/min) than API (60/min)
        for i in range(12):
            limiter.record_request_sync(auth_user)
        
        allowed_auth, _, _ = limiter.check_limit_sync(auth_user, "auth")
        allowed_api, _, _ = limiter.check_limit_sync(api_user, "api")
        
        assert allowed_auth is False  # Over auth limit
        assert allowed_api is True  # Under API limit
    
    def test_custom_limits(self, limiter):
        """Test setting custom limits for an identifier."""
        identifier = "premium-user"
        
        # Set higher limits
        custom_limits = RateLimitConfig(
            requests_per_minute=1000,
            requests_per_hour=10000,
            requests_per_day=100000,
            burst_limit=100
        )
        limiter.set_custom_limits(identifier, custom_limits)
        
        # Should allow more requests
        for i in range(50):
            allowed, _, _ = limiter.check_limit_sync(identifier, "api")
            if allowed:
                limiter.record_request_sync(identifier)
        
        # Still under custom limit
        allowed, _, _ = limiter.check_limit_sync(identifier, "api")
        assert allowed is True
        
        # Remove custom limits
        limiter.remove_custom_limits(identifier)
    
    def test_get_remaining(self, limiter):
        """Test getting remaining request counts."""
        identifier = "test-remaining"
        
        remaining = limiter._get_remaining_memory(
            identifier,
            limiter.DEFAULT_LIMITS['api']
        )
        
        assert remaining['per_minute'] == 60
        assert remaining['per_hour'] == 1000
        assert remaining['per_day'] == 10000
        
        # Record some requests
        for i in range(10):
            limiter.record_request_sync(identifier)
        
        remaining = limiter._get_remaining_memory(
            identifier,
            limiter.DEFAULT_LIMITS['api']
        )
        
        assert remaining['per_minute'] == 50


class TestRateLimiterAsync:
    """Test async rate limiter methods."""
    
    @pytest.fixture
    def limiter(self):
        return RedisRateLimiter()
    
    @pytest.mark.asyncio
    async def test_async_check_limit(self, limiter):
        """Test async check_limit method."""
        identifier = "async-user-1"
        
        allowed, reason, retry = await limiter.check_limit(identifier, "api")
        assert allowed is True
    
    @pytest.mark.asyncio
    async def test_async_block_identifier(self, limiter):
        """Test async blocking of identifiers."""
        identifier = "block-test-user"
        
        # Block for 60 seconds
        await limiter.block_identifier(identifier, 60)
        
        # Should be blocked
        allowed, reason, retry = await limiter.check_limit(identifier, "api")
        assert allowed is False
        assert "blocked" in reason.lower()
        assert retry is not None and retry <= 60
        
        # Unblock
        await limiter.unblock_identifier(identifier)
        
        # Should be allowed again
        allowed, _, _ = await limiter.check_limit(identifier, "api")
        assert allowed is True
    
    @pytest.mark.asyncio
    async def test_async_get_remaining(self, limiter):
        """Test async get_remaining method."""
        identifier = "async-remaining-user"
        
        remaining = await limiter.get_remaining(identifier, "api")
        
        assert 'per_minute' in remaining
        assert 'per_hour' in remaining
        assert 'per_day' in remaining


class TestRateLimiterSingleton:
    """Test singleton behavior."""
    
    def test_singleton_instance(self):
        """Test that get_rate_limiter returns same instance."""
        limiter1 = get_rate_limiter()
        limiter2 = get_rate_limiter()
        
        assert limiter1 is limiter2
    
    def test_singleton_is_redis_rate_limiter(self):
        """Test that singleton is RedisRateLimiter instance."""
        limiter = get_rate_limiter()
        assert isinstance(limiter, RedisRateLimiter)


class TestRateLimitConfig:
    """Test rate limit configuration."""
    
    def test_default_limits_exist(self):
        """Test that all default endpoint types have limits."""
        limiter = RedisRateLimiter()
        
        assert 'auth' in limiter.DEFAULT_LIMITS
        assert 'api' in limiter.DEFAULT_LIMITS
        assert 'location' in limiter.DEFAULT_LIMITS
        assert 'search' in limiter.DEFAULT_LIMITS
        assert 'tunnel' in limiter.DEFAULT_LIMITS
    
    def test_auth_more_restrictive(self):
        """Test that auth endpoints are more restrictive."""
        limiter = RedisRateLimiter()
        
        auth_limits = limiter.DEFAULT_LIMITS['auth']
        api_limits = limiter.DEFAULT_LIMITS['api']
        
        assert auth_limits.requests_per_minute < api_limits.requests_per_minute
        assert auth_limits.burst_limit < api_limits.burst_limit
    
    def test_location_less_restrictive(self):
        """Test that location endpoints allow more requests."""
        limiter = RedisRateLimiter()
        
        location_limits = limiter.DEFAULT_LIMITS['location']
        api_limits = limiter.DEFAULT_LIMITS['api']
        
        assert location_limits.requests_per_minute >= api_limits.requests_per_minute


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
