"""
PATHMAP - Cache Control Middleware
===================================
Prevents caching of sensitive API responses (auth, PII).
"""

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable


class CacheControlMiddleware(BaseHTTPMiddleware):
    """Add appropriate Cache-Control headers to API responses."""
    
    # Endpoints that should never be cached
    NO_CACHE_PATHS = [
        "/api/v1/auth",
        "/api/v1/social/auth",
        "/v1/auth",
        "/auth",
        "/login",
        "/register",
        "/api/v1/tracking",
        "/api/v1/social/location",
        "/api/v1/tunnel",
    ]
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # Check if path matches any no-cache pattern
        path = request.url.path
        should_not_cache = any(path.startswith(nc_path) for nc_path in self.NO_CACHE_PATHS)
        
        if should_not_cache:
            # Prevent caching of sensitive responses
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        
        return response
