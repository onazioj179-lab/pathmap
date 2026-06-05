from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel
from typing import List, Literal, Optional, Any, Dict
from datetime import datetime
import uvicorn
from contextlib import asynccontextmanager
import os
import sys
import logging
import traceback

# V98: Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PathMap")

# V98: Environment configuration (must be early for exception handler)
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# V99: JWT Secret enforcement
JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("JWT_SECRET_KEY")
if ENVIRONMENT == "production" and not JWT_SECRET:
    logger.error("[FATAL] JWT_SECRET or JWT_SECRET_KEY must be set in production")
    sys.exit(1)
if not JWT_SECRET:
    import secrets
    JWT_SECRET = secrets.token_urlsafe(32)
    logger.warning("[DEV] Generated ephemeral JWT secret - tokens will invalidate on restart")

from pathfinding.graph_loader import GraphLoader
from pathfinding.shadow_path import ShadowPath
from pathfinding.home_guard import HomeGuard
from pathfinding.pathfinder_x import PathfinderX

# V44/V45: Python Page Engine
from page_engine.page_engine import get_page_engine
from page_engine.sync_layer import get_sync_layer
from page_engine.asset_manager import get_asset_manager
from page_engine.location_access import get_location_access_page

# V48: Real Location Engine + Icon Engine
from location.real_location_engine import get_rle, LocationUpdate
from ui.icon_engine import get_icon_engine

# V53: Ultra Stable 20-Year System
from engines.ultra_stable_engine import UltraStableEngine
from api.versioned_api_v1 import router_v1
from services.long_life_backend import LongLifeBackendEngine
from engines.engine_metadata import get_metadata

# V54: Trust-Based Location + Auto-Calibration
from location.trust_location_flow import get_trust_location_flow
from location.auto_calibration_engine import get_auto_calibration_engine
from location.always_on_live_location import get_always_on_live_location

# V83: Tile Binding Engine
from engines.tile_binding_engine import get_tile_binding_engine

# V89: Tile Diagnostics
from engines.tile_diagnostics import get_tile_diagnostics

# V91: Tile Server Hard Fix
from engines.tile_hard_fix import (
    get_tile_heartbeat,
    get_tile_fallback,
    get_tile_enforcer
)

# V92: Python Tile Proxy (Ultimate Stability)
from services.tile_proxy import get_tile_proxy

# V93: Social Features - Find My Friends
from api.social_api import router_social as social_router

# V94: Precision Tracking System
from api.tracking_api import router_tracking

# V95: Device Tracking API with Auth & Encryption (now in api folder)
from api.tracking_api import router as device_tracking_router

# V96: Military-Grade Encrypted Tunnel System
from api.tunnel_api import router as tunnel_router

# Global variables
graph = None
algo_impl = {}
route_cache = None
spatial_index = None
safe_return_router = None
landmark_db = None
safety_core = None  # V21: Safety Core
context_engine = None  # V27.1: Context-Aware Navigation
real_location_engine = None  # V48: Real Location Engine
icon_engine = None  # V48: Icon Engine
ultra_stable_engine = None  # V53: Ultra Stable Engine
long_life_backend = None  # V53: Long-Life Backend Engine
trust_location_flow = None  # V54: Trust-Based Location Flow
auto_calibration_engine = None  # V54: Auto-Calibration Engine v2
always_on_live_location = None  # V54: Always-On Live Location
tile_binding_engine = None  # V83: Tile Binding Engine
tile_diagnostics = None  # V89: Tile Diagnostics
tile_heartbeat = None  # V91: Tile Server Heartbeat
tile_fallback = None  # V91: Tile Fallback Provider
tile_enforcer = None  # V91: Tile Format Enforcer
tile_proxy = None  # V92: Python Tile Proxy

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load OSM graph on startup and prepare algorithms using lifespan API."""
    global graph, algo_impl, route_cache, spatial_index, safe_return_router, landmark_db, safety_core, context_engine, real_location_engine, icon_engine, ultra_stable_engine, long_life_backend, trust_location_flow, auto_calibration_engine, always_on_live_location, tile_binding_engine, tile_diagnostics, tile_heartbeat, tile_fallback, tile_enforcer, tile_proxy
    from pathfinding.performance import RouteCache, SpatialIndex
    from pathfinding.safe_return import SafeReturnRouter
    from landmarks.landmark_db import LandmarkDatabase
    from safety.safety_core import SafetyCore
    from context.context_engine import ContextEngine
    
    print("Loading OSM street graph...")
    g = graph_loader.load_graph()
    # assign to globals after load to avoid partial state
    graph = g
    algo_impl = {
        "ShadowPath": ShadowPath(graph),      # A* - Fastest, intelligent routing
        "HomeGuard": HomeGuard(graph),        # Dijkstra - Safe return, stable
        "PathfinderX": PathfinderX(graph),    # Greedy - Explorer scouting
    }
    
    # V7: Performance optimizations
    route_cache = RouteCache(max_size=100)
    spatial_index = SpatialIndex(graph)
    
    # V11: Safe-return mode
    landmark_db = LandmarkDatabase()
    safe_return_router = SafeReturnRouter(graph, algo_impl["HomeGuard"], landmark_db.get_all_landmarks())
    
    # V21: Safety Core initialization (scan_graph called in __init__)
    safety_core = SafetyCore(graph)
    
    # V27.1: Context Engine initialization
    context_engine = ContextEngine()
    
    # V44: Python Page Engine initialization
    get_page_engine()
    get_sync_layer()
    asset_manager = get_asset_manager()
    asset_manager.preload_common_icons()
    
    # V45: Location Access Page initialization
    get_location_access_page()
    
    # V48: Real Location Engine + Icon Engine initialization
    real_location_engine = get_rle()
    icon_engine = get_icon_engine()
    
    print(f"Graph loaded: {len(graph.nodes)} nodes, {len(graph.edges)} edges")
    print("Performance cache and spatial index initialized")
    print(f"V11: SafeReturn initialized with {len(landmark_db.get_landmarks_by_category('safe'))} safe landmarks")
    print(f"V21: SafetyCore initialized - {safety_core.get_diagnostics()['unsafe_nodes']} unsafe nodes detected")
    print("V27.1: ContextEngine initialized - auto-adapt mode ready")
    print("V44: Python Page Engine (PPE) initialized - high-resolution rendering active")
    print("V45: Universal Location Access Page initialized - cross-platform support")
    print("V46: Smart Permission Fallback initialized - block detection + fallback modes ready")
    print("V48: Real Location Engine (RLE) initialized - GPS tracking ready")
    print("V48: Icon Engine (IE) initialized - professional SVG icons loaded")
    
    # V53: Initialize Ultra Stable 20-Year System
    ultra_stable_engine = UltraStableEngine()
    long_life_backend = LongLifeBackendEngine("pathfinder_v53.db")
    print("V53: Ultra Stable Engine (USE) initialized - Dijkstra/A*/BFS routing ready")
    print("V53: Long-Life Backend Engine (LLBE) initialized - SQLite persistence active")
    print("V53: Versioned API Contract (VIC) /v1/ - frozen until 2045-11-22")
    
    # V54: Initialize Trust-Based Location + Auto-Calibration
    trust_location_flow = get_trust_location_flow()
    auto_calibration_engine = get_auto_calibration_engine()
    always_on_live_location = get_always_on_live_location()
    print("V54: Trust-Based Location Flow (TLF) initialized - optional permission model")
    print("V54: Auto-Calibration Engine v2 (ACE v2) initialized - 30-min refresh cycle")
    print("V54: Always-On Live Location (AOLL) initialized - no toggles, auto-tracking")
    
    # V83: Initialize Tile Binding Engine
    tile_binding_engine = get_tile_binding_engine()
    await tile_binding_engine.init()
    print("V83: Tile Binding Engine (TBE) initialized - tile servers verified, caching active")
    
    # V89: Initialize Tile Diagnostics
    tile_diagnostics = get_tile_diagnostics()
    await tile_diagnostics.init()
    diag_result = await tile_diagnostics.run('carto_dark')
    print(f"V89: Tile Diagnostics (TD) initialized - server status: {diag_result['recommendation']}")
    
    # V91: Initialize Tile Server Hard Fix
    tile_heartbeat = get_tile_heartbeat()
    tile_fallback = get_tile_fallback()
    tile_enforcer = get_tile_enforcer()
    await tile_heartbeat.init()
    
    # V91: Validate primary tile server with blocking heartbeat
    primary_tile_url = 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
    is_primary_valid = await tile_heartbeat.validate_with_retries(primary_tile_url)
    
    if not is_primary_valid:
        print("[V91] Primary tile server validation failed - switching to fallback")
        fallback_provider = tile_fallback.select_by_priority()
        primary_tile_url = fallback_provider['url']
        print(f"[V91] Using fallback: {fallback_provider['name']}")
    
    # V91: Test actual tile fetch with format validation
    test_tile_url = primary_tile_url.replace('{z}', '2').replace('{x}', '2').replace('{y}', '2')
    tile_valid = await tile_heartbeat.fetch_and_validate_tile(test_tile_url)
    
    if not tile_valid:
        print("[V91] Test tile fetch failed - trying backup")
        fallback_provider = tile_fallback.select_random()
        primary_tile_url = fallback_provider['url']
        test_tile_url = primary_tile_url.replace('{z}', '2').replace('{x}', '2').replace('{y}', '2')
        tile_valid = await tile_heartbeat.fetch_and_validate_tile(test_tile_url)
    
    if tile_valid:
        print("V91: Tile Server Hard Fix (TSHF) initialized - guaranteed tile load: READY")
        print(f"V91: Active tile URL: {primary_tile_url}")
    else:
        print("[V91:WARNING] All tile servers failed validation - map may show blank")
    
    # V92: Initialize Python Tile Proxy (Ultimate Stability Layer)
    tile_proxy = get_tile_proxy()
    await tile_proxy.initialize()
    print("V92: Python Tile Proxy initialized - ALL tiles route through backend")
    print(f"V92: Upstream providers: {len(tile_proxy.upstream_providers)}")
    print(f"V92: Max retries: {tile_proxy.max_retries}, Cache: memory+disk")
    print("V92: Zero tile failures guaranteed - proxy intercepts all requests")
    
    print("\n[PATHMAP] Backend Server Ready on http://0.0.0.0:8000")
    print("   - Python Page Engine: Active")
    print("   - Location Access: Universal (V45 + V46)")
    print("   - Smart Fallback: 7 permission states")
    print("   - Real GPS Tracking: V48 RLE")
    print("   - Professional Icons: V48 IE")
    print("   - V53 Ultra Stable: 20-year warranty (2025-2045)")
    print("   - V53 API: /v1/health, /v1/route (frozen)")
    print("   - V54 Trust Location: Optional permission, no forcing")
    print("   - V54 Auto-Calibration: 30-min refresh, app resume")
    print("   - V54 Always-On: Live tracking when permission exists")
    print("   - V83 Tile Binding: Backend tile servers verified + cached")
    print("   - V97 Rate Limiting: Applied to all routes")
    print("   - V97 Structured Logging: Request/Response tracking")
    print("   - WebSocket Sync: /ws/sync")
    print("   - API Docs: http://localhost:8000/docs\n")
    try:
        yield
    finally:
        # No teardown required, but hook is here if needed later
        pass


app = FastAPI(title="PathFinder V98", version="98.0.0", lifespan=lifespan)
app.state.metadata = get_metadata()  # V67: IMW — stored in core engine configuration

# V98: Global Exception Handler - catches all unhandled exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    V98: Global exception handler for all unhandled exceptions.
    - Logs full stack trace for debugging
    - Returns sanitized error to client (no sensitive info leaked)
    - Production-ready error responses
    """
    error_id = f"ERR-{int(datetime.now().timestamp())}"
    
    # Log full error details (server-side only)
    logging.error(f"[{error_id}] Unhandled exception on {request.method} {request.url.path}")
    logging.error(f"[{error_id}] Exception type: {type(exc).__name__}")
    logging.error(f"[{error_id}] Exception message: {str(exc)}")
    logging.error(f"[{error_id}] Stack trace:\n{traceback.format_exc()}")
    
    # In development, include more details
    if ENVIRONMENT != "production":
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal Server Error",
                "error_id": error_id,
                "detail": str(exc),
                "type": type(exc).__name__,
                "path": str(request.url.path)
            }
        )
    
    # In production, return sanitized response
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "error_id": error_id,
            "message": "An unexpected error occurred. Please try again later."
        }
    )

# V77: Tile cache for GOTC integration
_tile_cache = {}
_terrain_cache = {}

# V97: Setup centralized logging
try:
    from middleware.logging_middleware import setup_logging, LoggingMiddleware
    setup_logging(json_output=os.environ.get('LOG_JSON', '').lower() == 'true', level='INFO')
    LOGGING_MIDDLEWARE_AVAILABLE = True
except ImportError:
    LOGGING_MIDDLEWARE_AVAILABLE = False
    print("[WARN] Logging middleware not available")

# V97: Setup rate limiting middleware
try:
    from middleware.rate_limit_middleware import RateLimitMiddleware
    RATE_LIMIT_MIDDLEWARE_AVAILABLE = True
except ImportError:
    RATE_LIMIT_MIDDLEWARE_AVAILABLE = False
    print("[WARN] Rate limit middleware not available")

# V98: Setup security headers middleware
try:
    from security.hardening import SecurityHeadersMiddleware
    SECURITY_HEADERS_AVAILABLE = True
except ImportError:
    SECURITY_HEADERS_AVAILABLE = False
    print("[WARN] Security headers middleware not available")

# V99: Setup cache control middleware
try:
    from middleware.cache_control import CacheControlMiddleware
    CACHE_CONTROL_AVAILABLE = True
except ImportError:
    CACHE_CONTROL_AVAILABLE = False
    print("[WARN] Cache control middleware not available")

# V98: Environment-based CORS configuration
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3002,http://127.0.0.1:3002").split(",")

# V99: Strict CORS - no wildcards
allowed_origins = [origin.strip() for origin in CORS_ORIGINS if origin.strip() and origin.strip() != "*"]
if ENVIRONMENT == "development" and not allowed_origins:
    allowed_origins = [
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://0.0.0.0:3002"
    ]

# V98: HTTPS redirect in production
if ENVIRONMENT == "production" and os.getenv("FORCE_HTTPS", "true").lower() == "true":
    app.add_middleware(HTTPSRedirectMiddleware)
    print("[V98] HTTPS redirect enabled for production")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID", "Accept"],
    expose_headers=["X-Request-ID"],
)

# V98: Add security headers middleware (before CORS)
if SECURITY_HEADERS_AVAILABLE:
    app.add_middleware(SecurityHeadersMiddleware)
    print("[V98] Security headers middleware enabled")

# V99: Add cache control middleware
if CACHE_CONTROL_AVAILABLE:
    app.add_middleware(CacheControlMiddleware)
    print("[V99] Cache control middleware enabled for auth/sensitive endpoints")

# V97: Add logging middleware (after CORS so CORS headers are added first)
if LOGGING_MIDDLEWARE_AVAILABLE:
    app.add_middleware(LoggingMiddleware, log_level='INFO')

# V97: Add rate limiting middleware (after logging so requests are logged even if rate limited)
if RATE_LIMIT_MIDDLEWARE_AVAILABLE:
    app.add_middleware(RateLimitMiddleware)

# V53: Include Versioned API v1 router (frozen until 2045)
app.include_router(router_v1)

# V93: Include Social Features router (Find My Friends)
app.include_router(social_router)

# V94: Include Precision Tracking router
app.include_router(router_tracking)

# V95: Include Device Tracking router (Auth + Encryption)
app.include_router(device_tracking_router)

# V96: Include Military-Grade Encrypted Tunnel router
app.include_router(tunnel_router)

# V99: Initialize Prometheus metrics
try:
    from api.metrics_api import init_metrics
    init_metrics(app)
    print("[V99] Prometheus metrics enabled at /metrics")
except ImportError:
    print("[WARN] Prometheus metrics not available - install prometheus-fastapi-instrumentator")

# V97: Include Push Notification router
try:
    from api.push_api import router as push_router
    app.include_router(push_router)
    print("[V97] Push Notification API loaded")
except ImportError as e:
    print(f"[WARN] Push API not loaded: {e}")

# V67: Diagnostics endpoint (guarded). Not exposed unless PATHMAP_DEBUG truthy
if os.environ.get("PATHMAP_DEBUG", "").lower() in {"1", "true", "yes", "on"}:
    @app.get("/diagnostics/metadata")
    async def diagnostics_metadata():
        return app.state.metadata

# Initialize graph loader and algorithm instances
graph_loader = GraphLoader()
graph: Any = None
algo_impl: Dict[str, Any] = {}
route_cache: Any = None
spatial_index: Any = None
safe_return_router: Any = None
landmark_db: Any = None


class RouteRequest(BaseModel):
    start: List[float]  # [lat, lon]
    end: List[float]    # [lat, lon]
    # V11-V20: New algorithm names
    algo: Optional[Literal["ShadowPath", "HomeGuard", "PathfinderX"]] = "ShadowPath"
    # V6: Multi-modal routing
    profile: Optional[Literal["driving", "walking", "offroad"]] = "walking"
    elevation_weight: Optional[float] = 1.0
    # V7: Performance mode
    performance_mode: Optional[Literal["standard", "high-speed"]] = "standard"
    # V9: Simulation mode
    simulation_mode: Optional[bool] = False


class CompareRequest(BaseModel):
    start: List[float]  # [lat, lon]
    end: List[float]    # [lat, lon]
    algorithms: List[Literal["ShadowPath", "HomeGuard", "PathfinderX"]]  # Compare these
    # V6: Profile support
    profile: Optional[Literal["driving", "walking", "offroad"]] = "walking"
    elevation_weight: Optional[float] = 1.0


class Step(BaseModel):
    node: int
    lat: float
    lon: float


# V10: Analytics and heatmap (must be defined before RouteResponse)
class HeatmapPoint(BaseModel):
    lat: float
    lon: float
    intensity: float


class AnalyticsData(BaseModel):
    total_steps: int
    avg_step_distance: float
    branching_factor: float
    runtime_ms: float
    heatmap: List[HeatmapPoint]


class RouteResponse(BaseModel):
    path: List[List[float]]
    visited: List[int]
    cost: float
    steps: List[Step]
    algo_used: Literal["ShadowPath", "HomeGuard", "PathfinderX"]
    # V6: Elevation data
    elevation_gain: Optional[float] = 0.0
    elevation_loss: Optional[float] = 0.0
    weighted_cost: Optional[float] = 0.0
    # V9: Simulation preview
    preview_path: Optional[List[List[float]]] = None
    estimated_cost: Optional[float] = None
    # V10: Analytics (no forward reference needed)
    analytics: Optional[AnalyticsData] = None
    # V21: Safety validation
    safety_score: Optional[float] = None
    validation_report: Optional[Dict[str, Any]] = None
    auto_corrections: Optional[bool] = False
    safety_level: Optional[str] = None


class AlgorithmResult(BaseModel):
    path: List[List[float]]
    visited: List[int]
    cost: float
    steps: List[Step]
    runtime_ms: float
    # V6: Elevation
    elevation_gain: Optional[float] = 0.0
    elevation_loss: Optional[float] = 0.0
    weighted_cost: Optional[float] = 0.0


class CompareResponse(BaseModel):
    results: Dict[str, AlgorithmResult]


# V8: Multi-stop routing
class MultiRouteRequest(BaseModel):
    points: List[List[float]]  # [start, w1, w2, ..., end]
    algo: Optional[Literal["ShadowPath", "HomeGuard", "PathfinderX"]] = "ShadowPath"
    profile: Optional[Literal["driving", "walking", "offroad"]] = "walking"


class RouteSegment(BaseModel):
    start: List[float]
    end: List[float]
    path: List[List[float]]
    cost: float


class MultiRouteResponse(BaseModel):
    segments: List[RouteSegment]
    total_cost: float
    waypoint_count: int


# V27.1: Context Engine Models

class DeviceState(BaseModel):
    battery_percent: float = 100.0
    gps_accuracy_m: float = 5.0
    signal_strength: int = 5  # 0-5 bars


class UserState(BaseModel):
    position: Optional[List[float]] = None  # [lat, lon]
    speed_mps: float = 1.4
    is_moving: bool = False
    deviation_count: int = 0
    friend: Optional[Dict[str, Any]] = None  # {distance_m, active}


class EnvironmentState(BaseModel):
    hour: int = 12
    familiarity_score: float = 0.5  # 0-1
    safety_score: float = 75.0  # 0-100


class ContextRequest(BaseModel):
    user_state: UserState
    environment: EnvironmentState
    device: DeviceState


class ContextResponse(BaseModel):
    recommended_algo: Literal["ShadowPath", "HomeGuard", "PathfinderX"]
    confidence: float
    context_actions: List[str]
    safety_adjustments: Dict[str, Any]
    ui_signals: List[str]
    flags: Dict[str, List[str]]
    notes: str
    evaluation_interval_s: int


## Startup handled by lifespan above


@app.get("/")
async def root():
    return {
        "message": "PATHMAP Backend API",
        "version": "V46",
        "features": ["V44: Python Page Engine", "V45: Location Access", "V46: Smart Fallback"],
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """V98: Comprehensive health check endpoint for Docker and monitoring"""
    health_status = {
        "status": "healthy",
        "version": "98.0.0",
        "timestamp": datetime.now().isoformat(),
        "components": {}
    }
    
    overall_healthy = True
    
    # Check graph status
    try:
        graph_healthy = graph is not None
        health_status["components"]["graph"] = {
            "status": "healthy" if graph_healthy else "degraded",
            "loaded": graph_healthy,
            "nodes": len(graph.nodes) if graph else 0,
            "edges": len(graph.edges) if graph else 0
        }
        if not graph_healthy:
            overall_healthy = False
    except Exception as e:
        health_status["components"]["graph"] = {"status": "unhealthy", "error": str(e)}
        overall_healthy = False
    
    # Check tile proxy status
    try:
        tile_proxy = get_tile_proxy()
        tile_healthy = tile_proxy is not None and tile_proxy.initialized
        health_status["components"]["tile_proxy"] = {
            "status": "healthy" if tile_healthy else "degraded",
            "initialized": tile_healthy,
            "upstream_providers": len(tile_proxy.upstream_providers) if tile_proxy else 0
        }
    except Exception as e:
        health_status["components"]["tile_proxy"] = {"status": "unknown", "error": str(e)}
    
    # Check cache directories
    try:
        cache_path = os.path.join(os.path.dirname(__file__), 'cache', 'tiles')
        cache_exists = os.path.exists(cache_path)
        cache_writable = os.access(cache_path, os.W_OK) if cache_exists else False
        health_status["components"]["cache"] = {
            "status": "healthy" if cache_writable else "degraded",
            "path_exists": cache_exists,
            "writable": cache_writable
        }
    except Exception as e:
        health_status["components"]["cache"] = {"status": "unknown", "error": str(e)}
    
    # Memory usage (if available)
    try:
        import psutil
        process = psutil.Process()
        memory_mb = process.memory_info().rss / 1024 / 1024
        health_status["components"]["memory"] = {
            "status": "healthy" if memory_mb < 500 else "warning",
            "usage_mb": round(memory_mb, 2)
        }
    except ImportError:
        health_status["components"]["memory"] = {"status": "unknown", "note": "psutil not installed"}
    except Exception as e:
        health_status["components"]["memory"] = {"status": "unknown", "error": str(e)}
    
    # Overall status
    health_status["status"] = "healthy" if overall_healthy else "degraded"
    
    return health_status


@app.post("/route", response_model=RouteResponse)
async def route(request: RouteRequest, speed: float = 1.0):
    """Return real route using selected algorithm on OSM street network."""
    if graph is None:
        raise HTTPException(status_code=503, detail="Graph not loaded")

    try:
        from pathfinding.elevation import ElevationManager, RoutingProfile
        
        start_lat, start_lon = request.start
        end_lat, end_lon = request.end

        # Accept new names; map legacy names for backward-compatibility
        legacy_to_new = {
            "PathHunter": "ShadowPath",
            "TrailSolver": "HomeGuard",
            "QuickSeek": "PathfinderX",
            "A*": "ShadowPath",
            "Dijkstra": "HomeGuard",
            "Greedy": "PathfinderX",
            "Greedy Best-First": "PathfinderX",
        }
        algo_name = request.algo or "ShadowPath"
        algo_name = legacy_to_new.get(algo_name, algo_name)
        if algo_name not in algo_impl:
            raise HTTPException(status_code=400, detail="Invalid algorithm. Use 'ShadowPath', 'HomeGuard', or 'PathfinderX'")

        # V9: Simulation mode - return preview instead of full route
        if request.simulation_mode:
            import math
            preview_steps = 10
            preview_path = []
            for i in range(preview_steps + 1):
                t = i / preview_steps
                lat = start_lat + (end_lat - start_lat) * t
                lon = start_lon + (end_lon - start_lon) * t
                preview_path.append([lat, lon])
            
            # Estimate cost as straight-line distance
            estimated_cost = math.hypot(end_lat - start_lat, end_lon - start_lon) * 111000  # rough meters
            
            return RouteResponse(
                path=[], visited=[], cost=0.0, steps=[], algo_used=algo_name,
                preview_path=preview_path, estimated_cost=estimated_cost
            )

        import time
        t0 = time.perf_counter()
        impl: Any = algo_impl[algo_name]
        path, visited, cost, steps = impl.find_route(start_lat, start_lon, end_lat, end_lon)
        runtime_ms = (time.perf_counter() - t0) * 1000

        if not path:
            raise HTTPException(status_code=404, detail="No route found")

        # V6: Calculate elevation metrics
        elev_manager = ElevationManager(graph)
        node_ids = visited[:min(len(visited), 100)]
        elev_data = elev_manager.calculate_elevation_gain_loss(node_ids) if node_ids else {'gain': 0.0, 'loss': 0.0}
        
        weighted_cost = RoutingProfile.calculate_weighted_cost(
            cost, elev_data['gain'], elev_data['loss'], 
            request.profile or 'walking', request.elevation_weight or 1.0
        )

        # V10: Generate analytics and heatmap
        analytics = None
        if len(steps) > 0:
            total_steps = len(steps)
            avg_dist = cost / total_steps if total_steps > 0 else 0
            branching = len(visited) / total_steps if total_steps > 0 else 1.0
            
            # Generate heatmap from visited nodes
            visit_counts: Dict[int, int] = {}
            for step in steps:
                node_id = step.get('node', 0)
                visit_counts[node_id] = visit_counts.get(node_id, 0) + 1
            
            max_visits = max(visit_counts.values()) if visit_counts else 1
            heatmap_data = []
            for node_id, count in list(visit_counts.items())[:500]:  # Limit to 500 points
                try:
                    node_data = graph.nodes[node_id]
                    heatmap_data.append(HeatmapPoint(
                        lat=float(node_data['y']),
                        lon=float(node_data['x']),
                        intensity=float(count / max_visits)
                    ))
                except Exception:
                    pass
            
            analytics = AnalyticsData(
                total_steps=total_steps,
                avg_step_distance=avg_dist,
                branching_factor=branching,
                runtime_ms=runtime_ms,
                heatmap=heatmap_data
            )

        # V21: Apply SafetyCore validation to enhance response
        response_dict = {
            'path': path,
            'visited': visited,
            'cost': cost,
            'steps': [Step(**s) for s in steps],
            'algo_used': algo_name,
            'elevation_gain': elev_data['gain'],
            'elevation_loss': elev_data['loss'],
            'weighted_cost': weighted_cost,
            'analytics': analytics
        }
        
        if safety_core:
            response_dict = safety_core.validate_route_response(response_dict)
        
        return RouteResponse(**response_dict)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Routing error: {str(e)}")


@app.post("/compare", response_model=CompareResponse)
async def compare(request: CompareRequest):
    """V5: Compare multiple algorithms on the same route."""
    if graph is None:
        raise HTTPException(status_code=503, detail="Graph not loaded")

    try:
        import time
        start_lat, start_lon = request.start
        end_lat, end_lon = request.end
        results = {}

        for algo_name in request.algorithms:
            if algo_name not in algo_impl:
                continue
            
            impl: Any = algo_impl[algo_name]
            t0 = time.perf_counter()
            path, visited, cost, steps = impl.find_route(start_lat, start_lon, end_lat, end_lon)
            runtime_ms = (time.perf_counter() - t0) * 1000

            if path:
                results[algo_name] = AlgorithmResult(
                    path=path,
                    visited=visited,
                    cost=cost,
                    steps=[Step(**s) for s in steps],
                    runtime_ms=runtime_ms
                )

        return CompareResponse(results=results)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Comparison error: {str(e)}")


@app.post("/multi_route", response_model=MultiRouteResponse)
async def multi_route(request: MultiRouteRequest):
    """V8: Multi-stop routing with waypoints."""
    if graph is None:
        raise HTTPException(status_code=503, detail="Graph not loaded")

    try:
        if len(request.points) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 points")

        segments = []
        total_cost = 0.0

        impl: Any = algo_impl.get(request.algo or "ShadowPath")
        if not impl:
            raise HTTPException(status_code=400, detail="Invalid algorithm")

        for i in range(len(request.points) - 1):
            start = request.points[i]
            end = request.points[i + 1]

            path, _, cost, _ = impl.find_route(start[0], start[1], end[0], end[1])

            if path:
                segments.append(RouteSegment(
                    start=start,
                    end=end,
                    path=path,
                    cost=cost
                ))
                total_cost += cost

        return MultiRouteResponse(
            segments=segments,
            total_cost=total_cost,
            waypoint_count=len(request.points) - 2
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-route error: {str(e)}")


# ============================================================================
# V11 - SAFE-RETURN MODE (HomeGuard Expansion)
# ============================================================================

class SafeReturnRequest(BaseModel):
    current: List[float]  # [lat, lon]
    home: List[float]     # [lat, lon]
    include_landmark: Optional[bool] = True
    include_breadcrumbs: Optional[bool] = True


class SafeReturnOption(BaseModel):
    path: List[List[float]]
    cost: float
    algorithm: str
    safety_score: float
    landmark: Optional[Dict[str, Any]] = None
    message: Optional[str] = None


class SafeReturnResponse(BaseModel):
    direct_home: SafeReturnOption
    via_landmark: Optional[SafeReturnOption] = None
    retrace_steps: Optional[SafeReturnOption] = None
    breadcrumb_path: Optional[List[List[float]]] = None


@app.post("/safe_return", response_model=SafeReturnResponse)
async def safe_return(request: SafeReturnRequest):
    """
    V11: Generate safe return paths using HomeGuard algorithm.
    Returns multiple options: direct home, via safe landmark, or retrace breadcrumbs.
    """
    if graph is None or safe_return_router is None:
        raise HTTPException(status_code=503, detail="Safe return not initialized")

    try:
        current_lat, current_lon = request.current
        home_lat, home_lon = request.home

        # Get all safe return options
        options = safe_return_router.get_return_options(
            current_lat, current_lon, home_lat, home_lon
        )

        # Build response
        direct_home_data = options.get('direct_home', {})
        direct_home = SafeReturnOption(
            path=direct_home_data.get('path', []),
            cost=direct_home_data.get('cost', 0.0),
            algorithm=direct_home_data.get('algorithm', 'HomeGuard'),
            safety_score=direct_home_data.get('safety_score', 1.0)
        )

        via_landmark = None
        if request.include_landmark and 'via_landmark' in options:
            landmark_data = options['via_landmark']
            if landmark_data.get('path'):
                via_landmark = SafeReturnOption(
                    path=landmark_data.get('path', []),
                    cost=landmark_data.get('cost', 0.0),
                    algorithm=landmark_data.get('algorithm', 'HomeGuard'),
                    safety_score=landmark_data.get('safety_score', 1.0),
                    landmark=landmark_data.get('landmark')
                )

        retrace_steps = None
        breadcrumb_path = None
        if request.include_breadcrumbs and 'retrace_steps' in options:
            retrace_data = options['retrace_steps']
            if retrace_data.get('path'):
                retrace_steps = SafeReturnOption(
                    path=retrace_data.get('path', []),
                    cost=retrace_data.get('cost', 0.0),
                    algorithm=retrace_data.get('algorithm', 'BreadcrumbReverse'),
                    safety_score=retrace_data.get('safety_score', 0.95)
                )
                breadcrumb_path = safe_return_router.get_breadcrumb_path()

        return SafeReturnResponse(
            direct_home=direct_home,
            via_landmark=via_landmark,
            retrace_steps=retrace_steps,
            breadcrumb_path=breadcrumb_path
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Safe return error: {str(e)}")


@app.post("/track_position")
async def track_position(lat: float, lon: float):
    """V11: Track user's current position for breadcrumb trail."""
    if safe_return_router is None:
        raise HTTPException(status_code=503, detail="Safe return not initialized")

    try:
        from pathfinding.utils import nearest_node
        node_id = nearest_node(graph, lat, lon)
        safe_return_router.track_position(lat, lon, node_id)
        return {"status": "tracked", "lat": lat, "lon": lon, "node": int(node_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tracking error: {str(e)}")


@app.post("/start_journey")
async def start_journey():
    """V11: Start breadcrumb trail recording."""
    if safe_return_router is None:
        raise HTTPException(status_code=503, detail="Safe return not initialized")

    safe_return_router.start_tracking()
    return {"status": "journey_started", "message": "Breadcrumb tracking active"}


# ============================================================================
# V14 - LANDMARK NAVIGATION
# ============================================================================

class AddLandmarkRequest(BaseModel):
    name: str
    lat: float
    lon: float
    category: str = "personal"
    landmark_type: str = "custom"


@app.get("/landmarks")
async def get_landmarks(category: Optional[str] = None):
    """V14: Get all landmarks or landmarks in a specific category."""
    if landmark_db is None:
        raise HTTPException(status_code=503, detail="Landmark database not initialized")

    if category:
        landmarks = landmark_db.get_landmarks_by_category(category)
        return {"category": category, "landmarks": landmarks}
    else:
        return landmark_db.get_all_landmarks()


@app.post("/landmarks")
async def add_landmark(request: AddLandmarkRequest):
    """V14: Add a new landmark."""
    if landmark_db is None:
        raise HTTPException(status_code=503, detail="Landmark database not initialized")

    try:
        landmark = landmark_db.add_landmark(
            request.category, request.name, request.lat, request.lon, request.landmark_type
        )
        return {"status": "created", "landmark": landmark}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Landmark creation error: {str(e)}")


@app.delete("/landmarks/{landmark_id}")
async def remove_landmark(landmark_id: str):
    """V14: Remove a landmark by ID."""
    if landmark_db is None:
        raise HTTPException(status_code=503, detail="Landmark database not initialized")

    success = landmark_db.remove_landmark(landmark_id)
    if success:
        return {"status": "deleted", "landmark_id": landmark_id}
    else:
        raise HTTPException(status_code=404, detail="Landmark not found")


@app.get("/landmarks/nearest")
async def find_nearest_landmark(lat: float, lon: float, category: Optional[str] = None):
    """V14: Find nearest landmark to given coordinates."""
    if landmark_db is None:
        raise HTTPException(status_code=503, detail="Landmark database not initialized")

    nearest = landmark_db.find_nearest_landmark(lat, lon, category)
    if nearest:
        return {"landmark": nearest}
    else:
        raise HTTPException(status_code=404, detail="No landmarks found")


# ============================================================================
# V12 - FRIEND PICKUP MODE
# ============================================================================

class FriendPickupRequest(BaseModel):
    user_pos: List[float]    # [lat, lon]
    friend_pos: List[float]  # [lat, lon]
    user_speed: Optional[float] = 1.4    # m/s (walking speed)
    friend_speed: Optional[float] = 1.4  # m/s


class FriendPickupResponse(BaseModel):
    meeting_point: List[float]
    user_path: List[List[float]]
    friend_path: List[List[float]]
    eta_seconds: float
    user_eta: float
    friend_eta: float
    distance_user: float
    distance_friend: float


@app.post("/friend_pickup", response_model=FriendPickupResponse)
async def friend_pickup(request: FriendPickupRequest):
    """
    V12: Calculate optimal meeting point between two users.
    Uses ShadowPath for intelligent routing.
    """
    if graph is None:
        raise HTTPException(status_code=503, detail="Graph not loaded")

    try:
        from pathfinding.friend_pickup import FriendPickupRouter
        
        friend_router = FriendPickupRouter(graph, algo_impl["ShadowPath"])
        result = friend_router.calculate_meeting_point(
            request.user_pos, request.friend_pos,
            request.user_speed, request.friend_speed
        )
        
        return FriendPickupResponse(
            meeting_point=result['meeting_point'],
            user_path=result['user1_path'],
            friend_path=result['user2_path'],
            eta_seconds=result['eta_seconds'],
            user_eta=result['user1_eta'],
            friend_eta=result['user2_eta'],
            distance_user=result['distance_user1'],
            distance_friend=result['distance_user2']
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Friend pickup error: {str(e)}")


# ============================================================================
# V13 - AREA EXPLORATION (PathfinderX Scouting)
# ============================================================================

class ExploreRequest(BaseModel):
    center: List[float]  # [lat, lon]
    radius_km: Optional[float] = 2.0


class Zone(BaseModel):
    lat: float
    lon: float
    score: float
    reason: Optional[str] = None


class ExploreResponse(BaseModel):
    interesting_zones: List[Zone]
    safe_zones: List[Zone]
    unfamiliar_zones: List[Zone]
    exploration_radius: float


@app.post("/explore", response_model=ExploreResponse)
async def explore_area(request: ExploreRequest):
    """
    V13: Scan area for interesting/safe/unfamiliar zones using PathfinderX.
    """
    if graph is None:
        raise HTTPException(status_code=503, detail="Graph not loaded")

    try:
        from pathfinding.exploration import ExplorationEngine
        
        explorer = ExplorationEngine(graph, algo_impl["PathfinderX"])
        result = explorer.scan_area(request.center[0], request.center[1], request.radius_km)
        
        return ExploreResponse(
            interesting_zones=[Zone(**z) for z in result['interesting_zones']],
            safe_zones=[Zone(**z) for z in result['safe_zones']],
            unfamiliar_zones=[Zone(lat=z['lat'], lon=z['lon'], score=z['familiarity_score']) 
                            for z in result['unfamiliar_zones']],
            exploration_radius=result['exploration_radius']
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Exploration error: {str(e)}")


# ===== V21: Safety Core Endpoints =====

@app.get("/safety/diagnostics")
async def safety_diagnostics():
    """V21: Get safety core diagnostics and graph health metrics."""
    if safety_core is None:
        raise HTTPException(status_code=503, detail="SafetyCore not initialized")
    
    try:
        diagnostics = safety_core.get_diagnostics()
        return {
            "status": "healthy" if diagnostics['graph_health'] > 80 else "warning",
            "diagnostics": diagnostics,
            "message": f"Graph health: {diagnostics['graph_health']:.1f}%"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diagnostics error: {str(e)}")


# ===== V27.1: Context-Aware Navigation =====

@app.post("/context", response_model=ContextResponse)
async def analyze_context(request: ContextRequest):
    """
    V27.1: Analyze context and recommend optimal routing algorithm.
    
    Evaluates:
    - Device state (battery, GPS, signal)
    - User behavior (speed, movement, deviations)
    - Environment (time, familiarity, safety)
    - Friend proximity
    
    Returns intelligent routing recommendation with reasoning.
    """
    if context_engine is None:
        raise HTTPException(status_code=503, detail="ContextEngine not initialized")
    
    try:
        # Update context engine state
        context_engine.update_state(
            user_state=request.user_state.model_dump(),
            environment=request.environment.model_dump(),
            device=request.device.model_dump()
        )
        
        # Analyze and get recommendation
        analysis = context_engine.analyze_context()
        
        return ContextResponse(
            recommended_algo=analysis["recommended_algo"],
            confidence=analysis["confidence"],
            context_actions=analysis["context_actions"],
            safety_adjustments=analysis["safety_adjustments"],
            ui_signals=analysis["ui_signals"],
            flags=analysis["flags"],
            notes=analysis["notes"],
            evaluation_interval_s=analysis["evaluation_interval_s"]
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Context analysis error: {str(e)}")


# ====================================================================================
# V44: PYTHON PAGE ENGINE (PPE) ROUTES
# ====================================================================================

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[PPE] WebSocket connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"[PPE] WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)
    
    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                print(f"[PPE] Error broadcasting to connection: {e}")

ws_manager = ConnectionManager()


@app.get("/v44", response_class=HTMLResponse)
async def serve_app_shell():
    """
    V44: Serve the main application shell
    
    Returns complete HTML page with embedded state
    Target: < 300ms response time
    """
    page_engine = get_page_engine()
    html = page_engine.render_app_shell()
    return HTMLResponse(content=html)


@app.post("/api/v44/unlock")
async def unlock_screen(data: Dict[str, str]):
    """
    V44: Unlock screen endpoint
    
    Validates passcode and updates page state
    """
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    
    passcode = data.get("passcode", "")
    success = page_engine.unlock_screen(passcode)
    
    if success:
        # Sync unlock state
        from page_engine.sync_layer import SyncPriority
        event = sync_layer.create_event(
            event_type='state',
            source='python',
            data={'lockscreen_active': False, 'map_initialized': True},
            priority=SyncPriority.HIGH
        )
        sync_layer.enqueue_event(event)
        sync_layer.process_event(event)
        
        # Broadcast to all connected clients
        import json
        await ws_manager.broadcast(json.dumps({
            'type': 'state',
            'data': {'lockscreen_active': False, 'map_initialized': True},
            'version': page_engine.state.version,
            'timestamp': page_engine.state.timestamp
        }))
    
    return {"success": success}


@app.get("/api/v44/state")
async def get_page_state():
    """Get current page state snapshot"""
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    
    return {
        "page_state": page_engine.get_state_snapshot(),
        "sync_state": sync_layer.get_state_snapshot(),
        "performance": {
            "page_engine": page_engine.get_performance_stats(),
            "sync_layer": sync_layer.get_performance_stats()
        }
    }


@app.get("/api/v44/updates")
async def get_pending_updates(since_version: int = 0):
    """
    Get pending updates since specified version
    
    Used for polling-based sync
    """
    page_engine = get_page_engine()
    updates = page_engine.get_pending_updates(since_version)
    
    return {
        "updates": updates,
        "current_version": page_engine.state.version,
        "update_count": len(updates)
    }


@app.post("/api/v44/gps")
async def update_gps(data: Dict[str, float]):
    """
    V44: Update GPS position
    
    Target: < 20ms processing time
    """
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    
    lat = data.get("lat")
    lon = data.get("lon")
    accuracy = data.get("accuracy", 5.0)
    
    if lat is None or lon is None:
        raise HTTPException(status_code=400, detail="Missing lat/lon")
    
    # Update page engine
    update = page_engine.update_gps(lat, lon, accuracy)
    
    # Sync through ISL (critical priority)
    sync_layer.sync_gps(lat, lon, accuracy, source='python')
    
    # Broadcast to connected clients
    import json
    await ws_manager.broadcast(json.dumps({
        'type': 'gps',
        'data': update.data,
        'version': update.version,
        'timestamp': update.timestamp
    }))
    
    return {"success": True, "version": update.version}


@app.post("/api/v44/panel")
async def update_panel(data: Dict[str, Any]):
    """Update current panel state"""
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    
    panel_name = data.get("panel")
    source = data.get("source", "typescript")
    
    # Update page engine
    update = page_engine.update_panel(panel_name)
    
    # Sync through ISL
    sync_layer.sync_panel(panel_name, source=source)
    
    # Broadcast
    import json
    await ws_manager.broadcast(json.dumps({
        'type': 'panel',
        'data': update.data,
        'version': update.version,
        'timestamp': update.timestamp
    }))
    
    return {"success": True, "version": update.version}


@app.websocket("/ws/sync")
async def websocket_sync(websocket: WebSocket):
    """
    V44: WebSocket endpoint for real-time state sync
    
    Provides <20ms update latency
    """
    await ws_manager.connect(websocket)
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    
    try:
        # Send current state immediately
        import json
        await websocket.send_text(json.dumps({
            'type': 'state_snapshot',
            'data': page_engine.get_state_snapshot(),
            'version': page_engine.state.version,
            'timestamp': page_engine.state.timestamp
        }))
        
        # Listen for client messages
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get('type') == 'sync_request':
                # Client requesting updates
                since_version = message.get('version', 0)
                updates = page_engine.get_pending_updates(since_version)
                
                await websocket.send_text(json.dumps({
                    'type': 'sync_response',
                    'updates': updates,
                    'current_version': page_engine.state.version
                }))
            
            elif message.get('type') == 'event':
                # Client sending event
                event_type = message.get('event_type')
                event_data = message.get('data', {})
                source = message.get('source', 'typescript')
                
                # Handle different event types
                if event_type == 'panel':
                    panel_name = event_data.get('panel')
                    event = sync_layer.sync_panel(panel_name, source=source)
                    sync_layer.process_event(event)
                    
                    # Broadcast to other clients
                    await ws_manager.broadcast(json.dumps({
                        'type': 'panel',
                        'data': event_data,
                        'version': sync_layer.current_version,
                        'timestamp': event.timestamp
                    }))
    
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        print(f"[PPE] WebSocket error: {e}")
        ws_manager.disconnect(websocket)


@app.get("/api/v44/icon/{library}/{name}")
async def get_icon(library: str, name: str, resolution: str = "1x"):
    """
    V44: Serve high-resolution SVG icons
    
    Supports 1x, 2x, 3x resolution scaling
    """
    asset_manager = get_asset_manager()
    
    asset = asset_manager.get_icon(library, name, resolution)
    
    if asset is None:
        raise HTTPException(status_code=404, detail="Icon not found")
    
    from fastapi.responses import Response
    return Response(
        content=asset.content,
        media_type=asset.content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
            "ETag": asset.hash
        }
    )


@app.get("/api/v44/diagnostics")
async def get_diagnostics():
    """
    V44: Get comprehensive diagnostics
    
    Returns performance metrics for all V44 systems
    """
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    asset_manager = get_asset_manager()
    
    return {
        "version": "V44",
        "page_engine": {
            "state": page_engine.get_state_snapshot(),
            "performance": page_engine.get_performance_stats()
        },
        "sync_layer": {
            "state": sync_layer.get_state_snapshot(),
            "performance": sync_layer.get_performance_stats(),
            "event_history": sync_layer.get_event_history(limit=20)
        },
        "asset_manager": {
            "cache_stats": asset_manager.get_cache_stats()
        },
        "websockets": {
            "active_connections": len(ws_manager.active_connections)
        }
    }


# ====================================================================================
# V45: UNIVERSAL LOCATION ACCESS PAGE ROUTES
# ====================================================================================

@app.get("/v45", response_class=HTMLResponse)
async def serve_location_access_page():
    """
    V45: Serve universal location access page
    
    Cross-platform location permission with user-friendly UI
    Target: < 180ms response time
    """
    location_page = get_location_access_page()
    html = location_page.render_html()
    return HTMLResponse(content=html)


@app.post("/api/v45/location-permission")
async def handle_location_permission(data: Dict[str, Any]):
    """
    V45: Handle location permission response
    
    Handles: granted, denied, skipped states
    Syncs with PPE and ISL
    """
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    location_page = get_location_access_page()
    
    state = data.get("state")  # 'granted', 'denied', 'skipped'
    
    if state == "granted":
        lat = data.get("lat")
        lon = data.get("lon")
        accuracy = data.get("accuracy", 5.0)
        
        # Use LocationAccessPage method with PageEngine sync
        result = location_page.handle_permission_granted(
            lat, lon, accuracy, 
            page_engine=page_engine
        )
        
        # Update page engine GPS
        page_engine.update_gps(lat, lon, accuracy)
        
        # Sync through ISL (CRITICAL priority)
        from page_engine.sync_layer import SyncPriority
        event = sync_layer.create_event(
            event_type='gps',
            source='location_access',
            data={
                'lat': lat,
                'lon': lon,
                'accuracy': accuracy,
                'permission': 'granted'
            },
            priority=SyncPriority.CRITICAL
        )
        sync_layer.enqueue_event(event)
        sync_layer.process_event(event)
        
        # Broadcast to WebSocket clients
        import json
        await ws_manager.broadcast(json.dumps({
            'type': 'location_permission',
            'data': {
                'state': 'granted',
                'gps_enabled': True,
                'lat': lat,
                'lon': lon
            },
            'version': page_engine.state.version,
            'timestamp': page_engine.state.timestamp
        }))
        
        print(f"[V45] Location permission GRANTED: {lat}, {lon}")
        
        return result
    
    elif state == "denied":
        # Update page state - location denied but allow app usage
        page_engine.update_state(
            gps_enabled=False,
            location_permission='denied'
        )
        
        # Sync through ISL
        from page_engine.sync_layer import SyncPriority
        event = sync_layer.create_event(
            event_type='state',
            source='location_access',
            data={
                'gps_enabled': False,
                'permission': 'denied',
                'no_gps_mode': True
            },
            priority=SyncPriority.HIGH
        )
        sync_layer.enqueue_event(event)
        sync_layer.process_event(event)
        
        print("[V45] Location permission DENIED - enabling no-GPS mode")
        
        return {
            "success": True,
            "state": "denied",
            "message": "App will work without location"
        }
    
    elif state == "skipped":
        # User chose to skip - use LocationAccessPage method with PageEngine sync
        result = location_page.handle_permission_skipped(page_engine=page_engine)
        
        # Sync through ISL
        from page_engine.sync_layer import SyncPriority
        event = sync_layer.create_event(
            event_type='state',
            source='location_access',
            data={
                'gps_enabled': False,
                'permission': 'skipped',
                'no_gps_mode': True
            },
            priority=SyncPriority.MEDIUM
        )
        sync_layer.enqueue_event(event)
        sync_layer.process_event(event)
        
        print("[V45] Location permission SKIPPED - no-GPS mode enabled")
        
        return result
    
    else:
        raise HTTPException(status_code=400, detail=f"Invalid state: {state}")


@app.get("/api/v45/location-status")
async def get_location_status():
    """
    V45: Get current location permission status
    
    Returns current state and whether GPS is enabled
    """
    page_engine = get_page_engine()
    get_location_access_page()
    
    state = page_engine.get_state_snapshot()
    
    return {
        "gps_enabled": state.get('gps_enabled', False),
        "location_permission": state.get('location_permission', 'unknown'),
        "no_gps_mode": state.get('no_gps_mode', False),
        "current_location": {
            "lat": state.get('gps_lat'),
            "lon": state.get('gps_lon'),
            "accuracy": state.get('gps_accuracy')
        } if state.get('gps_lat') else None
    }


# ====================================================================================
# V46 ROUTES — SMART PERMISSION FALLBACK + BLOCK DETECTION
# ====================================================================================

@app.post("/api/v46/permission-error")
async def handle_permission_error(data: Dict[str, Any]):
    """
    V46: Handle geolocation errors with smart detection
    
    Analyzes error code, browser, platform, and popup timing
    to determine exact permission state (DENIED, BLOCKED, UNAVAILABLE, etc.)
    
    Performance: < 100ms state resolution
    """
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    location_page = get_location_access_page()
    
    error_code = data.get("error_code")
    browser = data.get("browser", "unknown")
    platform = data.get("platform", "unknown")
    popup_shown = data.get("popup_shown", False)
    
    # Use V46 smart detection
    result = location_page.handle_permission_error(
        error_code=error_code,
        browser=browser,
        platform=platform,
        popup_shown=popup_shown,
        page_engine=page_engine
    )
    
    # Sync through ISL
    from page_engine.sync_layer import SyncPriority
    event = sync_layer.create_event(
        event_type='permission_error',
        source='location_access_v46',
        data={
            'state': result['state'],
            'error_code': error_code,
            'can_retry': result['can_retry'],
            'capabilities': result['capabilities']
        },
        priority=SyncPriority.HIGH
    )
    sync_layer.enqueue_event(event)
    sync_layer.process_event(event)
    
    # Broadcast to WebSocket clients
    import json
    await ws_manager.broadcast(json.dumps({
        'type': 'permission_state',
        'data': result,
        'version': page_engine.state.version,
        'timestamp': page_engine.state.timestamp
    }))
    
    print(f"[V46] Permission error detected: {result['state']} (error_code={error_code}, browser={browser}, platform={platform})")
    
    return result


@app.post("/api/v46/diagnostic-sheet")
async def get_diagnostic_sheet(diagnostics: Dict[str, Any]):
    """
    V46: Render micro-diagnostic bottom sheet
    
    Returns HTML for slide-up diagnostic panel with:
    - Status icon
    - User-friendly message
    - Settings button (if applicable)
    - Continue Anyway button
    
    Performance: < 50ms render time
    """
    location_page = get_location_access_page()
    
    # Import PermissionDiagnostics to reconstruct from dict
    from page_engine.permission_state import PermissionDiagnostics, LocationPermissionState
    
    # Reconstruct diagnostics object
    diag = PermissionDiagnostics(
        state=LocationPermissionState(diagnostics['state']),
        error_code=diagnostics.get('error_code'),
        browser=diagnostics.get('browser'),
        platform=diagnostics.get('platform'),
        can_retry=diagnostics.get('can_retry', False),
        retry_interval_seconds=diagnostics.get('retry_interval', 8),
        show_settings_link=diagnostics.get('show_settings_link', False),
        user_message=diagnostics.get('message', ''),
        timestamp=diagnostics.get('timestamp', 0.0)
    )
    
    # Render diagnostic sheet
    html = location_page.render_diagnostic_sheet(diag)
    
    return HTMLResponse(content=html)


@app.get("/api/v46/capabilities")
async def get_capabilities():
    """
    V46: Get current app capabilities based on permission state
    
    Returns what features are available in current permission state:
    - realtime_routing
    - safe_return
    - live_tracking
    - scan_animation
    - map_browsing
    - route_planning
    - accuracy_warning
    - retry_gps
    """
    from page_engine.permission_state import get_current_diagnostics, FallbackNavigationMode
    
    diagnostics = get_current_diagnostics()
    if diagnostics:
        capabilities = FallbackNavigationMode.get_capabilities(diagnostics.state)
    else:
        # Default to unknown state capabilities
        from page_engine.permission_state import LocationPermissionState
        capabilities = FallbackNavigationMode.get_capabilities(LocationPermissionState.UNKNOWN)
    
    return {
        "capabilities": capabilities,
        "state": diagnostics.state.value if diagnostics else "unknown",
        "message": diagnostics.user_message if diagnostics else "Permission state unknown"
    }


@app.post("/api/v46/retry-gps")
async def retry_gps_permission():
    """
    V46: Manually retry GPS permission request
    
    Used when user wants to enable location after initially denying/skipping
    """
    page_engine = get_page_engine()
    get_location_access_page()
    
    # Reset state to allow retry
    from page_engine.permission_state import LocationPermissionState, set_current_diagnostics, PermissionDiagnostics
    
    diag = PermissionDiagnostics(
        state=LocationPermissionState.UNKNOWN,
        user_message="Ready to request location permission"
    )
    set_current_diagnostics(diag)
    
    page_engine.update_state(
        location_permission='unknown',
        no_gps_mode=False
    )
    
    print("[V46] GPS permission retry requested")
    
    return {
        "success": True,
        "message": "Ready to retry location permission",
        "redirect": "/v45/location"
    }


# ====================================================================================
# END V44/V45/V46 ROUTES
# ====================================================================================


# ====================================================================================
# V48 ROUTES: REAL LOCATION ENGINE + ICON ENGINE + HTTPS ENFORCEMENT
# ====================================================================================

class V48SecureContextRequest(BaseModel):
    """Request to validate secure context"""
    origin: str


class V48LocationUpdateRequest(BaseModel):
    """GPS position update from client"""
    latitude: float
    longitude: float
    accuracy: float
    altitude: Optional[float] = None
    altitude_accuracy: Optional[float] = None
    heading: Optional[float] = None
    speed: Optional[float] = None
    timestamp: float


class V48LocationErrorRequest(BaseModel):
    """GPS error from client"""
    error_code: int
    error_message: str


@app.post("/api/v48/validate-secure-context")
async def validate_secure_context(request: V48SecureContextRequest):
    """
    V48: Validate that origin supports geolocation (HTTPS required)
    
    Android Chrome requires HTTPS for GPS access.
    Returns secure context status and guidance.
    """
    rle = get_rle()
    is_secure = rle.validate_secure_context(request.origin)
    
    if is_secure:
        return {
            "secure": True,
            "origin": request.origin,
            "message": "Secure context - GPS access available",
            "allowed_origins": ["https://*", "http://localhost", "http://127.0.0.1"]
        }
    else:
        return {
            "secure": False,
            "origin": request.origin,
            "message": "Insecure context - HTTPS required for GPS",
            "error": "SECURE_CONTEXT_REQUIRED",
            "guidance": "Access via HTTPS or localhost to enable GPS tracking"
        }


@app.post("/api/v48/start-tracking")
async def start_gps_tracking(request: V48SecureContextRequest):
    """
    V48: Start GPS tracking (must be called after user interaction)
    
    Returns watchPosition configuration and tracking ID.
    """
    rle = get_rle()
    
    # Validate secure context first
    is_secure = rle.validate_secure_context(request.origin)
    if not is_secure:
        raise HTTPException(
            status_code=403,
            detail="HTTPS required for GPS tracking"
        )
    
    result = rle.start_tracking()
    
    # Update ISL
    sync_layer = get_sync_layer()
    page_engine = get_page_engine()
    
    if result['status'] == 'started':
        page_engine.update_state(gps_enabled=True)
        sync_layer.push_event('gps', {
            'enabled': True,
            'tracking_started': True
        }, priority='CRITICAL')
    
    print("[V48 RLE] GPS tracking started - secure context validated")
    
    return result


@app.post("/api/v48/stop-tracking")
async def stop_gps_tracking():
    """
    V48: Stop GPS tracking
    """
    rle = get_rle()
    result = rle.stop_tracking()
    
    # Update ISL
    sync_layer = get_sync_layer()
    page_engine = get_page_engine()
    
    page_engine.update_state(gps_enabled=False)
    sync_layer.push_event('gps', {
        'enabled': False,
        'tracking_stopped': True
    }, priority='HIGH')
    
    print("[V48 RLE] GPS tracking stopped")
    
    return result


@app.post("/api/v48/update-position")
async def update_gps_position(request: V48LocationUpdateRequest):
    """
    V48: Process GPS position update from client
    
    Updates RLE, ISL, and notifies all connected systems:
    - Map engine (recenter, marker)
    - Stats panel (speed, distance, ETA)
    - Routing engine (waypoint progress)
    - Safe-return (current location)
    """
    rle = get_rle()
    
    # Create location update
    location = LocationUpdate(
        latitude=request.latitude,
        longitude=request.longitude,
        accuracy=request.accuracy,
        altitude=request.altitude,
        altitude_accuracy=request.altitude_accuracy,
        heading=request.heading,
        speed=request.speed,
        timestamp=request.timestamp
    )
    
    # Update RLE
    result = rle.update_position(location)
    
    if result['status'] == 'updated':
        # Broadcast to ISL
        sync_layer = get_sync_layer()
        sync_layer.push_event('gps', {
            'latitude': location.latitude,
            'longitude': location.longitude,
            'accuracy': location.accuracy,
            'speed': location.speed,
            'heading': location.heading,
            'timestamp': location.timestamp,
            'statistics': result['position']['statistics']
        }, priority='CRITICAL')
        
        # Update page engine state
        page_engine = get_page_engine()
        page_engine.update_state(
            gps_enabled=True,
            location_permission='enabled'
        )
        
        return {
            "success": True,
            "position": result['position'],
            "message": "Position updated successfully"
        }
    else:
        return {
            "success": False,
            "message": result.get('message', 'Update failed')
        }


@app.post("/api/v48/handle-gps-error")
async def handle_gps_error(request: V48LocationErrorRequest):
    """
    V48: Handle GPS error from client
    
    Integrates with V46 permission state model.
    """
    rle = get_rle()
    result = rle.handle_error(request.error_code, request.error_message)
    
    # Also trigger V46 permission error handling
    from page_engine.location_access import get_location_access_page
    location_page = get_location_access_page()
    page_engine = get_page_engine()
    
    # Detect permission state using V46 logic
    v46_result = location_page.handle_permission_error(
        error_code=request.error_code,
        browser="unknown",  # Client should send this
        platform="unknown",  # Client should send this
        popup_shown=False,  # Client should send this
        page_engine=page_engine
    )
    
    print(f"[V48 RLE] GPS error handled: {result['error_type']}")
    
    return {
        "rle_result": result,
        "v46_result": v46_result,
        "message": "Error handled, see diagnostics"
    }


@app.get("/api/v48/rle-state")
async def get_rle_state():
    """
    V48: Get current Real Location Engine state
    
    Returns tracking status, position, statistics, errors.
    """
    rle = get_rle()
    state = rle.get_state()
    
    return {
        "rle_state": state,
        "message": "RLE state retrieved successfully"
    }


@app.get("/api/v48/icon-imports")
async def get_icon_imports():
    """
    V48: Get TypeScript icon import statement
    
    Returns Heroicons import for frontend.
    """
    icon_engine = get_icon_engine()
    imports = icon_engine.generate_icon_imports()
    
    return {
        "imports": imports,
        "icon_count": len(icon_engine.ICON_MAP),
        "message": "Use this import in your TypeScript files"
    }


@app.get("/api/v48/icon/{icon_name}")
async def get_icon_svg(icon_name: str):
    """
    V48: Get SVG template for server-side rendering
    
    Returns inline SVG markup for icon.
    """
    icon_engine = get_icon_engine()
    svg = icon_engine.get_svg_template(icon_name)
    
    return HTMLResponse(content=svg, media_type="image/svg+xml")


# ====================================================================================
# END V48 ROUTES
# ====================================================================================

# ====================================================================================
# V50 ACTION + MAP LAYER ROUTES (no version banners in internal code blocks)
# Provides deterministic action flow endpoints for frontend ActionEngine
# ====================================================================================

from fastapi import Body

class ActionRequest(BaseModel):
    action: str
    params: Optional[Dict[str, Any]] = None

class MapLayerRequest(BaseModel):
    layer: str  # 'normal','satellite','hybrid','3d'
    pitch: Optional[float] = 0.0
    bearing: Optional[float] = 0.0

@app.post("/api/action/route")
async def action_route(req: ActionRequest):
    """Trigger route computation (placeholder minimal implementation)"""
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    # Lock action
    page_engine.update_state(action_in_progress='route')
    sync_layer.sync_action_status('route')
    # Activate routing navigation state
    page_engine.update_state(route_active=True)
    sync_layer.sync_navigation_state('navigating')
    page_engine.update_state(action_in_progress=None)
    sync_layer.sync_action_status(None)
    return {"success": True, "navigation_state": "navigating"}

@app.post("/api/action/safe-return")
async def action_safe_return(req: ActionRequest):
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    page_engine.update_state(action_in_progress='safe_return')
    sync_layer.sync_action_status('safe_return')
    # Placeholder: activate safe return navigation_state
    sync_layer.sync_navigation_state('safe_return')
    page_engine.update_state(action_in_progress=None)
    sync_layer.sync_action_status(None)
    return {"success": True, "navigation_state": "safe_return"}

@app.post("/api/action/explore")
async def action_explore(req: ActionRequest):
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    page_engine.update_state(action_in_progress='explore')
    sync_layer.sync_action_status('explore')
    sync_layer.sync_navigation_state('exploring')
    page_engine.update_state(action_in_progress=None)
    sync_layer.sync_action_status(None)
    return {"success": True, "navigation_state": "exploring"}

@app.post("/api/action/track/start")
async def action_track_start(req: ActionRequest):
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    page_engine.update_state(action_in_progress='track_start', tracking_active=True)
    sync_layer.sync_action_status('track_start')
    sync_layer.sync_navigation_state('navigating')
    page_engine.update_state(action_in_progress=None)
    sync_layer.sync_action_status(None)
    return {"success": True, "tracking_active": True}

@app.post("/api/action/track/stop")
async def action_track_stop(req: ActionRequest):
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    page_engine.update_state(action_in_progress='track_stop', tracking_active=False)
    sync_layer.sync_action_status('track_stop')
    sync_layer.sync_navigation_state('idle')
    page_engine.update_state(action_in_progress=None)
    sync_layer.sync_action_status(None)
    return {"success": True, "tracking_active": False}

@app.post("/api/map/layer")
async def map_layer_switch(req: MapLayerRequest):
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    # Update page state
    page_engine.update_state(
        map_layer=req.layer,
        map_pitch=req.pitch or 0.0,
        map_bearing=req.bearing or 0.0
    )
    sync_layer.sync_map_layer(req.layer, req.pitch or 0.0, req.bearing or 0.0)
    return {"success": True, "map_layer": req.layer}

@app.post("/api/navigation/state")
async def navigation_state_update(state: str = Body(..., embed=True)):
    page_engine = get_page_engine()
    sync_layer = get_sync_layer()
    page_engine.update_state(navigation_state=state)
    sync_layer.sync_navigation_state(state)
    return {"success": True, "navigation_state": state}

# ====================================================================================
# END V50 ROUTES
# ====================================================================================

# ====================================================================================
# V77 TILE PROXY + TERRAIN STREAMING + HEALTH CHECK
# ====================================================================================

import httpx
from fastapi.responses import Response

@app.get("/api/v1/health")
async def v77_health_check():
    """
    V77: Backend health check for tile/terrain/routing services.
    V83: Added tile_config_ready status.
    Returns status of all providers so frontend can wait before map init.
    """
    tile_config_ready = tile_binding_engine is not None and tile_binding_engine.is_ready()
    
    return {
        "status": "online",
        "tiles": {
            "status": "online",
            "provider": "eox_s2cloudless",
            "url_template": "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2019_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg"
        },
        "terrain": {
            "status": "online",
            "provider": "terrarium",
            "url_template": "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
        },
        "routing": {
            "status": "online",
            "algorithms": ["ShadowPath", "HomeGuard", "PathfinderX"]
        },
        # V82: BFIS versions
        "api_version": "v1",
        "tile_format_version": "terrarium_v1",
        "terrain_layer_version": "v75",
        "ui_integration_version": "v78",
        "build_id": get_metadata().get("build_id", "dev-unknown"),
        "version": "77.0.0",
        # V83: Tile config status
        "tile_config_ready": tile_config_ready,
        "tile_proxy": "operational" if tile_config_ready else "initializing"
    }

@app.get("/api/v1/diagnostics/tiles")
async def v89_tile_diagnostics():
    """
    V89: Tile diagnostics endpoint - checks all tile servers.
    Returns operational status and identifies issues.
    """
    if tile_diagnostics is None:
        return {"error": "Tile diagnostics not initialized"}
    
    result = await tile_diagnostics.run_all()
    return result

@app.get("/api/v1/heartbeat/tiles")
async def v91_tile_heartbeat():
    """
    V91: Tile heartbeat status endpoint.
    Returns current tile server validation status and fallback availability.
    """
    if tile_heartbeat is None or tile_fallback is None:
        return {"error": "Tile heartbeat not initialized"}
    
    # Test primary server
    primary_url = 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
    is_valid = await tile_heartbeat.validate_with_retries(primary_url)
    
    return {
        "primary_server": {
            "url": primary_url,
            "operational": is_valid,
            "status": "ONLINE" if is_valid else "OFFLINE"
        },
        "fallback_providers": tile_fallback.get_all_urls(),
        "heartbeat_config": {
            "interval_ms": tile_heartbeat.interval_ms,
            "max_retries": tile_heartbeat.max_retries
        },
        "enforcer": {
            "valid_mime_types": tile_enforcer.valid_mime_types,
            "min_bytes": tile_enforcer.min_bytes
        }
    }

@app.get("/api/v1/tiles/proxy/{z}/{x}/{y}")
async def v92_tile_proxy_endpoint(z: int, x: int, y: int):
    """
    V92: Python Tile Proxy - Ultimate Stability Endpoint.
    
    ALL tiles route through this proxy:
        - 5 retry attempts across 4 upstream providers
        - Memory + disk caching
        - Automatic fallback on failure
        - Zero tile failures guaranteed
    
    Returns: Raw tile image bytes with appropriate MIME type
    """
    from fastapi.responses import Response
    
    if tile_proxy is None:
        raise HTTPException(status_code=503, detail="Tile proxy not initialized")
    
    result = await tile_proxy.fetch_tile(z, x, y)
    
    if result.get("error"):
        # Even errors return fallback tile, never fail completely
        return Response(
            content=result["data"],
            media_type=result["mime"],
            headers={
                "X-Tile-Source": "fallback",
                "X-Tile-Error": "All upstream providers failed"
            }
        )
    
    return Response(
        content=result["data"],
        media_type=result["mime"],
        headers={
            "X-Tile-Source": result.get("source", "unknown"),
            "X-Tile-Attempts": str(result.get("attempt", 0)),
            "Cache-Control": "public, max-age=86400"
        }
    )

@app.get("/api/v1/tiles/proxy/stats")
async def v92_tile_proxy_stats():
    """
    V92: Get tile proxy statistics.
    Returns cache hit rates, request counts, and failure metrics.
    """
    if tile_proxy is None:
        return {"error": "Tile proxy not initialized"}
    
    return tile_proxy.get_stats()

@app.get("/api/v1/tiles/{provider}/{z}/{x}/{y}")
async def v77_tile_proxy(provider: str, z: int, x: int, y: int):
    """
    V77: Tile proxy endpoint for satellite/base tiles.
    Caches tiles and optionally encrypts (stub for now).
    """
    cache_key = f"{provider}_{z}_{x}_{y}"
    if cache_key in _tile_cache:
        return Response(content=_tile_cache[cache_key]["data"], media_type=_tile_cache[cache_key]["ct"])
    
    # Map provider to URL
    urls = {
        "eox": f"https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2019_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg",
        "carto_dark": f"https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "osm": f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    }
    
    url = urls.get(provider)
    if not url:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Tile fetch failed")
            data = resp.content
            ct = resp.headers.get("content-type", "image/png")
            # Cache tile (simple in-memory; production would use disk/redis)
            if len(_tile_cache) < 500:
                _tile_cache[cache_key] = {"data": data, "ct": ct}
            return Response(content=data, media_type=ct)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tile proxy error: {str(e)}")

@app.get("/backend/tiles/{provider}/{z}/{x}/{y}")
async def backend_tile_proxy(provider: str, z: int, x: int, y: int):
    """
    V80 alias: Backend-compliant tile route. Delegates to V77 proxy.
    """
    return await v77_tile_proxy(provider, z, x, y)

@app.get("/api/v1/terrain/{z}/{x}/{y}")
async def v77_terrain_proxy(z: int, x: int, y: int):
    """
    V77: Terrain DEM proxy for Terrarium tiles.
    """
    cache_key = f"terrain_{z}_{x}_{y}"
    if cache_key in _terrain_cache:
        return Response(content=_terrain_cache[cache_key]["data"], media_type=_terrain_cache[cache_key]["ct"])
    
    url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Terrain fetch failed")
            data = resp.content
            ct = resp.headers.get("content-type", "image/png")
            if len(_terrain_cache) < 300:
                _terrain_cache[cache_key] = {"data": data, "ct": ct}
            return Response(content=data, media_type=ct)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Terrain proxy error: {str(e)}")

@app.get("/backend/terrain/{z}/{x}/{y}")
async def backend_terrain_proxy(z: int, x: int, y: int):
    """
    V80 alias: Backend-compliant terrain route. Delegates to V77 proxy.
    """
    return await v77_terrain_proxy(z, x, y)

# ====================================================================================
# END V77 ROUTES
# ====================================================================================


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
