"""
PATHMAP - Pytest Configuration & Fixtures
==========================================
Shared test fixtures, mocks, and configuration.
"""

import pytest
import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from unittest.mock import MagicMock
import tempfile
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from httpx import AsyncClient


# ============== ASYNC EVENT LOOP ==============

@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# ============== DATABASE FIXTURES ==============

@pytest.fixture
def temp_db():
    """Create temporary SQLite database for testing."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    yield db_path
    # Cleanup
    try:
        os.unlink(db_path)
    except Exception:
        pass


@pytest.fixture
def mock_db():
    """Mock database connection."""
    mock = MagicMock()
    mock.execute.return_value = MagicMock()
    mock.fetchone.return_value = None
    mock.fetchall.return_value = []
    return mock


@pytest.fixture(autouse=True)
def isolate_stateful_singletons(tmp_path, monkeypatch):
    """Keep API tests hermetic.

    - Point the shared ``AuthCore`` singleton at a throwaway SQLite file so the
      register/login endpoints never read or write the real ``pathmap_users.db``.
    - Reset the rate-limiter singleton so per-client request counters from one
      test cannot trip limits in another.
    """
    import auth.auth_core as auth_core_mod
    import security.rate_limiter as rate_limiter_mod

    db_file = str(tmp_path / "test_users.db")
    monkeypatch.setattr(auth_core_mod, "_auth_core", auth_core_mod.AuthCore(db_path=db_file))
    monkeypatch.setattr(rate_limiter_mod, "_rate_limiter", None)
    yield


# ============== AUTH FIXTURES ==============

@pytest.fixture
def test_user():
    """Test user data."""
    return {
        "id": "test-user-123",
        "username": "testuser",
        "email": "test@pathmap.com",
        "password": "SecurePass123!",
        "display_name": "Test User"
    }


@pytest.fixture
def auth_token(test_user):
    """Generate test JWT token."""
    from auth.jwt_handler import get_jwt_handler
    jwt_handler = get_jwt_handler()
    token = jwt_handler.create_access_token(
        user_id=test_user["id"],
        username=test_user["username"]
    )
    return token


@pytest.fixture
def auth_headers(auth_token):
    """Authorization headers with test token."""
    return {"Authorization": f"Bearer {auth_token}"}


# ============== APP FIXTURES ==============

@asynccontextmanager
async def _offline_lifespan(_app):
    """A no-op replacement for the production lifespan.

    The real lifespan (main.lifespan) performs network I/O on startup: it
    validates and fetches map tiles from external CDNs (tile binding engine,
    tile diagnostics, tile heartbeat, tile proxy) and kicks off a background
    OSM graph load. Running that for every ``client`` fixture made the suite
    take ~5.5 minutes and require internet access (it fails/blocks in offline
    CI).

    For tests we skip all of it. The graph-dependent routing endpoints simply
    return 503 ("graph not loaded"), which the routing integration tests are
    written to tolerate; every other tested endpoint (auth, tunnel, tracking)
    uses lazily-created singletons that do not depend on the lifespan.
    """
    yield


@pytest.fixture
def app():
    """Create FastAPI app instance for testing (with the network-free lifespan)."""
    # Import here to avoid circular imports
    from main import app as fastapi_app
    # Swap the production lifespan for a no-op so TestClient starts instantly
    # and performs no network calls. TestClient still establishes its portal
    # via the (now trivial) lifespan context.
    fastapi_app.router.lifespan_context = _offline_lifespan
    return fastapi_app


@pytest.fixture
def client(app):
    """Synchronous test client (offline, no lifespan network I/O)."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
async def async_client(app) -> AsyncGenerator:
    """Asynchronous test client."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


# ============== LOCATION FIXTURES ==============

@pytest.fixture
def sample_location():
    """Sample GPS location."""
    return {
        "lat": 9.0820,
        "lng": 7.4900,
        "accuracy": 10.0,
        "altitude": 450.0,
        "speed": 1.5,
        "heading": 90.0,
        "source": "gps"
    }


@pytest.fixture
def sample_route_request():
    """Sample route calculation request."""
    return {
        "start": [9.0820, 7.4900],
        "end": [9.0850, 7.4950],
        "algo": "ShadowPath",
        "profile": "walking"
    }


# ============== DEVICE FIXTURES ==============

@pytest.fixture
def sample_device():
    """Sample device data."""
    return {
        "id": "device-123",
        "name": "Test iPhone",
        "type": "phone",
        "platform": "iOS",
        "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"
    }


# ============== GEOFENCE FIXTURES ==============

@pytest.fixture
def sample_geofence():
    """Sample geofence data."""
    return {
        "id": "geofence-123",
        "name": "Home",
        "lat": 9.0820,
        "lng": 7.4900,
        "radius": 100,
        "type": "home",
        "notify_on_enter": True,
        "notify_on_exit": True,
        "active": True
    }


# ============== MOCK FIXTURES ==============

@pytest.fixture
def mock_gps():
    """Mock GPS provider."""
    mock = MagicMock()
    mock.get_position.return_value = {
        "lat": 9.0820,
        "lng": 7.4900,
        "accuracy": 5.0
    }
    return mock


@pytest.fixture
def mock_graph():
    """Mock OSM graph (osmnx-style MultiDiGraph so the pathfinders work on it)."""
    import networkx as nx
    G = nx.MultiDiGraph()
    G.graph["crs"] = "epsg:4326"
    # Add test nodes (y=lat, x=lon)
    G.add_node(1, y=9.0820, x=7.4900)
    G.add_node(2, y=9.0830, x=7.4910)
    G.add_node(3, y=9.0840, x=7.4920)
    G.add_node(4, y=9.0850, x=7.4950)
    # Add test edges (both directions, like a drivable OSM graph)
    for u, v, length, name in [(1, 2, 100, "Test Road 1"),
                               (2, 3, 100, "Test Road 2"),
                               (3, 4, 150, "Test Road 3")]:
        G.add_edge(u, v, length=length, name=name)
        G.add_edge(v, u, length=length, name=name)
    return G


@pytest.fixture
def mock_graph_coords():
    """Node id -> (lat, lon) for the mock graph above."""
    return {1: (9.0820, 7.4900), 2: (9.0830, 7.4910),
            3: (9.0840, 7.4920), 4: (9.0850, 7.4950)}


# ============== CLEANUP ==============

@pytest.fixture(autouse=True)
def cleanup():
    """Auto cleanup after each test."""
    yield
    # Any cleanup code here


# ============== MARKERS ==============

def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "slow: marks tests as slow")
    config.addinivalue_line("markers", "integration: marks integration tests")
    config.addinivalue_line("markers", "unit: marks unit tests")
    config.addinivalue_line("markers", "e2e: marks end-to-end tests")
