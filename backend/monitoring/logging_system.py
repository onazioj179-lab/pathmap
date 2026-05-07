"""
PATHMAP - Comprehensive Logging System
======================================
Structured logging with multiple outputs and log rotation.
"""
# pyright: reportUnknownMemberType=false
# pyright: reportUnknownVariableType=false
# pyright: reportUnknownArgumentType=false
# pyright: reportMissingParameterType=false

import logging
import logging.handlers
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Callable, TypeVar
from contextvars import ContextVar
from functools import wraps
import traceback
import uuid
import asyncio

# Type variable for decorators
F = TypeVar("F", bound=Callable[..., Any])


# ============== CONTEXT VARIABLES ==============

request_id_var: ContextVar[str] = ContextVar("request_id", default="")
user_id_var: ContextVar[str] = ContextVar("user_id", default="")


# ============== CONFIGURATION ==============

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FORMAT = os.getenv("LOG_FORMAT", "json")  # json or text
LOG_DIR = os.getenv("LOG_DIR", "logs")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


# ============== STRUCTURED JSON FORMATTER ==============

class JSONFormatter(logging.Formatter):
    """JSON log formatter for structured logging."""
    
    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "environment": ENVIRONMENT,
        }
        
        # Add request context
        if request_id := request_id_var.get():
            log_entry["request_id"] = request_id
        
        if user_id := user_id_var.get():
            log_entry["user_id"] = user_id
        
        # Add source location
        log_entry["source"] = {
            "file": record.filename,
            "line": record.lineno,
            "function": record.funcName,
        }
        
        # Add exception info
        if record.exc_info:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": traceback.format_exception(*record.exc_info),
            }
        
        # Add extra fields (extra_data is dynamically added via extra= parameter)
        if hasattr(record, "extra_data"):
            log_entry["extra"] = record.extra_data  # type: ignore[attr-defined]
        
        return json.dumps(log_entry, default=str)


class ColoredTextFormatter(logging.Formatter):
    """Colored text formatter for development."""
    
    COLORS = {
        "DEBUG": "\033[36m",    # Cyan
        "INFO": "\033[32m",     # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",    # Red
        "CRITICAL": "\033[35m", # Magenta
    }
    RESET = "\033[0m"
    
    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        
        # Format timestamp
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        
        # Build message
        parts = [
            f"{color}[{timestamp}]",
            f"[{record.levelname:8}]",
            f"[{record.name}]{self.RESET}",
            record.getMessage()
        ]
        
        # Add request ID if present
        if request_id := request_id_var.get():
            parts.insert(3, f"[{request_id[:8]}]")
        
        message = " ".join(parts)
        
        # Add exception
        if record.exc_info:
            message += "\n" + "".join(traceback.format_exception(*record.exc_info))
        
        return message


# ============== LOGGER SETUP ==============

def setup_logging():
    """Initialize the logging system."""
    
    # Create log directory
    os.makedirs(LOG_DIR, exist_ok=True)
    
    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, LOG_LEVEL))
    
    # Clear existing handlers
    root_logger.handlers = []
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)
    
    if LOG_FORMAT == "json" or ENVIRONMENT == "production":
        console_handler.setFormatter(JSONFormatter())
    else:
        console_handler.setFormatter(ColoredTextFormatter())
    
    root_logger.addHandler(console_handler)
    
    # File handlers (always JSON for parsing)
    
    # Main application log
    app_handler = logging.handlers.RotatingFileHandler(
        os.path.join(LOG_DIR, "app.log"),
        maxBytes=10_000_000,  # 10MB
        backupCount=10,
        encoding="utf-8"
    )
    app_handler.setLevel(logging.INFO)
    app_handler.setFormatter(JSONFormatter())
    root_logger.addHandler(app_handler)
    
    # Error log
    error_handler = logging.handlers.RotatingFileHandler(
        os.path.join(LOG_DIR, "error.log"),
        maxBytes=10_000_000,
        backupCount=10,
        encoding="utf-8"
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(JSONFormatter())
    root_logger.addHandler(error_handler)
    
    # Security log
    security_logger = logging.getLogger("security")
    security_handler = logging.handlers.RotatingFileHandler(
        os.path.join(LOG_DIR, "security.log"),
        maxBytes=10_000_000,
        backupCount=30,  # Keep more for audit
        encoding="utf-8"
    )
    security_handler.setLevel(logging.INFO)
    security_handler.setFormatter(JSONFormatter())
    security_logger.addHandler(security_handler)
    
    # Access log
    access_logger = logging.getLogger("access")
    access_handler = logging.handlers.TimedRotatingFileHandler(
        os.path.join(LOG_DIR, "access.log"),
        when="midnight",
        interval=1,
        backupCount=30,
        encoding="utf-8"
    )
    access_handler.setLevel(logging.INFO)
    access_handler.setFormatter(JSONFormatter())
    access_logger.addHandler(access_handler)
    
    # Performance log
    perf_logger = logging.getLogger("performance")
    perf_handler = logging.handlers.RotatingFileHandler(
        os.path.join(LOG_DIR, "performance.log"),
        maxBytes=10_000_000,
        backupCount=5,
        encoding="utf-8"
    )
    perf_handler.setLevel(logging.INFO)
    perf_handler.setFormatter(JSONFormatter())
    perf_logger.addHandler(perf_handler)
    
    logging.info("Logging system initialized", extra={"extra_data": {
        "log_level": LOG_LEVEL,
        "log_format": LOG_FORMAT,
        "log_dir": LOG_DIR,
        "environment": ENVIRONMENT
    }})


# ============== LOGGER FACTORY ==============

def get_logger(name: str) -> logging.Logger:
    """Get a named logger."""
    return logging.getLogger(name)


# ============== CONTEXT MANAGERS ==============

def set_request_context(request_id: Optional[str] = None, user_id: Optional[str] = None) -> None:
    """Set request context for logging."""
    if request_id:
        request_id_var.set(request_id)
    if user_id:
        user_id_var.set(user_id)


def clear_request_context():
    """Clear request context."""
    request_id_var.set("")
    user_id_var.set("")


def generate_request_id() -> str:
    """Generate unique request ID."""
    return str(uuid.uuid4())


# ============== SPECIALIZED LOGGERS ==============

class SecurityLogger:
    """Logger for security-related events."""
    
    def __init__(self):
        self.logger = logging.getLogger("security")
    
    def login_attempt(self, username: str, success: bool, ip: str, reason: Optional[str] = None) -> None:
        """Log login attempt."""
        self.logger.info("Login attempt", extra={"extra_data": {
            "event": "login_attempt",
            "username": username,
            "success": success,
            "ip_address": ip,
            "reason": reason
        }})
    
    def suspicious_activity(self, description: str, ip: str, **details: Any) -> None:
        """Log suspicious activity."""
        self.logger.warning("Suspicious activity detected", extra={"extra_data": {
            "event": "suspicious_activity",
            "description": description,
            "ip_address": ip,
            **details
        }})
    
    def access_denied(self, resource: str, user_id: str, reason: str):
        """Log access denial."""
        self.logger.warning("Access denied", extra={"extra_data": {
            "event": "access_denied",
            "resource": resource,
            "user_id": user_id,
            "reason": reason
        }})
    
    def data_export(self, user_id: str, export_type: str):
        """Log data export (GDPR)."""
        self.logger.info("Data exported", extra={"extra_data": {
            "event": "data_export",
            "user_id": user_id,
            "export_type": export_type
        }})


class AccessLogger:
    """Logger for HTTP access logs."""
    
    def __init__(self):
        self.logger = logging.getLogger("access")
    
    def log_request(
        self,
        method: str,
        path: str,
        status_code: int,
        duration_ms: float,
        ip: str,
        user_agent: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> None:
        """Log HTTP request."""
        self.logger.info(f"{method} {path} {status_code}", extra={"extra_data": {
            "method": method,
            "path": path,
            "status_code": status_code,
            "duration_ms": round(duration_ms, 2),
            "ip_address": ip,
            "user_agent": user_agent,
            "user_id": user_id
        }})


class PerformanceLogger:
    """Logger for performance metrics."""
    
    def __init__(self):
        self.logger = logging.getLogger("performance")
    
    def log_operation(
        self,
        operation: str,
        duration_ms: float,
        success: bool = True,
        **details: Any
    ) -> None:
        """Log operation performance."""
        self.logger.info(f"Operation: {operation}", extra={"extra_data": {
            "operation": operation,
            "duration_ms": round(duration_ms, 2),
            "success": success,
            **details
        }})
    
    def log_database_query(
        self,
        query_type: str,
        table: str,
        duration_ms: float,
        rows_affected: Optional[int] = None
    ) -> None:
        """Log database query performance."""
        self.logger.info(f"DB Query: {query_type} on {table}", extra={"extra_data": {
            "query_type": query_type,
            "table": table,
            "duration_ms": round(duration_ms, 2),
            "rows_affected": rows_affected
        }})


# ============== DECORATORS ==============

def log_function_call(logger: Optional[logging.Logger] = None) -> Callable[[F], F]:
    """Decorator to log function calls."""
    def decorator(func: F) -> F:
        nonlocal logger
        if logger is None:
            logger = logging.getLogger(func.__module__)
        
        # Assert logger is not None for type checker
        _logger = logger
        assert _logger is not None
        
        @wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            start = datetime.now(timezone.utc)
            try:
                result = await func(*args, **kwargs)
                duration = (datetime.now(timezone.utc) - start).total_seconds() * 1000
                _logger.debug(f"Function {func.__name__} completed", extra={"extra_data": {
                    "function": func.__name__,
                    "duration_ms": round(duration, 2),
                    "success": True
                }})
                return result
            except Exception as e:
                duration = (datetime.now(timezone.utc) - start).total_seconds() * 1000
                _logger.error(f"Function {func.__name__} failed", extra={"extra_data": {
                    "function": func.__name__,
                    "duration_ms": round(duration, 2),
                    "success": False,
                    "error": str(e)
                }})
                raise
        
        @wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            start = datetime.now(timezone.utc)
            try:
                result = func(*args, **kwargs)
                duration = (datetime.now(timezone.utc) - start).total_seconds() * 1000
                _logger.debug(f"Function {func.__name__} completed", extra={"extra_data": {
                    "function": func.__name__,
                    "duration_ms": round(duration, 2),
                    "success": True
                }})
                return result
            except Exception as e:
                duration = (datetime.now(timezone.utc) - start).total_seconds() * 1000
                _logger.error(f"Function {func.__name__} failed", extra={"extra_data": {
                    "function": func.__name__,
                    "duration_ms": round(duration, 2),
                    "success": False,
                    "error": str(e)
                }})
                raise
        
        if asyncio.iscoroutinefunction(func):
            return async_wrapper  # type: ignore[return-value]
        return sync_wrapper  # type: ignore[return-value]
    return decorator


# ============== SINGLETON INSTANCES ==============

security_logger = SecurityLogger()
access_logger = AccessLogger()
performance_logger = PerformanceLogger()


# Auto-initialize on import if not in test mode
if os.getenv("TESTING") != "true":
    setup_logging()
