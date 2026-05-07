"""
PATHMAP V97 - Centralized Logging Middleware
============================================
Structured request/response logging for all API calls.
Provides observability and debugging capabilities.
"""

import time
import uuid
import logging
import json
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Configure structured logger
logger = logging.getLogger("PathMapAPI")

# Configure JSON formatter for production
class JSONFormatter(logging.Formatter):
    """JSON log formatter for structured logging."""
    
    def format(self, record):
        log_data = {
            'timestamp': self.formatTime(record),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }
        
        # Add extra fields
        if hasattr(record, 'request_id'):
            log_data['request_id'] = record.request_id
        if hasattr(record, 'method'):
            log_data['method'] = record.method
        if hasattr(record, 'path'):
            log_data['path'] = record.path
        if hasattr(record, 'status_code'):
            log_data['status_code'] = record.status_code
        if hasattr(record, 'duration_ms'):
            log_data['duration_ms'] = record.duration_ms
        if hasattr(record, 'client_ip'):
            log_data['client_ip'] = record.client_ip
        if hasattr(record, 'user_agent'):
            log_data['user_agent'] = record.user_agent
            
        return json.dumps(log_data)


# Paths to skip detailed logging (reduce noise)
SKIP_DETAILED_LOGGING = {
    '/health',
    '/v1/health',
    '/favicon.ico',
    '/api/v1/tunnel/heartbeat',
}


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Centralized logging middleware.
    
    Features:
    - Request/response logging
    - Request ID tracking
    - Duration measurement
    - Structured JSON output
    """
    
    def __init__(self, app, log_level: str = 'INFO'):
        super().__init__(app)
        self.log_level = getattr(logging, log_level.upper(), logging.INFO)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request with logging."""
        # Generate unique request ID
        request_id = str(uuid.uuid4())[:8]
        
        # Store request ID in state for access in routes
        request.state.request_id = request_id
        
        # Record start time
        start_time = time.perf_counter()
        
        # Extract request info
        method = request.method
        path = request.url.path
        query = str(request.url.query) if request.url.query else ''
        client_ip = request.client.host if request.client else 'unknown'
        user_agent = request.headers.get('User-Agent', 'unknown')[:100]
        
        # Skip detailed logging for health checks
        skip_detailed = any(path.startswith(skip) for skip in SKIP_DETAILED_LOGGING)
        
        # Log incoming request (if not skipped)
        if not skip_detailed:
            logger.info(
                f"[{request_id}] --> {method} {path}{'?' + query if query else ''}",
                extra={
                    'request_id': request_id,
                    'method': method,
                    'path': path,
                    'client_ip': client_ip,
                    'user_agent': user_agent
                }
            )
        
        # Process request
        response = None
        error = None
        try:
            response = await call_next(request)
        except Exception as e:
            error = e
            logger.error(
                f"[{request_id}] Request failed: {str(e)}",
                extra={
                    'request_id': request_id,
                    'method': method,
                    'path': path,
                    'error': str(e)
                },
                exc_info=True
            )
            raise
        
        # Calculate duration
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        
        # Add request ID to response headers
        if response:
            response.headers['X-Request-ID'] = request_id
            response.headers['X-Response-Time'] = f"{duration_ms}ms"
        
        # Log response (if not skipped)
        if not skip_detailed and response:
            status_code = response.status_code
            log_level = logging.INFO if status_code < 400 else logging.WARNING if status_code < 500 else logging.ERROR
            
            logger.log(
                log_level,
                f"[{request_id}] <-- {status_code} ({duration_ms}ms)",
                extra={
                    'request_id': request_id,
                    'method': method,
                    'path': path,
                    'status_code': status_code,
                    'duration_ms': duration_ms
                }
            )
        
        return response


def setup_logging(json_output: bool = False, level: str = 'INFO'):
    """
    Configure logging for the application.
    
    Args:
        json_output: Use JSON format (for production)
        level: Log level
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    
    # Clear existing handlers
    root_logger.handlers = []
    
    # Create handler
    handler = logging.StreamHandler()
    
    if json_output:
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            '%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        ))
    
    root_logger.addHandler(handler)
    
    # Set specific logger levels
    logging.getLogger('uvicorn').setLevel(logging.WARNING)
    logging.getLogger('uvicorn.access').setLevel(logging.WARNING)
