"""
PATHMAP - Distributed Rate Limiter
==================================
Redis-backed distributed rate limiting for multi-pod deployments.
Falls back to in-memory when Redis unavailable.

Features:
- Atomic sliding window via Lua scripts
- Per-user and per-endpoint limiting
- Distributed across pods
- Graceful fallback to memory
"""

import os
import time
import logging
from typing import Dict, Tuple, Optional, Any
from dataclasses import dataclass
from collections import defaultdict

logger = logging.getLogger("RateLimiter")

# Redis connection (lazy init)
_redis_client: Optional[Any] = None
_redis_available: bool = False

# Lua script for atomic sliding window rate limiting
SLIDING_WINDOW_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

-- Remove old entries outside window
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)

-- Count current requests in window
local count = redis.call('ZCARD', key)

if count < limit then
    -- Add this request
    redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
    redis.call('EXPIRE', key, window + 1)
    return {1, limit - count - 1}  -- allowed, remaining
else
    -- Get oldest entry to calculate retry-after
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after = window
    if oldest and oldest[2] then
        retry_after = math.ceil(window - (now - oldest[2]))
    end
    return {0, retry_after}  -- blocked, retry_after
end
"""


@dataclass
class RateLimitConfig:
    """Rate limit configuration"""
    requests_per_minute: int
    requests_per_hour: int
    requests_per_day: int
    burst_limit: int  # Max requests in 1 second


async def init_redis(redis_url: str = "redis://localhost:6379/1") -> bool:
    """
    Initialize Redis connection for distributed rate limiting.
    
    Args:
        redis_url: Redis connection URL
        
    Returns:
        True if Redis connected, False otherwise
    """
    global _redis_client, _redis_available
    
    try:
        import redis.asyncio as aioredis  # type: ignore
        
        _redis_client = aioredis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=1.0,
            socket_connect_timeout=1.0,
            retry_on_timeout=True,
            health_check_interval=30
        )
        
        # Test connection
        await _redis_client.ping()
        _redis_available = True
        logger.info("Redis rate limiter connected")
        return True
        
    except ImportError:
        logger.warning("redis package not installed, using in-memory rate limiter")
        _redis_available = False
        return False
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}, using in-memory fallback")
        _redis_available = False
        return False


async def close_redis():
    """Close Redis connection."""
    global _redis_client, _redis_available
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
        _redis_available = False


class RedisRateLimiter:
    """
    Distributed Rate Limiter using Redis.
    
    Features:
    - Atomic operations via Lua scripts
    - Sliding window algorithm
    - Multi-pod safe
    - Graceful memory fallback
    """
    
    # Auth limits are deliberately strict in production but configurable so test
    # environments (which register/log in many bot users quickly) don't trip
    # them. Set AUTH_RATE_LIMIT_PER_MINUTE in CI/dev to a high value.
    _AUTH_PER_MIN = int(os.getenv("AUTH_RATE_LIMIT_PER_MINUTE", "10"))

    # Default limits for different endpoint types
    DEFAULT_LIMITS = {
        'auth': RateLimitConfig(
            requests_per_minute=_AUTH_PER_MIN,
            requests_per_hour=max(60, _AUTH_PER_MIN * 6),
            requests_per_day=max(200, _AUTH_PER_MIN * 20),
            burst_limit=max(5, _AUTH_PER_MIN)
        ),
        'api': RateLimitConfig(
            requests_per_minute=60,
            requests_per_hour=1000,
            requests_per_day=10000,
            burst_limit=20
        ),
        'location': RateLimitConfig(
            requests_per_minute=120,
            requests_per_hour=3600,
            requests_per_day=50000,
            burst_limit=30
        ),
        'search': RateLimitConfig(
            requests_per_minute=30,
            requests_per_hour=300,
            requests_per_day=3000,
            burst_limit=10
        ),
        'tunnel': RateLimitConfig(
            requests_per_minute=200,
            requests_per_hour=5000,
            requests_per_day=100000,
            burst_limit=50
        )
    }
    
    def __init__(self):
        """Initialize rate limiter with both Redis and memory backends."""
        # Memory fallback counters
        self._minute_counters: Dict[str, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
        self._hour_counters: Dict[str, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
        self._day_counters: Dict[str, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
        self._second_counters: Dict[str, Dict[int, int]] = defaultdict(lambda: defaultdict(int))
        
        # Custom limits per identifier
        self._custom_limits: Dict[str, RateLimitConfig] = {}
        
        # Blocked identifiers (distributed via Redis or local)
        self._blocked: Dict[str, float] = {}
        
        # Lua script SHA (cached after first load)
        self._script_sha: Optional[str] = None
    
    async def _get_script_sha(self) -> Optional[str]:
        """Load and cache Lua script SHA."""
        if self._script_sha:
            return self._script_sha
            
        if not _redis_available or not _redis_client:
            return None
            
        try:
            self._script_sha = await _redis_client.script_load(SLIDING_WINDOW_SCRIPT)
            return self._script_sha
        except Exception as e:
            logger.warning(f"Failed to load Lua script: {e}")
            return None
    
    async def check_limit(
        self,
        identifier: str,
        endpoint_type: str = 'api'
    ) -> Tuple[bool, Optional[str], Optional[int]]:
        """
        Check if request is allowed (async, Redis-first).
        
        Args:
            identifier: User ID, IP address, or API key
            endpoint_type: Type of endpoint ('auth', 'api', 'location', 'search', 'tunnel')
            
        Returns:
            Tuple of (allowed, reason_if_blocked, retry_after_seconds)
        """
        now = time.time()
        
        # Check if blocked
        blocked_until = await self._is_blocked(identifier)
        if blocked_until:
            return False, "Rate limit exceeded - temporarily blocked", int(blocked_until - now)
        
        # Get limits
        limits = self._custom_limits.get(identifier) or self.DEFAULT_LIMITS.get(endpoint_type, self.DEFAULT_LIMITS['api'])
        
        # Try Redis first
        if _redis_available and _redis_client:
            try:
                return await self._check_limit_redis(identifier, endpoint_type, limits)
            except Exception as e:
                logger.warning(f"Redis rate limit check failed: {e}, using memory fallback")
        
        # Fall back to memory
        return self._check_limit_memory(identifier, limits)
    
    async def _check_limit_redis(
        self,
        identifier: str,
        endpoint_type: str,
        limits: RateLimitConfig
    ) -> Tuple[bool, Optional[str], Optional[int]]:
        """Check rate limit using Redis sliding window."""
        now = time.time()
        script_sha = await self._get_script_sha()
        
        if not script_sha:
            return self._check_limit_memory(identifier, limits)
        
        # Check each window (burst -> minute -> hour -> day)
        checks = [
            (f"ratelimit:{identifier}:burst", 1, limits.burst_limit, "Burst limit exceeded"),
            (f"ratelimit:{identifier}:minute:{endpoint_type}", 60, limits.requests_per_minute, "Per-minute limit exceeded"),
            (f"ratelimit:{identifier}:hour:{endpoint_type}", 3600, limits.requests_per_hour, "Per-hour limit exceeded"),
            (f"ratelimit:{identifier}:day:{endpoint_type}", 86400, limits.requests_per_day, "Daily limit exceeded"),
        ]
        
        for key, window, limit, reason in checks:
            try:
                result = await _redis_client.evalsha(
                    script_sha,
                    1,
                    key,
                    str(now),
                    str(window),
                    str(limit)
                )
                
                allowed, remaining_or_retry = result
                if not allowed:
                    return False, reason, int(remaining_or_retry)
                    
            except Exception as e:
                logger.warning(f"Redis check failed for {key}: {e}")
                continue
        
        return True, None, None
    
    def _check_limit_memory(
        self,
        identifier: str,
        limits: RateLimitConfig
    ) -> Tuple[bool, Optional[str], Optional[int]]:
        """Check rate limit using in-memory counters (fallback)."""
        now = time.time()
        
        current_second = int(now)
        current_minute = int(now / 60)
        current_hour = int(now / 3600)
        current_day = int(now / 86400)
        
        # Clean old entries
        self._cleanup_old_entries(identifier, current_second, current_minute, current_hour, current_day)
        
        # Check burst limit (per second)
        second_count = self._second_counters[identifier].get(current_second, 0)
        if second_count >= limits.burst_limit:
            return False, "Burst limit exceeded", 1
        
        # Check minute limit
        minute_count = sum(
            count for window, count in self._minute_counters[identifier].items()
            if window >= current_minute - 1
        )
        if minute_count >= limits.requests_per_minute:
            return False, "Per-minute limit exceeded", 60
        
        # Check hour limit
        hour_count = sum(
            count for window, count in self._hour_counters[identifier].items()
            if window >= current_hour - 1
        )
        if hour_count >= limits.requests_per_hour:
            return False, "Per-hour limit exceeded", 3600
        
        # Check day limit
        day_count = sum(
            count for window, count in self._day_counters[identifier].items()
            if window >= current_day - 1
        )
        if day_count >= limits.requests_per_day:
            return False, "Daily limit exceeded", 86400
        
        return True, None, None
    
    async def _is_blocked(self, identifier: str) -> Optional[float]:
        """Check if identifier is blocked (Redis or memory)."""
        now = time.time()
        
        # Try Redis first
        if _redis_available and _redis_client:
            try:
                blocked_until = await _redis_client.get(f"ratelimit:blocked:{identifier}")
                if blocked_until:
                    blocked_time = float(blocked_until)
                    if now < blocked_time:
                        return blocked_time
                    else:
                        await _redis_client.delete(f"ratelimit:blocked:{identifier}")
            except Exception:
                pass
        
        # Check memory fallback
        if identifier in self._blocked:
            if now < self._blocked[identifier]:
                return self._blocked[identifier]
            else:
                del self._blocked[identifier]
        
        return None
    
    async def record_request(self, identifier: str):
        """
        Record a request (call after check_limit returns True).
        For Redis, this is handled atomically in check_limit.
        For memory fallback, we need to increment counters.
        """
        if _redis_available:
            return  # Already recorded in Lua script
            
        now = time.time()
        
        current_second = int(now)
        current_minute = int(now / 60)
        current_hour = int(now / 3600)
        current_day = int(now / 86400)
        
        # Ensure defaultdicts exist
        if identifier not in self._second_counters:
            self._second_counters[identifier] = defaultdict(int)
        if identifier not in self._minute_counters:
            self._minute_counters[identifier] = defaultdict(int)
        if identifier not in self._hour_counters:
            self._hour_counters[identifier] = defaultdict(int)
        if identifier not in self._day_counters:
            self._day_counters[identifier] = defaultdict(int)
        
        self._second_counters[identifier][current_second] += 1
        self._minute_counters[identifier][current_minute] += 1
        self._hour_counters[identifier][current_hour] += 1
        self._day_counters[identifier][current_day] += 1
    
    def _cleanup_old_entries(
        self,
        identifier: str,
        current_second: int,
        current_minute: int,
        current_hour: int,
        current_day: int
    ):
        """Clean up old counter entries (memory only)."""
        # Use defaultdict to ensure we can always increment
        if identifier not in self._second_counters:
            self._second_counters[identifier] = defaultdict(int)
        self._second_counters[identifier] = defaultdict(int, {
            k: v for k, v in self._second_counters[identifier].items()
            if k >= current_second - 10
        })
        
        if identifier not in self._minute_counters:
            self._minute_counters[identifier] = defaultdict(int)
        self._minute_counters[identifier] = defaultdict(int, {
            k: v for k, v in self._minute_counters[identifier].items()
            if k >= current_minute - 2
        })
        
        if identifier not in self._hour_counters:
            self._hour_counters[identifier] = defaultdict(int)
        self._hour_counters[identifier] = defaultdict(int, {
            k: v for k, v in self._hour_counters[identifier].items()
            if k >= current_hour - 2
        })
        
        if identifier not in self._day_counters:
            self._day_counters[identifier] = defaultdict(int)
        self._day_counters[identifier] = defaultdict(int, {
            k: v for k, v in self._day_counters[identifier].items()
            if k >= current_day - 2
        })
    
    async def block_identifier(self, identifier: str, duration_seconds: int = 3600):
        """
        Temporarily block an identifier (distributed via Redis).
        
        Args:
            identifier: User ID, IP address, or API key
            duration_seconds: Block duration
        """
        unblock_time = time.time() + duration_seconds
        
        # Store in Redis for distributed blocking
        if _redis_available and _redis_client:
            try:
                await _redis_client.setex(
                    f"ratelimit:blocked:{identifier}",
                    duration_seconds,
                    str(unblock_time)
                )
            except Exception as e:
                logger.warning(f"Redis block failed: {e}")
        
        # Also store locally
        self._blocked[identifier] = unblock_time
    
    async def unblock_identifier(self, identifier: str):
        """Unblock an identifier."""
        if _redis_available and _redis_client:
            try:
                await _redis_client.delete(f"ratelimit:blocked:{identifier}")
            except Exception:
                pass
        
        if identifier in self._blocked:
            del self._blocked[identifier]
    
    def set_custom_limits(self, identifier: str, limits: RateLimitConfig):
        """Set custom rate limits for an identifier."""
        self._custom_limits[identifier] = limits
    
    def remove_custom_limits(self, identifier: str):
        """Remove custom limits for an identifier."""
        if identifier in self._custom_limits:
            del self._custom_limits[identifier]
    
    async def get_remaining(
        self,
        identifier: str,
        endpoint_type: str = 'api'
    ) -> Dict[str, int]:
        """Get remaining requests for each window."""
        limits = self._custom_limits.get(identifier) or self.DEFAULT_LIMITS.get(endpoint_type, self.DEFAULT_LIMITS['api'])
        
        # Try Redis first
        if _redis_available and _redis_client:
            try:
                return await self._get_remaining_redis(identifier, endpoint_type, limits)
            except Exception:
                pass
        
        return self._get_remaining_memory(identifier, limits)
    
    async def _get_remaining_redis(
        self,
        identifier: str,
        endpoint_type: str,
        limits: RateLimitConfig
    ) -> Dict[str, int]:
        """Get remaining from Redis."""
        now = time.time()
        
        pipe = _redis_client.pipeline()
        
        minute_key = f"ratelimit:{identifier}:minute:{endpoint_type}"
        hour_key = f"ratelimit:{identifier}:hour:{endpoint_type}"
        day_key = f"ratelimit:{identifier}:day:{endpoint_type}"
        
        pipe.zcount(minute_key, now - 60, now)
        pipe.zcount(hour_key, now - 3600, now)
        pipe.zcount(day_key, now - 86400, now)
        
        results = await pipe.execute()
        
        return {
            'per_minute': max(0, limits.requests_per_minute - results[0]),
            'per_hour': max(0, limits.requests_per_hour - results[1]),
            'per_day': max(0, limits.requests_per_day - results[2])
        }
    
    def _get_remaining_memory(
        self,
        identifier: str,
        limits: RateLimitConfig
    ) -> Dict[str, int]:
        """Get remaining from memory."""
        now = time.time()
        
        current_minute = int(now / 60)
        current_hour = int(now / 3600)
        current_day = int(now / 86400)
        
        minute_count = sum(
            count for window, count in self._minute_counters[identifier].items()
            if window >= current_minute - 1
        )
        hour_count = sum(
            count for window, count in self._hour_counters[identifier].items()
            if window >= current_hour - 1
        )
        day_count = sum(
            count for window, count in self._day_counters[identifier].items()
            if window >= current_day - 1
        )
        
        return {
            'per_minute': max(0, limits.requests_per_minute - minute_count),
            'per_hour': max(0, limits.requests_per_hour - hour_count),
            'per_day': max(0, limits.requests_per_day - day_count)
        }
    
    # Synchronous compatibility methods for backward compatibility
    def check_limit_sync(
        self,
        identifier: str,
        endpoint_type: str = 'api'
    ) -> Tuple[bool, Optional[str], Optional[int]]:
        """Synchronous check_limit for backward compatibility."""
        limits = self._custom_limits.get(identifier) or self.DEFAULT_LIMITS.get(endpoint_type, self.DEFAULT_LIMITS['api'])
        return self._check_limit_memory(identifier, limits)
    
    def record_request_sync(self, identifier: str):
        """Synchronous record_request for backward compatibility."""
        now = time.time()
        
        current_second = int(now)
        current_minute = int(now / 60)
        current_hour = int(now / 3600)
        current_day = int(now / 86400)
        
        # Ensure defaultdicts exist
        if identifier not in self._second_counters:
            self._second_counters[identifier] = defaultdict(int)
        if identifier not in self._minute_counters:
            self._minute_counters[identifier] = defaultdict(int)
        if identifier not in self._hour_counters:
            self._hour_counters[identifier] = defaultdict(int)
        if identifier not in self._day_counters:
            self._day_counters[identifier] = defaultdict(int)
        
        self._second_counters[identifier][current_second] += 1
        self._minute_counters[identifier][current_minute] += 1
        self._hour_counters[identifier][current_hour] += 1
        self._day_counters[identifier][current_day] += 1


# Backward compatible alias
RateLimiter = RedisRateLimiter


# Singleton instance
_rate_limiter: Optional[RedisRateLimiter] = None


def get_rate_limiter() -> RedisRateLimiter:
    """Get or create the RateLimiter singleton."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RedisRateLimiter()
    return _rate_limiter


async def initialize_rate_limiter(redis_url: str = "redis://localhost:6379/1") -> RedisRateLimiter:
    """Initialize rate limiter with Redis connection."""
    global _rate_limiter
    
    await init_redis(redis_url)
    _rate_limiter = RedisRateLimiter()
    
    logger.info(f"Rate limiter initialized (Redis: {_redis_available})")
    return _rate_limiter


async def shutdown_rate_limiter():
    """Shutdown rate limiter and close Redis connection."""
    await close_redis()
    logger.info("Rate limiter shutdown complete")
