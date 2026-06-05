"""
PATHMAP V97 - Rate Limit Middleware
===================================
FastAPI middleware that applies rate limiting to all routes.
Uses the existing rate_limiter module.
"""

import time
import logging
from typing import Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("RateLimitMiddleware")

# Import rate limiter
try:
    from security.rate_limiter import get_rate_limiter
    RATE_LIMITER_AVAILABLE = True
except ImportError:
    RATE_LIMITER_AVAILABLE = False
    logger.warning("Rate limiter not available, middleware disabled")


# Endpoint type mapping based on path patterns
ENDPOINT_TYPE_MAP = {
    '/api/v1/auth': 'auth',
    '/api/v1/tunnel': 'tunnel',
    '/api/v1/tracking': 'location',
    '/api/v1/social': 'api',
    '/route': 'api',
    '/safe_return': 'api',
    '/search': 'search',
    '/explore': 'api',
}


def get_endpoint_type(path: str) -> str:
    """Determine endpoint type based on path for rate limiting."""
    for prefix, endpoint_type in ENDPOINT_TYPE_MAP.items():
        if path.startswith(prefix):
            return endpoint_type
    return 'api'  # default


def get_client_identifier(request: Request) -> str:
    """Extract client identifier for rate limiting."""
    # Try to get user ID from auth header
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        # Use token hash as identifier (first 16 chars)
        token = auth_header[7:]
        return f"token:{token[:16]}" if len(token) > 16 else f"token:{token}"
    
    # Try to get from X-Device-ID header
    device_id = request.headers.get('X-Device-ID')
    if device_id:
        return f"device:{device_id}"
    
    # Fall back to IP address
    forwarded = request.headers.get('X-Forwarded-For')
    if forwarded:
        # Get first IP in chain
        ip = forwarded.split(',')[0].strip()
        return f"ip:{ip}"
    
    client_ip = request.client.host if request.client else 'unknown'
    return f"ip:{client_ip}"


# Paths to skip rate limiting
SKIP_PATHS = {
    '/docs',
    '/redoc',
    '/openapi.json',
    '/v1/health',
    '/health',
    '/favicon.ico',
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware for FastAPI.
    
    Applies rate limits based on endpoint type and client identifier.
    Uses Redis when available, falls back to in-memory.
    """
    
    def __init__(self, app, skip_paths: set = None):
        super().__init__(app)
        self.skip_paths = skip_paths or SKIP_PATHS
        self._rate_limiter = None
        self._initialized = False
    
    async def _get_limiter(self):
        """Lazy initialization of rate limiter."""
        if not self._initialized and RATE_LIMITER_AVAILABLE:
            self._rate_limiter = get_rate_limiter()
            self._initialized = True
        return self._rate_limiter
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request with rate limiting."""
        path = request.url.path
        
        # Skip rate limiting for certain paths
        if any(path.startswith(skip) for skip in self.skip_paths):
            return await call_next(request)
        
        # Skip WebSocket upgrades (handled differently)
        if request.headers.get('Upgrade', '').lower() == 'websocket':
            return await call_next(request)
        
        # Get rate limiter
        limiter = await self._get_limiter()
        if not limiter:
            # Rate limiter not available, allow request
            return await call_next(request)
        
        # Get client identifier and endpoint type
        identifier = get_client_identifier(request)
        endpoint_type = get_endpoint_type(path)
        
        # Check rate limit
        try:
            allowed, reason, retry_after = await limiter.check_limit(identifier, endpoint_type)
            
            if not allowed:
                logger.warning(f"Rate limit exceeded: {identifier} on {path} - {reason}")
                return JSONResponse(
                    status_code=429,
                    content={
                        'error': 'rate_limit_exceeded',
                        'message': reason or 'Too many requests',
                        'retry_after': retry_after or 60
                    },
                    headers={
                        'Retry-After': str(retry_after or 60),
                        'X-RateLimit-Reset': str(int(time.time()) + (retry_after or 60))
                    }
                )
            
            # Record the request
            await limiter.record_request(identifier)
            
            # Get remaining requests for headers
            remaining = await limiter.get_remaining(identifier, endpoint_type)
            
            # Process request
            response = await call_next(request)
            
            # Add rate limit headers
            response.headers['X-RateLimit-Remaining-Minute'] = str(remaining.get('per_minute', 0))
            response.headers['X-RateLimit-Remaining-Hour'] = str(remaining.get('per_hour', 0))
            
            return response
            
        except Exception as e:
            logger.error(f"Rate limit check failed: {e}")
            # On error, allow request but log
            return await call_next(request)
