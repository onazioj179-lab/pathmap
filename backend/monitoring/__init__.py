"""
PATHMAP - Monitoring Package
============================
Error tracking, logging, and performance monitoring.
"""

from .sentry_integration import (
    init_sentry,
    capture_exception,
    capture_message,
    set_user_context,
    clear_user_context,
    add_breadcrumb,
    set_tag,
    set_extra,
    trace_function,
    trigger_alert,
    check_sentry_health,
    PathMapError,
    AuthenticationError,
    AuthorizationError,
    ValidationError,
    RateLimitError,
    ExternalServiceError,
)

from .logging_system import (
    setup_logging,
    get_logger,
    set_request_context,
    clear_request_context,
    generate_request_id,
    security_logger,
    access_logger,
    performance_logger,
    log_function_call,
)

__all__ = [
    # Sentry
    "init_sentry",
    "capture_exception",
    "capture_message",
    "set_user_context",
    "clear_user_context",
    "add_breadcrumb",
    "set_tag",
    "set_extra",
    "trace_function",
    "trigger_alert",
    "check_sentry_health",
    # Errors
    "PathMapError",
    "AuthenticationError",
    "AuthorizationError",
    "ValidationError",
    "RateLimitError",
    "ExternalServiceError",
    # Logging
    "setup_logging",
    "get_logger",
    "set_request_context",
    "clear_request_context",
    "generate_request_id",
    "security_logger",
    "access_logger",
    "performance_logger",
    "log_function_call",
]
