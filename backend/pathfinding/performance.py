# V7: High-Performance Optimizations

from typing import Any, Tuple, List, Optional
from functools import lru_cache
import hashlib


class RouteCache:
    """LRU cache for route results."""
    
    def __init__(self, max_size: int = 100):
        self.cache = {}
        self.max_size = max_size
        self.access_order = []
    
    def _make_key(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, algo: str) -> str:
        """Generate cache key from coordinates and algorithm."""
        coords_str = f"{start_lat:.6f},{start_lon:.6f},{end_lat:.6f},{end_lon:.6f},{algo}"
        return hashlib.md5(coords_str.encode()).hexdigest()
    
    def get(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, algo: str) -> Optional[Any]:
        """Retrieve cached route."""
        key = self._make_key(start_lat, start_lon, end_lat, end_lon, algo)
        if key in self.cache:
            # Move to end (most recently used)
            self.access_order.remove(key)
            self.access_order.append(key)
            return self.cache[key]
        return None
    
    def put(self, start_lat: float, start_lon: float, end_lat: float, end_lon: float, algo: str, value: Any):
        """Store route in cache."""
        key = self._make_key(start_lat, start_lon, end_lat, end_lon, algo)
        
        if key in self.cache:
            self.access_order.remove(key)
        elif len(self.cache) >= self.max_size:
            # Evict least recently used
            oldest = self.access_order.pop(0)
            del self.cache[oldest]
        
        self.cache[key] = value
        self.access_order.append(key)
    
    def clear(self):
        """Clear all cached routes."""
        self.cache.clear()
        self.access_order.clear()


class SpatialIndex:
    """Simple quad-tree spatial index for fast node lookup."""
    
    def __init__(self, graph: Any):
        self.graph = graph
        self.bounds = self._calculate_bounds()
        self.index = {}
        self._build_index()
    
    def _calculate_bounds(self) -> Tuple[float, float, float, float]:
        """Calculate bounding box of graph."""
        lats = [data['y'] for _, data in self.graph.nodes(data=True)]
        lons = [data['x'] for _, data in self.graph.nodes(data=True)]
        return (min(lats), min(lons), max(lats), max(lons))
    
    def _build_index(self):
        """Build spatial index with grid cells."""
        min_lat, min_lon, max_lat, max_lon = self.bounds
        grid_size = 20  # 20x20 grid
        
        lat_step = (max_lat - min_lat) / grid_size
        lon_step = (max_lon - min_lon) / grid_size
        
        for node, data in self.graph.nodes(data=True):
            lat, lon = data['y'], data['x']
            
            cell_i = int((lat - min_lat) / lat_step) if lat_step > 0 else 0
            cell_j = int((lon - min_lon) / lon_step) if lon_step > 0 else 0
            
            cell_i = min(cell_i, grid_size - 1)
            cell_j = min(cell_j, grid_size - 1)
            
            cell_key = (cell_i, cell_j)
            if cell_key not in self.index:
                self.index[cell_key] = []
            self.index[cell_key].append(node)
    
    def nearest_node_fast(self, lat: float, lon: float) -> Any:
        """Fast nearest node lookup using spatial index."""
        min_lat, min_lon, max_lat, max_lon = self.bounds
        grid_size = 20
        
        lat_step = (max_lat - min_lat) / grid_size
        lon_step = (max_lon - min_lon) / grid_size
        
        if lat_step == 0 or lon_step == 0:
            return list(self.graph.nodes())[0] if self.graph.nodes() else None
        
        cell_i = int((lat - min_lat) / lat_step)
        cell_j = int((lon - min_lon) / lon_step)
        
        cell_i = max(0, min(cell_i, grid_size - 1))
        cell_j = max(0, min(cell_j, grid_size - 1))
        
        # Search current cell and neighbors
        candidates = []
        for di in [-1, 0, 1]:
            for dj in [-1, 0, 1]:
                ni, nj = cell_i + di, cell_j + dj
                if 0 <= ni < grid_size and 0 <= nj < grid_size:
                    candidates.extend(self.index.get((ni, nj), []))
        
        if not candidates:
            return list(self.graph.nodes())[0] if self.graph.nodes() else None
        
        # Find closest among candidates
        import math
        min_dist = float('inf')
        nearest = candidates[0]
        
        for node in candidates:
            data = self.graph.nodes[node]
            dist = math.hypot(data['y'] - lat, data['x'] - lon)
            if dist < min_dist:
                min_dist = dist
                nearest = node
        
        return nearest


def create_high_speed_steps(visited: List[int], graph: Any, sample_rate: int = 10) -> List[dict]:
    """Create downsampled steps for high-speed mode."""
    steps = []
    for i, node in enumerate(visited):
        if i % sample_rate == 0 or i == len(visited) - 1:
            data = graph.nodes[node]
            steps.append({"node": int(node), "lat": float(data['y']), "lon": float(data['x'])})
    return steps
