"""
PathMap Polygon Geofence Engine

Supports both circular and polygon geofences with efficient point-in-polygon testing.
Uses ray casting algorithm for polygon containment checks.
"""

import math
import json
import sqlite3
import logging
from typing import List, Dict, Any, Tuple, Optional, Union
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import os

logger = logging.getLogger(__name__)


class GeofenceType(str, Enum):
    """Type of geofence."""
    CIRCLE = "circle"
    POLYGON = "polygon"


class TriggerType(str, Enum):
    """When to trigger alerts."""
    ENTER = "enter"
    EXIT = "exit"
    BOTH = "both"


@dataclass
class Point:
    """A geographic point."""
    lat: float
    lon: float
    
    def to_tuple(self) -> Tuple[float, float]:
        return (self.lat, self.lon)


@dataclass
class CircleGeofence:
    """Circular geofence definition."""
    center: Point
    radius_m: float
    
    def contains(self, point: Point) -> bool:
        """Check if point is inside circle using Haversine distance."""
        distance = haversine_distance(
            self.center.lat, self.center.lon,
            point.lat, point.lon
        )
        return distance <= self.radius_m


@dataclass
class PolygonGeofence:
    """Polygon geofence definition."""
    vertices: List[Point]
    
    def contains(self, point: Point) -> bool:
        """
        Check if point is inside polygon using ray casting algorithm.
        
        Casts a ray from the point to infinity (eastward) and counts
        how many edges it crosses. Odd count = inside, even = outside.
        """
        if len(self.vertices) < 3:
            return False
            
        n = len(self.vertices)
        inside = False
        
        j = n - 1
        for i in range(n):
            vi = self.vertices[i]
            vj = self.vertices[j]
            
            # Check if the ray crosses this edge
            if ((vi.lat > point.lat) != (vj.lat > point.lat)) and \
               (point.lon < (vj.lon - vi.lon) * (point.lat - vi.lat) / (vj.lat - vi.lat) + vi.lon):
                inside = not inside
                
            j = i
            
        return inside
    
    def to_geojson(self) -> Dict[str, Any]:
        """Convert to GeoJSON format."""
        # Close the polygon by repeating first vertex
        coords = [[p.lon, p.lat] for p in self.vertices]
        if coords and coords[0] != coords[-1]:
            coords.append(coords[0])
            
        return {
            "type": "Polygon",
            "coordinates": [coords]
        }
    
    @classmethod
    def from_geojson(cls, geojson: Dict[str, Any]) -> "PolygonGeofence":
        """Create from GeoJSON format."""
        coords = geojson.get("coordinates", [[]])[0]
        vertices = [Point(lat=c[1], lon=c[0]) for c in coords[:-1]]  # Exclude closing vertex
        return cls(vertices=vertices)


@dataclass
class Geofence:
    """Complete geofence with metadata."""
    id: str
    user_id: str
    name: str
    geofence_type: GeofenceType
    circle: Optional[CircleGeofence] = None
    polygon: Optional[PolygonGeofence] = None
    trigger: TriggerType = TriggerType.BOTH
    is_active: bool = True
    color: str = "#4285f4"
    description: str = ""
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    def contains(self, point: Point) -> bool:
        """Check if point is inside geofence."""
        if self.geofence_type == GeofenceType.CIRCLE and self.circle:
            return self.circle.contains(point)
        elif self.geofence_type == GeofenceType.POLYGON and self.polygon:
            return self.polygon.contains(point)
        return False
    
    def get_bounding_box(self) -> Tuple[float, float, float, float]:
        """
        Get bounding box (min_lat, min_lon, max_lat, max_lon).
        Used for spatial indexing optimization.
        """
        if self.geofence_type == GeofenceType.CIRCLE and self.circle:
            # Approximate bounding box for circle
            lat_delta = self.circle.radius_m / 111320  # meters to degrees
            lon_delta = self.circle.radius_m / (111320 * math.cos(math.radians(self.circle.center.lat)))
            return (
                self.circle.center.lat - lat_delta,
                self.circle.center.lon - lon_delta,
                self.circle.center.lat + lat_delta,
                self.circle.center.lon + lon_delta,
            )
        elif self.geofence_type == GeofenceType.POLYGON and self.polygon:
            lats = [v.lat for v in self.polygon.vertices]
            lons = [v.lon for v in self.polygon.vertices]
            return (min(lats), min(lons), max(lats), max(lons))
        return (0, 0, 0, 0)


@dataclass
class GeofenceAlert:
    """Alert triggered by geofence."""
    id: str
    geofence_id: str
    device_id: str
    alert_type: str  # "enter" or "exit"
    lat: float
    lon: float
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two points using Haversine formula.
    Returns distance in meters.
    """
    R = 6371000  # Earth's radius in meters
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


class PolygonGeofenceEngine:
    """
    Geofence management engine supporting circles and polygons.
    
    Features:
    - Create/update/delete geofences (circle or polygon)
    - Efficient containment checking
    - Alert generation on enter/exit
    - SQLite persistence
    - Bounding box optimization for large geofence sets
    """
    
    def __init__(self, db_path: str = None):
        if db_path is None:
            db_path = os.path.join(
                os.path.dirname(__file__), 
                "..", "data", "geofences.db"
            )
        self.db_path = db_path
        self._init_db()
        
        # In-memory cache for active geofences
        self.geofences: Dict[str, Geofence] = {}
        self._load_geofences()
        
        # Track device states for enter/exit detection
        self.device_states: Dict[str, Dict[str, bool]] = {}  # device_id -> geofence_id -> inside
        
    def _init_db(self):
        """Initialize SQLite database."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.executescript("""
            CREATE TABLE IF NOT EXISTS geofences (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                geofence_type TEXT NOT NULL,
                center_lat REAL,
                center_lon REAL,
                radius_m REAL,
                polygon_json TEXT,
                trigger_type TEXT DEFAULT 'both',
                is_active INTEGER DEFAULT 1,
                color TEXT DEFAULT '#4285f4',
                description TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS geofence_alerts (
                id TEXT PRIMARY KEY,
                geofence_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                alert_type TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE CASCADE
            );
            
            CREATE INDEX IF NOT EXISTS idx_geofences_user ON geofences(user_id);
            CREATE INDEX IF NOT EXISTS idx_geofences_active ON geofences(is_active);
            CREATE INDEX IF NOT EXISTS idx_alerts_geofence ON geofence_alerts(geofence_id);
            CREATE INDEX IF NOT EXISTS idx_alerts_device ON geofence_alerts(device_id);
            CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON geofence_alerts(timestamp);
        """)
        
        conn.commit()
        conn.close()
        logger.info(f"Geofence database initialized at {self.db_path}")
        
    def _load_geofences(self):
        """Load active geofences from database."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, user_id, name, geofence_type, center_lat, center_lon, 
                   radius_m, polygon_json, trigger_type, is_active, color, 
                   description, created_at
            FROM geofences WHERE is_active = 1
        """)
        
        for row in cursor.fetchall():
            geofence = self._row_to_geofence(row)
            self.geofences[geofence.id] = geofence
            
        conn.close()
        logger.info(f"Loaded {len(self.geofences)} active geofences")
        
    def _row_to_geofence(self, row) -> Geofence:
        """Convert database row to Geofence object."""
        (id, user_id, name, geofence_type, center_lat, center_lon,
         radius_m, polygon_json, trigger_type, is_active, color,
         description, created_at) = row
         
        circle = None
        polygon = None
        
        if geofence_type == "circle":
            circle = CircleGeofence(
                center=Point(lat=center_lat, lon=center_lon),
                radius_m=radius_m
            )
        elif geofence_type == "polygon" and polygon_json:
            geojson = json.loads(polygon_json)
            polygon = PolygonGeofence.from_geojson(geojson)
            
        return Geofence(
            id=id,
            user_id=user_id,
            name=name,
            geofence_type=GeofenceType(geofence_type),
            circle=circle,
            polygon=polygon,
            trigger=TriggerType(trigger_type),
            is_active=bool(is_active),
            color=color,
            description=description,
            created_at=datetime.fromisoformat(created_at),
        )
        
    def create_circle_geofence(
        self,
        user_id: str,
        name: str,
        center_lat: float,
        center_lon: float,
        radius_m: float,
        trigger: TriggerType = TriggerType.BOTH,
        color: str = "#4285f4",
        description: str = "",
    ) -> Geofence:
        """Create a circular geofence."""
        import uuid
        
        geofence_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        geofence = Geofence(
            id=geofence_id,
            user_id=user_id,
            name=name,
            geofence_type=GeofenceType.CIRCLE,
            circle=CircleGeofence(
                center=Point(lat=center_lat, lon=center_lon),
                radius_m=radius_m
            ),
            trigger=trigger,
            color=color,
            description=description,
            created_at=now,
        )
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO geofences 
            (id, user_id, name, geofence_type, center_lat, center_lon, radius_m,
             trigger_type, color, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            geofence_id, user_id, name, "circle", center_lat, center_lon, radius_m,
            trigger.value, color, description, now.isoformat(), now.isoformat()
        ))
        
        conn.commit()
        conn.close()
        
        self.geofences[geofence_id] = geofence
        logger.info(f"Created circle geofence {name} (r={radius_m}m) for user {user_id}")
        
        return geofence
        
    def create_polygon_geofence(
        self,
        user_id: str,
        name: str,
        vertices: List[Tuple[float, float]],  # List of (lat, lon)
        trigger: TriggerType = TriggerType.BOTH,
        color: str = "#4285f4",
        description: str = "",
    ) -> Geofence:
        """
        Create a polygon geofence.
        
        Args:
            user_id: Owner user ID
            name: Geofence name
            vertices: List of (lat, lon) tuples defining the polygon
            trigger: When to trigger alerts
            color: Display color
            description: Optional description
            
        Returns:
            Created Geofence object
        """
        if len(vertices) < 3:
            raise ValueError("Polygon must have at least 3 vertices")
            
        import uuid
        
        geofence_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        polygon = PolygonGeofence(
            vertices=[Point(lat=v[0], lon=v[1]) for v in vertices]
        )
        
        geofence = Geofence(
            id=geofence_id,
            user_id=user_id,
            name=name,
            geofence_type=GeofenceType.POLYGON,
            polygon=polygon,
            trigger=trigger,
            color=color,
            description=description,
            created_at=now,
        )
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO geofences 
            (id, user_id, name, geofence_type, polygon_json,
             trigger_type, color, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            geofence_id, user_id, name, "polygon", json.dumps(polygon.to_geojson()),
            trigger.value, color, description, now.isoformat(), now.isoformat()
        ))
        
        conn.commit()
        conn.close()
        
        self.geofences[geofence_id] = geofence
        logger.info(f"Created polygon geofence {name} ({len(vertices)} vertices) for user {user_id}")
        
        return geofence
        
    def delete_geofence(self, geofence_id: str) -> bool:
        """Delete a geofence."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("DELETE FROM geofences WHERE id = ?", (geofence_id,))
        cursor.execute("DELETE FROM geofence_alerts WHERE geofence_id = ?", (geofence_id,))
        
        conn.commit()
        conn.close()
        
        if geofence_id in self.geofences:
            del self.geofences[geofence_id]
            logger.info(f"Deleted geofence {geofence_id}")
            return True
            
        return False
        
    def check_location(
        self, 
        device_id: str, 
        lat: float, 
        lon: float,
        user_id: str = None,
    ) -> List[GeofenceAlert]:
        """
        Check location against all geofences and generate alerts.
        
        Args:
            device_id: Device identifier
            lat: Current latitude
            lon: Current longitude
            user_id: Optional - only check geofences for this user
            
        Returns:
            List of generated alerts
        """
        point = Point(lat=lat, lon=lon)
        alerts = []
        
        # Initialize device state if needed
        if device_id not in self.device_states:
            self.device_states[device_id] = {}
            
        # Check each geofence
        for gf_id, geofence in self.geofences.items():
            # Filter by user if specified
            if user_id and geofence.user_id != user_id:
                continue
                
            if not geofence.is_active:
                continue
                
            # Quick bounding box check for optimization
            bbox = geofence.get_bounding_box()
            if not (bbox[0] <= lat <= bbox[2] and bbox[1] <= lon <= bbox[3]):
                # Outside bounding box - definitely not inside polygon
                currently_inside = False
            else:
                currently_inside = geofence.contains(point)
            
            # Get previous state
            was_inside = self.device_states[device_id].get(gf_id, None)
            
            # Update state
            self.device_states[device_id][gf_id] = currently_inside
            
            # Generate alert if state changed
            if was_inside is not None and was_inside != currently_inside:
                if currently_inside and geofence.trigger in (TriggerType.ENTER, TriggerType.BOTH):
                    alert = self._create_alert(geofence, device_id, "enter", lat, lon)
                    alerts.append(alert)
                elif not currently_inside and geofence.trigger in (TriggerType.EXIT, TriggerType.BOTH):
                    alert = self._create_alert(geofence, device_id, "exit", lat, lon)
                    alerts.append(alert)
                    
        return alerts
        
    def _create_alert(
        self, 
        geofence: Geofence, 
        device_id: str, 
        alert_type: str,
        lat: float,
        lon: float,
    ) -> GeofenceAlert:
        """Create and persist an alert."""
        import uuid
        
        alert_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        alert = GeofenceAlert(
            id=alert_id,
            geofence_id=geofence.id,
            device_id=device_id,
            alert_type=alert_type,
            lat=lat,
            lon=lon,
            timestamp=now,
        )
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO geofence_alerts (id, geofence_id, device_id, alert_type, lat, lon, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (alert_id, geofence.id, device_id, alert_type, lat, lon, now.isoformat()))
        
        conn.commit()
        conn.close()
        
        logger.info(f"Geofence alert: {alert_type} {geofence.name} (device {device_id})")
        
        return alert
        
    def get_geofences_for_user(self, user_id: str) -> List[Geofence]:
        """Get all geofences for a user."""
        return [gf for gf in self.geofences.values() if gf.user_id == user_id]
        
    def get_alerts(
        self, 
        geofence_id: str = None, 
        device_id: str = None,
        limit: int = 100,
    ) -> List[GeofenceAlert]:
        """Get recent alerts, optionally filtered."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        query = "SELECT id, geofence_id, device_id, alert_type, lat, lon, timestamp FROM geofence_alerts"
        params = []
        conditions = []
        
        if geofence_id:
            conditions.append("geofence_id = ?")
            params.append(geofence_id)
        if device_id:
            conditions.append("device_id = ?")
            params.append(device_id)
            
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
            
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, params)
        
        alerts = []
        for row in cursor.fetchall():
            alerts.append(GeofenceAlert(
                id=row[0],
                geofence_id=row[1],
                device_id=row[2],
                alert_type=row[3],
                lat=row[4],
                lon=row[5],
                timestamp=datetime.fromisoformat(row[6]),
            ))
            
        conn.close()
        return alerts
        
    def to_geojson_collection(self, user_id: str = None) -> Dict[str, Any]:
        """
        Export geofences as GeoJSON FeatureCollection.
        Useful for map display.
        """
        features = []
        
        for geofence in self.geofences.values():
            if user_id and geofence.user_id != user_id:
                continue
                
            if geofence.geofence_type == GeofenceType.POLYGON and geofence.polygon:
                geometry = geofence.polygon.to_geojson()
            elif geofence.geofence_type == GeofenceType.CIRCLE and geofence.circle:
                # Approximate circle as polygon for GeoJSON
                geometry = self._circle_to_polygon_geojson(geofence.circle)
            else:
                continue
                
            features.append({
                "type": "Feature",
                "id": geofence.id,
                "properties": {
                    "name": geofence.name,
                    "type": geofence.geofence_type.value,
                    "color": geofence.color,
                    "trigger": geofence.trigger.value,
                },
                "geometry": geometry,
            })
            
        return {
            "type": "FeatureCollection",
            "features": features,
        }
        
    def _circle_to_polygon_geojson(self, circle: CircleGeofence, num_points: int = 32) -> Dict[str, Any]:
        """Approximate circle as polygon for GeoJSON export."""
        coords = []
        for i in range(num_points):
            angle = 2 * math.pi * i / num_points
            lat_delta = circle.radius_m / 111320 * math.sin(angle)
            lon_delta = circle.radius_m / (111320 * math.cos(math.radians(circle.center.lat))) * math.cos(angle)
            coords.append([
                circle.center.lon + lon_delta,
                circle.center.lat + lat_delta,
            ])
        coords.append(coords[0])  # Close polygon
        
        return {
            "type": "Polygon",
            "coordinates": [coords],
        }


# Global instance
_geofence_engine: Optional[PolygonGeofenceEngine] = None


def get_geofence_engine() -> PolygonGeofenceEngine:
    """Get global geofence engine instance."""
    global _geofence_engine
    if _geofence_engine is None:
        _geofence_engine = PolygonGeofenceEngine()
    return _geofence_engine
