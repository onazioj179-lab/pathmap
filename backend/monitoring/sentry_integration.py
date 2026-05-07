"""
PATHMAP - Sentry Error Tracking Integration
============================================
Production-grade error monitoring and performance tracking.
Gracefully handles missing Sentry SDK installation.
"""
# pyright: reportUnknownMemberType=false
# pyright: reportUnknownVariableType=false
# pyright: reportUnknownArgumentType=false

from __future__ import annotations
import os
import logging
import asyncio
from typing import Optional, Any, Callable, TypeVar
from functools import wraps

# Type variable for decorators
F = TypeVar("F", bound=Callable[..., Any])

# ============== OPTIONAL SENTRY IMPORT ==============
# Sentry is optional - system works without it
# pyright: reportMissingImports=false

_sentry_sdk: Any = None
_sentry_available = False
_FastApiIntegration: Any = None
_StarletteIntegration: Any = None
_SqlalchemyIntegration: Any = None
_RedisIntegration: Any = None
_AsyncioIntegration: Any = None
_LoggingIntegration: Any = None

try:
    import sentry_sdk as _sentry_module  # type: ignore[import-not-found]
    from sentry_sdk.integrations.fastapi import FastApiIntegration  # type: ignore[import-not-found]
    from sentry_sdk.integrations.starlette import StarletteIntegration  # type: ignore[import-not-found]
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration  # type: ignore[import-not-found]
    from sentry_sdk.integrations.redis import RedisIntegration  # type: ignore[import-not-found]
    from sentry_sdk.integrations.asyncio import AsyncioIntegration  # type: ignore[import-not-found]
    from sentry_sdk.integrations.logging import LoggingIntegration  # type: ignore[import-not-found]
    
    _sentry_sdk = _sentry_module
    _sentry_available = True
    _FastApiIntegration = FastApiIntegration
    _StarletteIntegration = StarletteIntegration
    _SqlalchemyIntegration = SqlalchemyIntegration
    _RedisIntegration = RedisIntegration
    _AsyncioIntegration = AsyncioIntegration
    _LoggingIntegration = LoggingIntegration
except ImportError:
    # Sentry SDK not installed - all functions become no-ops
    pass


# ============== CONFIGURATION ==============

SENTRY_DSN = os.getenv("SENTRY_DSN", "")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
RELEASE_VERSION = os.getenv("RELEASE_VERSION", "1.0.0")
SAMPLE_RATE = float(os.getenv("SENTRY_SAMPLE_RATE", "1.0"))
TRACES_SAMPLE_RATE = float(os.getenv("SENTRY_TRACES_RATE", "0.1"))


# ============== INITIALIZATION ==============

def init_sentry() -> bool:
    """Initialize Sentry SDK with all integrations."""
    
    if not _sentry_available:
        logging.warning("Sentry SDK not installed, error tracking disabled")
        return False
    
    if not SENTRY_DSN:
        logging.warning("Sentry DSN not configured, error tracking disabled")
        return False
    
    try:
        # Logging integration settings
        logging_integration = _LoggingIntegration(
            level=logging.INFO,
            event_level=logging.ERROR
        )
        
        _sentry_sdk.init(
            dsn=SENTRY_DSN,
            environment=ENVIRONMENT,
            release=f"pathmap@{RELEASE_VERSION}",
            sample_rate=SAMPLE_RATE,
            traces_sample_rate=TRACES_SAMPLE_RATE,
            profiles_sample_rate=0.1,
            integrations=[
                _FastApiIntegration(transaction_style="endpoint"),
                _StarletteIntegration(transaction_style="endpoint"),
                _SqlalchemyIntegration(),
                _RedisIntegration(),
                _AsyncioIntegration(),
                logging_integration,
            ],
            send_default_pii=False,
            attach_stacktrace=True,
            max_breadcrumbs=50,
            debug=ENVIRONMENT == "development",
            before_send=_before_send_filter,
            before_send_transaction=_before_send_transaction_filter,
            ignore_errors=[
                KeyboardInterrupt,
                SystemExit,
            ],
        )
        
        logging.info(f"Sentry initialized for environment: {ENVIRONMENT}")
        return True
        
    except Exception as e:
        logging.error(f"Failed to initialize Sentry: {e}")
        return False


# ============== FILTER FUNCTIONS ==============

def _before_send_filter(event: dict[str, Any], hint: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Filter and modify events before sending to Sentry."""
    
    if ENVIRONMENT == "development" and not os.getenv("SENTRY_DEV_ENABLED"):
        return None
    
    # Remove sensitive headers
    if "request" in event:
        request_data = event.get("request")
        if isinstance(request_data, dict):
            headers: dict[str, Any] = request_data.get("headers", {})
            for key in ["authorization", "cookie", "x-api-key"]:
                if key in headers:
                    del headers[key]
    
    # Filter specific exception types
    if "exception" in event:
        exception_data = event.get("exception")
        if isinstance(exception_data, dict):
            values_list: list[Any] = exception_data.get("values", [])
            if values_list and len(values_list) > 0:
                first_value = values_list[0]
                exc_type = ""
                if isinstance(first_value, dict):
                    exc_type = str(first_value.get("type", ""))
                
                ignored_types = [
                    "ConnectionResetError",
                    "BrokenPipeError",
                    "ClientDisconnectedError",
                ]
                
                if exc_type in ignored_types:
                    return None
    
    return event


def _before_send_transaction_filter(event: dict[str, Any], hint: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Filter transactions before sending."""
    
    transaction_name = event.get("transaction", "")
    if isinstance(transaction_name, str):
        if any(path in transaction_name for path in ["/health", "/ready", "/metrics"]):
            return None
    
    return event


# ============== CONTEXT HELPERS ==============

def set_user_context(
    user_id: str,
    username: Optional[str] = None,
    email: Optional[str] = None
) -> None:
    """Set user context for error tracking."""
    if not _sentry_available or _sentry_sdk is None:
        return
    
    _sentry_sdk.set_user({
        "id": user_id,
        "username": username,
        "email": email,
    })


def clear_user_context() -> None:
    """Clear user context."""
    if not _sentry_available or _sentry_sdk is None:
        return
    
    _sentry_sdk.set_user(None)


def add_breadcrumb(
    message: str,
    category: str = "custom",
    level: str = "info",
    data: Optional[dict[str, Any]] = None
) -> None:
    """Add breadcrumb for debugging."""
    if not _sentry_available or _sentry_sdk is None:
        return
    
    _sentry_sdk.add_breadcrumb(
        message=message,
        category=category,
        level=level,
        data=data or {}
    )


def set_tag(key: str, value: str) -> None:
    """Set tag for filtering."""
    if not _sentry_available or _sentry_sdk is None:
        return
    
    _sentry_sdk.set_tag(key, value)


def set_extra(key: str, value: Any) -> None:
    """Set extra context data."""
    if not _sentry_available or _sentry_sdk is None:
        return
    
    _sentry_sdk.set_extra(key, value)


# ============== ERROR CAPTURE ==============

def capture_exception(exception: Exception, **context: Any) -> Optional[str]:
    """Capture exception with additional context."""
    if not _sentry_available or _sentry_sdk is None:
        logging.error(f"Exception: {exception}", exc_info=True)
        return None
    
    with _sentry_sdk.push_scope() as scope:
        for key, value in context.items():
            scope.set_extra(key, value)
        
        return _sentry_sdk.capture_exception(exception)


def capture_message(message: str, level: str = "info", **context: Any) -> Optional[str]:
    """Capture message event."""
    if not _sentry_available or _sentry_sdk is None:
        getattr(logging, level, logging.info)(message)
        return None
    
    with _sentry_sdk.push_scope() as scope:
        for key, value in context.items():
            scope.set_extra(key, value)
        
        return _sentry_sdk.capture_message(message, level=level)


# ============== PERFORMANCE MONITORING ==============

def start_transaction(name: str, op: str = "task") -> Any:
    """Start a performance transaction."""
    if not _sentry_available or _sentry_sdk is None:
        return None
    
    return _sentry_sdk.start_transaction(name=name, op=op)


def trace_function(op: str = "function") -> Callable[[F], F]:
    """Decorator to trace function performance."""
    def decorator(func: F) -> F:
        if not _sentry_available or _sentry_sdk is None:
            return func
        
        @wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            with _sentry_sdk.start_span(op=op, description=func.__name__):
                return await func(*args, **kwargs)
        
        @wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            with _sentry_sdk.start_span(op=op, description=func.__name__):
                return func(*args, **kwargs)
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper  # type: ignore[return-value]
        return sync_wrapper  # type: ignore[return-value]
    return decorator


# ============== CUSTOM ERROR CLASSES ==============

class PathMapError(Exception):
    """Base PathMap error with optional Sentry integration."""
    
    def __init__(self, message: str, code: Optional[str] = None, **context: Any) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.context = context
        
        # Automatically capture to Sentry if available
        capture_exception(self, error_code=code, **context)


class AuthenticationError(PathMapError):
    """Authentication failure."""
    pass


class AuthorizationError(PathMapError):
    """Authorization failure."""
    pass


class ValidationError(PathMapError):
    """Input validation failure."""
    pass


class RateLimitError(PathMapError):
    """Rate limit exceeded."""
    pass


class ExternalServiceError(PathMapError):
    """External service failure."""
    pass


# ============== FASTAPI MIDDLEWARE ==============

class SentryMiddleware:
    """FastAPI middleware for Sentry integration."""
    
    def __init__(self, app: Any) -> None:
        self.app = app
    
    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        if not _sentry_available or _sentry_sdk is None:
            await self.app(scope, receive, send)
            return
        
        with _sentry_sdk.configure_scope() as sentry_scope:
            sentry_scope.set_extra("path", scope.get("path"))
            sentry_scope.set_extra("method", scope.get("method"))
            
            try:
                await self.app(scope, receive, send)
            except Exception as e:
                capture_exception(e)
                raise


# ============== ALERTS & NOTIFICATIONS ==============

def trigger_alert(
    title: str,
    message: str,
    level: str = "warning",
    tags: Optional[dict[str, str]] = None
) -> None:
    """Trigger an alert via Sentry or logging fallback."""
    if not _sentry_available or _sentry_sdk is None:
        logging.warning(f"[ALERT] {title}: {message}")
        return
    
    with _sentry_sdk.push_scope() as scope:
        scope.level = level
        if tags:
            for key, value in tags.items():
                scope.set_tag(key, value)
        
        capture_message(f"[ALERT] {title}: {message}", level=level)


# ============== HEALTH CHECK ==============

def check_sentry_health() -> dict[str, Any]:
    """Check if Sentry is properly configured."""
    return {
        "available": _sentry_available,
        "configured": bool(SENTRY_DSN),
        "environment": ENVIRONMENT,
        "release": RELEASE_VERSION,
        "sample_rate": SAMPLE_RATE,
        "traces_sample_rate": TRACES_SAMPLE_RATE,
    }
