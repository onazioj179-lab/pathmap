"""
PATHMAP - Prometheus Metrics API
=================================
Expose /metrics endpoint for Prometheus scraping.
"""

from fastapi import APIRouter
from prometheus_fastapi_instrumentator import Instrumentator

router = APIRouter(prefix="/metrics", tags=["observability"])

# Create instrumentator instance
instrumentator = Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=False,
    should_respect_env_var=True,
    should_instrument_requests_inprogress=True,
    excluded_handlers=["/metrics", "/health", "/v1/health"],
    env_var_name="ENABLE_METRICS",
    inprogress_name="pathmap_requests_inprogress",
    inprogress_labels=True,
)


def init_metrics(app):
    """Initialize Prometheus metrics instrumentation."""
    instrumentator.instrument(app).expose(app, include_in_schema=False, endpoint="/metrics")
    return instrumentator
