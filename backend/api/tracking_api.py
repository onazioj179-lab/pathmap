"""
PATHMAP V94 - Precision Tracking API

REST and WebSocket endpoints for real-time precision tracking with:
- Multi-sensor fusion processing
- Trail data streaming
- Calibration management
- Tracking statistics
"""

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json
import asyncio

from location.precision_tracking_engine import (
    get_precision_tracking_engine,
    SensorReading,
    TrackedPosition
)

router_tracking = APIRouter(prefix="/api/v1/tracking", tags=["Precision Tracking"])

# Alias for backward compatibility with main.py
router = router_tracking


class SensorReadingRequest(BaseModel):
    timestamp: float
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    gps_accuracy: Optional[float] = None
    gps_altitude: Optional[float] = None
    gps_speed: Optional[float] = None
    gps_heading: Optional[float] = None
    compass_heading: Optional[float] = None
    compass_accuracy: Optional[float] = None
    accel_x: Optional[float] = None
    accel_y: Optional[float] = None
    accel_z: Optional[float] = None
    gyro_alpha: Optional[float] = None
    gyro_beta: Optional[float] = None
    gyro_gamma: Optional[float] = None
    satellite_count: Optional[int] = None
    hdop: Optional[float] = None


class CalibrationRequest(BaseModel):
    magnetic_declination: Optional[float] = None


class TargetTrackingRequest(BaseModel):
    target_id: str
    precision: str = "high"  # high, medium, low


# Active WebSocket connections for real-time updates
active_connections: Dict[str, WebSocket] = {}


@router_tracking.post("/start")
async def start_tracking():
    """Start precision tracking session"""
    engine = get_precision_tracking_engine()
    result = engine.start_tracking()
    return result


@router_tracking.post("/stop")
async def stop_tracking():
    """Stop tracking and get session statistics"""
    engine = get_precision_tracking_engine()
    result = engine.stop_tracking()
    return result


@router_tracking.post("/update")
async def process_sensor_update(reading: SensorReadingRequest):
    """
    Process a sensor reading and return fused position
    
    This endpoint accepts raw sensor data from the device and returns
    the Kalman-filtered fused position with confidence metrics.
    """
    engine = get_precision_tracking_engine()
    
    sensor_reading = SensorReading(
        timestamp=reading.timestamp,
        gps_lat=reading.gps_lat,
        gps_lon=reading.gps_lon,
        gps_accuracy=reading.gps_accuracy,
        gps_altitude=reading.gps_altitude,
        gps_speed=reading.gps_speed,
        gps_heading=reading.gps_heading,
        compass_heading=reading.compass_heading,
        compass_accuracy=reading.compass_accuracy,
        accel_x=reading.accel_x,
        accel_y=reading.accel_y,
        accel_z=reading.accel_z,
        gyro_alpha=reading.gyro_alpha,
        gyro_beta=reading.gyro_beta,
        gyro_gamma=reading.gyro_gamma,
        satellite_count=reading.satellite_count,
        hdop=reading.hdop
    )
    
    position = engine.process_sensor_reading(sensor_reading)
    
    if position is None:
        raise HTTPException(status_code=400, detail="Tracking not active")
    
    return {
        "success": True,
        "position": position.to_dict()
    }


@router_tracking.get("/position")
async def get_current_position():
    """Get the current fused position"""
    engine = get_precision_tracking_engine()
    position = engine.get_current_position()
    
    if position is None:
        return {
            "success": False,
            "position": None,
            "message": "No position available"
        }
    
    return {
        "success": True,
        "position": position.to_dict()
    }


@router_tracking.get("/trail")
async def get_tracking_trail(smoothed: bool = True):
    """Get the tracking trail for map visualization"""
    engine = get_precision_tracking_engine()
    trail = engine.get_trail(smoothed=smoothed)
    
    return {
        "success": True,
        "trail": trail,
        "point_count": len(trail)
    }


@router_tracking.get("/stats")
async def get_tracking_stats():
    """Get current tracking statistics"""
    engine = get_precision_tracking_engine()
    stats = engine.get_tracking_stats()
    return {
        "success": True,
        "stats": stats
    }


@router_tracking.post("/calibration/declination")
async def set_magnetic_declination(request: CalibrationRequest):
    """Set magnetic declination for compass correction"""
    engine = get_precision_tracking_engine()
    
    if request.magnetic_declination is not None:
        engine.set_magnetic_declination(request.magnetic_declination)
        return {
            "success": True,
            "message": f"Magnetic declination set to {request.magnetic_declination} degrees"
        }
    
    raise HTTPException(status_code=400, detail="magnetic_declination required")


@router_tracking.post("/calibration/reset")
async def reset_calibration():
    """Reset all calibration data"""
    engine = get_precision_tracking_engine()
    engine.reset_calibration()
    return {
        "success": True,
        "message": "Calibration reset to defaults"
    }


@router_tracking.websocket("/ws")
async def tracking_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time tracking updates
    
    Clients connect to receive continuous position updates at 20Hz.
    Send sensor data to process, receive fused positions back.
    """
    await websocket.accept()
    connection_id = str(id(websocket))
    active_connections[connection_id] = websocket
    
    engine = get_precision_tracking_engine()
    
    try:
        while True:
            # Receive sensor data from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "sensor_update":
                reading_data = message.get("data", {})
                
                sensor_reading = SensorReading(
                    timestamp=reading_data.get("timestamp", 0),
                    gps_lat=reading_data.get("gps_lat"),
                    gps_lon=reading_data.get("gps_lon"),
                    gps_accuracy=reading_data.get("gps_accuracy"),
                    gps_altitude=reading_data.get("gps_altitude"),
                    gps_speed=reading_data.get("gps_speed"),
                    gps_heading=reading_data.get("gps_heading"),
                    compass_heading=reading_data.get("compass_heading"),
                    compass_accuracy=reading_data.get("compass_accuracy"),
                    accel_x=reading_data.get("accel_x"),
                    accel_y=reading_data.get("accel_y"),
                    accel_z=reading_data.get("accel_z"),
                    gyro_alpha=reading_data.get("gyro_alpha"),
                    gyro_beta=reading_data.get("gyro_beta"),
                    gyro_gamma=reading_data.get("gyro_gamma"),
                    satellite_count=reading_data.get("satellite_count"),
                    hdop=reading_data.get("hdop")
                )
                
                position = engine.process_sensor_reading(sensor_reading)
                
                if position:
                    await websocket.send_json({
                        "type": "position_update",
                        "data": position.to_dict()
                    })
            
            elif message.get("type") == "get_trail":
                trail = engine.get_trail(smoothed=True)
                await websocket.send_json({
                    "type": "trail_update",
                    "data": trail
                })
            
            elif message.get("type") == "get_stats":
                stats = engine.get_tracking_stats()
                await websocket.send_json({
                    "type": "stats_update",
                    "data": stats
                })
            
            elif message.get("type") == "start":
                result = engine.start_tracking()
                await websocket.send_json({
                    "type": "tracking_started",
                    "data": result
                })
            
            elif message.get("type") == "stop":
                result = engine.stop_tracking()
                await websocket.send_json({
                    "type": "tracking_stopped",
                    "data": result
                })
                
    except WebSocketDisconnect:
        pass
    finally:
        if connection_id in active_connections:
            del active_connections[connection_id]


# Broadcast position to all connected clients
async def broadcast_position(position: TrackedPosition):
    """Broadcast position update to all WebSocket clients"""
    if not active_connections:
        return
    
    message = {
        "type": "position_broadcast",
        "data": position.to_dict()
    }
    
    for connection_id, websocket in list(active_connections.items()):
        try:
            await websocket.send_json(message)
        except Exception:
            if connection_id in active_connections:
                del active_connections[connection_id]
