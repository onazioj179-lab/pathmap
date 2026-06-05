"""
V11 - Safe-Return Mode (HomeGuard Expansion)
Breadcrumb trail recording and safe-return path generation.
"""

from typing import List, Dict, Any, Optional
import time

class BreadcrumbTrail:
    """Records user's journey for safe return tracking."""
    
    def __init__(self):
        self.trail: List[Dict[str, Any]] = []
        self.journey_start: Optional[float] = None
        
    def start_journey(self):
        """Initialize a new journey."""
        self.trail = []
        self.journey_start = time.time()
        
    def add_breadcrumb(self, lat: float, lon: float, node_id: int, timestamp: Optional[float] = None):
        """Add a breadcrumb to the trail."""
        if timestamp is None:
            timestamp = time.time()
            
        self.trail.append({
            'lat': lat,
            'lon': lon,
            'node': node_id,
            'timestamp': timestamp,
            'elapsed': timestamp - (self.journey_start or timestamp)
        })
        
    def get_trail(self) -> List[Dict[str, Any]]:
        """Get the complete breadcrumb trail."""
        return self.trail
        
    def get_recent_trail(self, n: int = 50) -> List[Dict[str, Any]]:
        """Get the n most recent breadcrumbs."""
        return self.trail[-n:] if len(self.trail) > n else self.trail
        
    def clear_trail(self):
        """Clear the breadcrumb trail."""
        self.trail = []
        self.journey_start = None


class SafeReturnRouter:
    """Generates safe return paths using HomeGuard algorithm and breadcrumb memory."""
    
    def __init__(self, graph, home_guard_algo, landmarks_db=None):
        self.graph = graph
        self.home_guard = home_guard_algo
        self.landmarks_db = landmarks_db or {}
        self.breadcrumbs = BreadcrumbTrail()
        
    def start_tracking(self):
        """Start breadcrumb tracking for safe return."""
        self.breadcrumbs.start_journey()
        
    def track_position(self, lat: float, lon: float, node_id: int):
        """Track user's current position."""
        self.breadcrumbs.add_breadcrumb(lat, lon, node_id)
        
    def generate_return_home_path(self, current_lat: float, current_lon: float, 
                                   home_lat: float, home_lon: float) -> Dict[str, Any]:
        """
        Generate safe return path using HomeGuard (Dijkstra).
        This guarantees the shortest, most reliable path back.
        """
        try:
            # Use HomeGuard for guaranteed safe return
            path, visited, cost, steps = self.home_guard.find_route(
                current_lat, current_lon, home_lat, home_lon
            )
            
            return {
                'path': path,
                'visited': visited,
                'cost': cost,
                'steps': steps,
                'algorithm': 'HomeGuard',
                'safety_score': 1.0,  # HomeGuard always uses safest (shortest) path
                'breadcrumbs_used': len(self.breadcrumbs.get_trail())
            }
        except Exception as e:
            return {
                'error': str(e),
                'path': [],
                'cost': 0.0
            }
            
    def generate_safe_landmark_path(self, current_lat: float, current_lon: float) -> Dict[str, Any]:
        """
        Generate path to nearest safe landmark (police station, hospital, etc).
        """
        if not self.landmarks_db or 'safe' not in self.landmarks_db:
            # No landmarks, return empty
            return {
                'path': [],
                'message': 'No safe landmarks available',
                'landmark': None
            }
            
        safe_landmarks = self.landmarks_db.get('safe', [])
        if not safe_landmarks:
            return {
                'path': [],
                'message': 'No safe landmarks available',
                'landmark': None
            }
            
        # Find nearest safe landmark
        import math
        nearest_landmark = None
        min_distance = float('inf')
        
        for landmark in safe_landmarks:
            dist = math.hypot(
                landmark['lat'] - current_lat,
                landmark['lon'] - current_lon
            )
            if dist < min_distance:
                min_distance = dist
                nearest_landmark = landmark
                
        if nearest_landmark:
            # Route to landmark using HomeGuard
            path, visited, cost, steps = self.home_guard.find_route(
                current_lat, current_lon,
                nearest_landmark['lat'], nearest_landmark['lon']
            )
            
            return {
                'path': path,
                'visited': visited,
                'cost': cost,
                'steps': steps,
                'landmark': nearest_landmark,
                'algorithm': 'HomeGuard',
                'safety_score': 1.0
            }
            
        return {
            'path': [],
            'message': 'No landmarks found',
            'landmark': None
        }
        
    def get_breadcrumb_path(self) -> List[List[float]]:
        """Get the exact path user took (from breadcrumbs)."""
        return [[b['lat'], b['lon']] for b in self.breadcrumbs.get_trail()]
        
    def get_return_options(self, current_lat: float, current_lon: float,
                          home_lat: float, home_lon: float) -> Dict[str, Any]:
        """
        Get multiple safe return options:
        1. Direct return home (HomeGuard)
        2. Return via safe landmark
        3. Retrace breadcrumb trail
        """
        options = {}
        
        # Option 1: Direct return home
        direct_return = self.generate_return_home_path(current_lat, current_lon, home_lat, home_lon)
        options['direct_home'] = direct_return
        
        # Option 2: Via safe landmark
        landmark_return = self.generate_safe_landmark_path(current_lat, current_lon)
        options['via_landmark'] = landmark_return
        
        # Option 3: Breadcrumb trail
        breadcrumb_path = self.get_breadcrumb_path()
        if breadcrumb_path:
            # Reverse the breadcrumb trail for return
            options['retrace_steps'] = {
                'path': list(reversed(breadcrumb_path)),
                'cost': len(breadcrumb_path) * 10,  # Rough estimate
                'algorithm': 'BreadcrumbReverse',
                'safety_score': 0.95  # High safety (known path)
            }
        
        return options
