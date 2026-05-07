"""
PATHMAP - Test Configuration
============================
Pytest fixtures and configuration for integration tests.
"""

import pytest
import asyncio
import os
import sys
from typing import Generator, AsyncGenerator

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session")
def test_config():
    """Test configuration."""
    return {
        "api_base_url": "http://localhost:8000",
        "ws_base_url": "ws://localhost:8000",
        "test_user_id": "test-user-123",
        "test_device_id": "test-device-456"
    }
