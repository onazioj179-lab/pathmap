"""
PATHFINDER V53 - VERSIONED INTERFACE CONTRACT (VIC)

All API endpoints are version-locked with 20-year backward compatibility guarantee.

VIC RULES:
1. NO signature changes for 20 years
2. NO breaking changes ever
3. ONLY additive changes allowed (new optional fields)
4. All responses must maintain exact schema
5. All timestamps in ISO 8601 format
6. All coordinates in WGS84 (lat, lon)
7. All distances in meters
8. All times in seconds

Version: v1 (2025-2045 guaranteed compatibility)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import time


# =====================================================================
# V1 REQUEST/RESPONSE SCHEMAS (FROZEN FOR 20 YEARS)
# =====================================================================

class LocationV1(BaseModel):
    """
    Location schema - v1
    FROZEN: No changes allowed until 2045
    """
    latitude: float = Field(..., ge=-90, le=90, description="WGS84 latitude")
    longitude: float = Field(..., ge=-180, le=180, description="WGS84 longitude")
    accuracy: Optional[float] = Field(None, description="Accuracy in meters")
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    
    class Config:
        json_schema_extra = {
            "example": {
                "latitude": 40.7128,
                "longitude": -74.0060,
                "accuracy": 10.0,
                "timestamp": "2025-11-22T12:00:00Z"
            }
        }


class RouteRequestV1(BaseModel):
    """
    Route request schema - v1
    FROZEN: No changes allowed until 2045
    """
    origin: LocationV1
    destination: LocationV1
    waypoints: Optional[List[LocationV1]] = Field(default=None, description="Optional waypoints")
    algorithm: Optional[str] = Field(default="dijkstra", description="dijkstra, astar, or bfs")
    
    class Config:
        json_schema_extra = {
            "example": {
                "origin": {
                    "latitude": 40.7128,
                    "longitude": -74.0060,
                    "accuracy": 10.0,
                    "timestamp": "2025-11-22T12:00:00Z"
                },
                "destination": {
                    "latitude": 40.7580,
                    "longitude": -73.9855,
                    "accuracy": 10.0,
                    "timestamp": "2025-11-22T12:00:00Z"
                },
                "algorithm": "dijkstra"
            }
        }


class RouteSegmentV1(BaseModel):
    """
    Route segment schema - v1
    FROZEN: No changes allowed until 2045
    """
    from_node: str
    to_node: str
    distance: float = Field(..., description="Distance in meters")
    duration: float = Field(..., description="Duration in seconds")


class RouteResponseV1(BaseModel):
    """
    Route response schema - v1
    FROZEN: No changes allowed until 2045
    """
    success: bool
    path: List[str] = Field(..., description="List of node IDs")
    segments: List[RouteSegmentV1]
    total_distance: float = Field(..., description="Total distance in meters")
    total_duration: float = Field(..., description="Total duration in seconds")
    algorithm_used: str
    computation_time_ms: float
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "path": ["node1", "node2", "node3"],
                "segments": [
                    {"from_node": "node1", "to_node": "node2", "distance": 1000, "duration": 72},
                    {"from_node": "node2", "to_node": "node3", "distance": 1500, "duration": 108}
                ],
                "total_distance": 2500,
                "total_duration": 180,
                "algorithm_used": "dijkstra",
                "computation_time_ms": 15.2,
                "timestamp": "2025-11-22T12:00:00Z"
            }
        }


class OfflineCacheStatsV1(BaseModel):
    """
    Offline cache statistics - v1
    FROZEN: No changes allowed until 2045
    """
    tiles_cached: int
    routes_cached: int
    total_size_bytes: int
    last_update: str = Field(..., description="ISO 8601 timestamp")


class HealthResponseV1(BaseModel):
    """
    Health check response - v1
    FROZEN: No changes allowed until 2045
    """
    status: str = Field(..., description="ok or error")
    version: str = Field(..., description="API version")
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    uptime_seconds: float


class ErrorResponseV1(BaseModel):
    """
    Error response schema - v1
    FROZEN: No changes allowed until 2045
    """
    error: str
    message: str
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    
    class Config:
        json_schema_extra = {
            "example": {
                "error": "route_not_found",
                "message": "No route exists between specified nodes",
                "timestamp": "2025-11-22T12:00:00Z"
            }
        }


# =====================================================================
# V1 API ROUTER (FROZEN FOR 20 YEARS)
# =====================================================================

router_v1 = APIRouter(prefix="/v1", tags=["v1"])

# Track API start time for uptime calculation
API_START_TIME = time.time()


@router_v1.get("/health", response_model=HealthResponseV1)
async def health_v1():
    """
    Health check endpoint - v1
    
    FROZEN: This endpoint signature will not change until 2045.
    Returns server health status and version information.
    """
    return HealthResponseV1(
        status="ok",
        version="v1",
        timestamp=datetime.utcnow().isoformat() + "Z",
        uptime_seconds=time.time() - API_START_TIME
    )


@router_v1.post("/location", response_model=Dict[str, Any])
async def update_location_v1(location: LocationV1):
    """
    Update current location - v1
    
    FROZEN: This endpoint signature will not change until 2045.
    Accepts location updates and returns acknowledgment.
    """
    return {
        "success": True,
        "location_received": location.model_dump(),
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


@router_v1.post("/route", response_model=RouteResponseV1)
async def calculate_route_v1(request: RouteRequestV1):
    """
    Calculate route between two points - v1
    
    FROZEN: This endpoint signature will not change until 2045.
    Uses Ultra Stable Engine (USE) with classical algorithms.
    
    Supported algorithms:
    - dijkstra (default, most reliable)
    - astar (with heuristic optimization)
    - bfs (fallback, simplest)
    """
    try:
        from ultra_stable_engine import UltraStableEngine
        
        # For demo purposes, create simple graph
        # In production, load from persistent storage
        engine = UltraStableEngine()
        
        # Demo nodes (in real system, loaded from database)
        from ultra_stable_engine import Node, Edge
        engine.add_node(Node("start", request.origin.latitude, request.origin.longitude))
        engine.add_node(Node("end", request.destination.latitude, request.destination.longitude))
        engine.add_edge(Edge("start", "end", 1000.0))  # 1km demo edge
        
        # Calculate route
        result = engine.route("start", "end", request.algorithm or "dijkstra")
        
        if not result.success:
            raise HTTPException(
                status_code=404,
                detail=ErrorResponseV1(
                    error="route_not_found",
                    message="No route exists between specified points",
                    timestamp=datetime.utcnow().isoformat() + "Z"
                ).model_dump()
            )
        
        # Build segments
        segments = []
        for i in range(len(result.path) - 1):
            segments.append(RouteSegmentV1(
                from_node=result.path[i],
                to_node=result.path[i + 1],
                distance=result.total_distance / (len(result.path) - 1),
                duration=result.total_time / (len(result.path) - 1)
            ))
        
        return RouteResponseV1(
            success=True,
            path=result.path,
            segments=segments,
            total_distance=result.total_distance,
            total_duration=result.total_time,
            algorithm_used=result.algorithm_used,
            computation_time_ms=result.computation_time_ms,
            timestamp=datetime.utcnow().isoformat() + "Z"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=ErrorResponseV1(
                error="calculation_failed",
                message=str(e),
                timestamp=datetime.utcnow().isoformat() + "Z"
            ).model_dump()
        )


@router_v1.get("/offline", response_model=OfflineCacheStatsV1)
async def offline_stats_v1():
    """
    Get offline cache statistics - v1
    
    FROZEN: This endpoint signature will not change until 2045.
    Returns current state of offline tile and route caches.
    """
    # In production, query actual cache databases
    return OfflineCacheStatsV1(
        tiles_cached=0,
        routes_cached=0,
        total_size_bytes=0,
        last_update=datetime.utcnow().isoformat() + "Z"
    )


@router_v1.get("/settings", response_model=Dict[str, Any])
async def get_settings_v1():
    """
    Get application settings - v1
    
    FROZEN: This endpoint signature will not change until 2045.
    Returns stable configuration that persists across versions.
    """
    return {
        "api_version": "v1",
        "algorithms_available": ["dijkstra", "astar", "bfs"],
        "coordinate_system": "WGS84",
        "distance_unit": "meters",
        "time_unit": "seconds",
        "max_route_distance_km": 500,
        "compatibility_guaranteed_until": "2045-11-22"
    }


# =====================================================================
# VIC DOCUMENTATION
# =====================================================================

VIC_CONTRACT = """
VERSIONED INTERFACE CONTRACT (VIC) - v1

Effective: 2025-11-22
Expires: 2045-11-22 (20-year guarantee)

GUARANTEED STABILITY:
- All endpoint paths remain unchanged (/v1/*)
- All request schemas remain unchanged
- All response schemas remain unchanged
- All field types remain unchanged
- All field names remain unchanged

ALLOWED CHANGES:
- New optional fields may be added to responses
- New optional query parameters may be added
- New v2, v3, etc. APIs may be created (v1 stays frozen)
- Performance improvements (no API changes)
- Security patches (no API changes)

FORBIDDEN CHANGES:
- Removing any field
- Renaming any field
- Changing any field type
- Changing any field validation
- Removing any endpoint
- Changing endpoint paths
- Changing HTTP methods
- Breaking semantic meaning of responses

CLIENTS BUILT IN 2025 WILL WORK IN 2045 WITHOUT MODIFICATION.
"""


def get_vic_contract() -> str:
    """Return the VIC contract documentation"""
    return VIC_CONTRACT
