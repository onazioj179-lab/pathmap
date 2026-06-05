"""
PATHMAP - Security Hardening Module
====================================
Production security measures: rate limiting, headers, input validation.
"""

import os
import re
import html
import secrets
from datetime import datetime, timedelta
from typing import Dict, Any, Callable
from collections import defaultdict
import asyncio
import logging

from fastapi import Request, Response, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


# ============== CONFIGURATION ==============

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3002").split(",")


# ============== SECURITY HEADERS ==============

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # Content Security Policy
        if ENVIRONMENT == "production":
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com; "
                "img-src 'self' data: https: blob:; "
                "connect-src 'self' https: wss: https://tile.openstreetmap.org https://api.maptiler.com https://tiles.stadiamaps.com https://basemaps.cartocdn.com; "
                "worker-src 'self' blob:; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                "object-src 'none';"
            )
        else:
            # Dev CSP allows inline for Vite HMR
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com; "
                "img-src 'self' data: https: blob:; "
                "connect-src 'self' http://localhost:8000 ws://localhost:8000 http://localhost:3002 https://tile.openstreetmap.org https://api.maptiler.com https://tiles.stadiamaps.com https://basemaps.cartocdn.com; "
                "worker-src 'self' blob:; "
                "frame-ancestors 'none';"
            )
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "geolocation=(self), "
            "camera=(), "
            "microphone=(), "
            "payment=(), "
            "usb=(), "
            "bluetooth=(self)"
        )
        
        # HSTS (only in production)
        if ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        
        # Remove server header
        if "Server" in response.headers:
            del response.headers["Server"]
        
        return response


# ============== RATE LIMITING ==============

class RateLimiter:
    """Token bucket rate limiter with Redis support."""
    
    def __init__(
        self,
        max_requests: int = 100,
        window_seconds: int = 60,
        burst_size: int = 10
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.burst_size = burst_size
        self._buckets: Dict[str, Dict] = defaultdict(lambda: {
            "tokens": max_requests,
            "last_update": datetime.utcnow()
        })
        self._lock = asyncio.Lock()
    
    def _get_client_id(self, request: Request) -> str:
        """Get client identifier for rate limiting."""
        # Try to get real IP behind proxy
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "unknown"
        
        # Include user ID if authenticated
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"user:{user_id}"
        
        return f"ip:{ip}"
    
    async def is_allowed(self, client_id: str) -> tuple[bool, Dict[str, Any]]:
        """Check if request is allowed under rate limit."""
        async with self._lock:
            bucket = self._buckets[client_id]
            now = datetime.utcnow()
            
            # Refill tokens
            elapsed = (now - bucket["last_update"]).total_seconds()
            refill = int(elapsed * (self.max_requests / self.window_seconds))
            bucket["tokens"] = min(self.max_requests, bucket["tokens"] + refill)
            bucket["last_update"] = now
            
            # Check if request is allowed
            if bucket["tokens"] >= 1:
                bucket["tokens"] -= 1
                return True, {
                    "remaining": bucket["tokens"],
                    "limit": self.max_requests,
                    "reset": int(self.window_seconds - elapsed)
                }
            
            return False, {
                "remaining": 0,
                "limit": self.max_requests,
                "reset": int(self.window_seconds - elapsed)
            }
    
    async def check_request(self, request: Request) -> Dict[str, Any]:
        """Check request and raise if rate limited."""
        client_id = self._get_client_id(request)
        allowed, info = await self.is_allowed(client_id)
        
        if not allowed:
            logger.warning(f"Rate limit exceeded for {client_id}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Try again later.",
                headers={
                    "Retry-After": str(info["reset"]),
                    "X-RateLimit-Limit": str(info["limit"]),
                    "X-RateLimit-Remaining": str(info["remaining"]),
                    "X-RateLimit-Reset": str(info["reset"]),
                }
            )
        
        return info


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware."""
    
    def __init__(self, app, limiter: RateLimiter = None):
        super().__init__(app)
        self.limiter = limiter or RateLimiter()
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip rate limiting for health checks
        if request.url.path in ["/health", "/ready", "/api/v1/health"]:
            return await call_next(request)
        
        # Check rate limit
        info = await self.limiter.check_request(request)
        
        # Process request
        response = await call_next(request)
        
        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(info["limit"])
        response.headers["X-RateLimit-Remaining"] = str(info["remaining"])
        response.headers["X-RateLimit-Reset"] = str(info["reset"])
        
        return response


# ============== INPUT VALIDATION ==============

class InputValidator:
    """Input validation and sanitization."""
    
    # Patterns
    EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    USERNAME_PATTERN = re.compile(r'^[a-zA-Z0-9_]{3,30}$')
    UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
    PHONE_PATTERN = re.compile(r'^\+?[1-9]\d{7,14}$')
    
    # SQL injection patterns
    SQL_PATTERNS = [
        re.compile(r"(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)", re.I),
        re.compile(r"(--|\;|\*|/\*|\*/)", re.I),
        re.compile(r"(\bor\b|\band\b).*(\=|like)", re.I),
    ]
    
    # XSS patterns
    XSS_PATTERNS = [
        re.compile(r"<script.*?>.*?</script>", re.I | re.S),
        re.compile(r"javascript:", re.I),
        re.compile(r"on\w+\s*=", re.I),
        re.compile(r"<.*?\s+on\w+\s*=", re.I | re.S),
    ]
    
    @classmethod
    def validate_email(cls, email: str) -> bool:
        """Validate email format."""
        if not email or len(email) > 255:
            return False
        return bool(cls.EMAIL_PATTERN.match(email))
    
    @classmethod
    def validate_username(cls, username: str) -> bool:
        """Validate username format."""
        if not username or len(username) < 3 or len(username) > 30:
            return False
        return bool(cls.USERNAME_PATTERN.match(username))
    
    @classmethod
    def validate_uuid(cls, uuid_str: str) -> bool:
        """Validate UUID format."""
        if not uuid_str:
            return False
        return bool(cls.UUID_PATTERN.match(uuid_str))
    
    @classmethod
    def validate_phone(cls, phone: str) -> bool:
        """Validate phone number format."""
        if not phone:
            return False
        # Remove spaces and dashes
        phone = re.sub(r'[\s\-]', '', phone)
        return bool(cls.PHONE_PATTERN.match(phone))
    
    @classmethod
    def sanitize_html(cls, text: str) -> str:
        """Escape HTML characters."""
        if not text:
            return ""
        return html.escape(text, quote=True)
    
    @classmethod
    def check_sql_injection(cls, text: str) -> bool:
        """Check for SQL injection patterns."""
        if not text:
            return False
        for pattern in cls.SQL_PATTERNS:
            if pattern.search(text):
                return True
        return False
    
    @classmethod
    def check_xss(cls, text: str) -> bool:
        """Check for XSS patterns."""
        if not text:
            return False
        for pattern in cls.XSS_PATTERNS:
            if pattern.search(text):
                return True
        return False
    
    @classmethod
    def sanitize_input(cls, text: str, max_length: int = 1000) -> str:
        """Sanitize user input."""
        if not text:
            return ""
        
        # Truncate
        text = text[:max_length]
        
        # Remove null bytes
        text = text.replace('\x00', '')
        
        # Escape HTML
        text = cls.sanitize_html(text)
        
        return text.strip()
    
    @classmethod
    def validate_coordinates(cls, lat: float, lng: float) -> bool:
        """Validate GPS coordinates."""
        return -90 <= lat <= 90 and -180 <= lng <= 180


# ============== CSRF PROTECTION ==============

class CSRFProtection:
    """CSRF token generation and validation."""
    
    TOKEN_LENGTH = 32
    TOKEN_HEADER = "X-CSRF-Token"
    TOKEN_COOKIE = "csrf_token"
    
    @classmethod
    def generate_token(cls) -> str:
        """Generate CSRF token."""
        return secrets.token_urlsafe(cls.TOKEN_LENGTH)
    
    @classmethod
    def validate_token(cls, request: Request) -> bool:
        """Validate CSRF token from request."""
        # Skip for safe methods
        if request.method in ["GET", "HEAD", "OPTIONS"]:
            return True
        
        # Get token from header
        header_token = request.headers.get(cls.TOKEN_HEADER)
        
        # Get token from cookie
        cookie_token = request.cookies.get(cls.TOKEN_COOKIE)
        
        if not header_token or not cookie_token:
            return False
        
        # Constant-time comparison
        return secrets.compare_digest(header_token, cookie_token)


class CSRFMiddleware(BaseHTTPMiddleware):
    """CSRF protection middleware."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip for API routes (they use JWT)
        if request.url.path.startswith("/api/"):
            return await call_next(request)
        
        # Validate CSRF token
        if not CSRFProtection.validate_token(request):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token missing or invalid"
            )
        
        response = await call_next(request)
        
        # Set CSRF cookie for forms
        if request.method == "GET":
            token = CSRFProtection.generate_token()
            response.set_cookie(
                CSRFProtection.TOKEN_COOKIE,
                token,
                httponly=False,  # Needs to be read by JS
                secure=ENVIRONMENT == "production",
                samesite="strict",
                max_age=3600
            )
        
        return response


# ============== REQUEST VALIDATION MIDDLEWARE ==============

class RequestValidationMiddleware(BaseHTTPMiddleware):
    """Validate all incoming requests."""
    
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10MB
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Check content length
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.MAX_CONTENT_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Request body too large"
            )
        
        # Check for suspicious patterns in URL
        path = request.url.path
        if ".." in path or InputValidator.check_sql_injection(path):
            logger.warning(f"Suspicious URL pattern: {path}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid request"
            )
        
        # Check query parameters
        for key, value in request.query_params.items():
            if InputValidator.check_sql_injection(value) or InputValidator.check_xss(value):
                logger.warning(f"Suspicious query param: {key}={value[:100]}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid request parameters"
                )
        
        return await call_next(request)


# ============== IP BLOCKING ==============

class IPBlocker:
    """IP blocking for security."""
    
    def __init__(self):
        self._blocked_ips: Dict[str, datetime] = {}
        self._failed_attempts: Dict[str, int] = defaultdict(int)
        self._lock = asyncio.Lock()
    
    async def record_failed_attempt(self, ip: str, threshold: int = 5):
        """Record failed login/auth attempt."""
        async with self._lock:
            self._failed_attempts[ip] += 1
            
            if self._failed_attempts[ip] >= threshold:
                # Block for 1 hour
                self._blocked_ips[ip] = datetime.utcnow() + timedelta(hours=1)
                logger.warning(f"Blocked IP due to failed attempts: {ip}")
    
    async def is_blocked(self, ip: str) -> bool:
        """Check if IP is blocked."""
        async with self._lock:
            if ip in self._blocked_ips:
                if datetime.utcnow() < self._blocked_ips[ip]:
                    return True
                else:
                    # Block expired
                    del self._blocked_ips[ip]
                    self._failed_attempts[ip] = 0
            return False
    
    async def reset_attempts(self, ip: str):
        """Reset failed attempts on successful auth."""
        async with self._lock:
            self._failed_attempts[ip] = 0
            self._blocked_ips.pop(ip, None)


# ============== SETUP FUNCTION ==============

def setup_security(app):
    """Configure all security middleware for FastAPI app."""
    
    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS if ENVIRONMENT == "production" else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    )
    
    # Security headers
    app.add_middleware(SecurityHeadersMiddleware)
    
    # Rate limiting
    app.add_middleware(RateLimitMiddleware, limiter=RateLimiter(
        max_requests=100,
        window_seconds=60
    ))
    
    # Request validation
    app.add_middleware(RequestValidationMiddleware)
    
    logger.info("Security middleware configured")


# Singleton instances
ip_blocker = IPBlocker()
input_validator = InputValidator()
