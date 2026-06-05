"""
V12 - Friend Pickup Mode
Real-time meeting point calculation using ShadowPath.
"""

from typing import List, Dict, Any, Optional
import math


class FriendPickupRouter:
    """Calculate optimal meeting points between two moving users."""
    
    def __init__(self, graph, shadow_path_algo):
        self.graph = graph
        self.shadow_path = shadow_path_algo
        self.active_users = {}  # user_id -> {pos, timestamp, speed}
        
    def update_position(self, user_id: str, lat: float, lon: float, speed: float = 1.4):
        """Update user's real-time position."""
        import time
        self.active_users[user_id] = {
            'lat': lat,
            'lon': lon,
            'speed': speed,  # m/s
            'timestamp': time.time()
        }
        
    def calculate_meeting_point(self, user1_pos: List[float], user2_pos: List[float],
                               user1_speed: float = 1.4, user2_speed: float = 1.4) -> Dict[str, Any]:
        """
        Calculate optimal meeting point using ShadowPath.
        
        Algorithm:
        1. Sample potential meeting points along straight line between users
        2. For each point, calculate travel time for both users
        3. Select point that minimizes max(time1, time2)
        4. Generate paths using ShadowPath
        
        Args:
            user1_pos: [lat, lon] of user 1
            user2_pos: [lat, lon] of user 2
            user1_speed: Speed in m/s (default walking: 1.4 m/s)
            user2_speed: Speed in m/s
            
        Returns:
            {
                'meeting_point': [lat, lon],
                'user1_path': [[lat, lon], ...],
                'user2_path': [[lat, lon], ...],
                'eta_seconds': float,
                'user1_eta': float,
                'user2_eta': float,
                'distance_user1': float,
                'distance_user2': float
            }
        """
        # Sample 10 points along the line between users
        lat1, lon1 = user1_pos
        lat2, lon2 = user2_pos
        
        best_meeting_point = None
        min_wait_time = float('inf')
        best_paths = None
        
        for i in range(1, 10):  # Sample 10% to 90% along line
            t = i / 10.0
            sample_lat = lat1 + (lat2 - lat1) * t
            sample_lon = lon1 + (lon2 - lon1) * t
            
            try:
                # Route both users to this sample point
                path1, _, cost1, _ = self.shadow_path.find_route(lat1, lon1, sample_lat, sample_lon)
                path2, _, cost2, _ = self.shadow_path.find_route(lat2, lon2, sample_lat, sample_lon)
                
                if not path1 or not path2:
                    continue
                    
                # Calculate ETAs
                eta1 = cost1 / user1_speed
                eta2 = cost2 / user2_speed
                
                # Minimize maximum wait time
                wait_time = abs(eta1 - eta2)
                
                if wait_time < min_wait_time:
                    min_wait_time = wait_time
                    best_meeting_point = [sample_lat, sample_lon]
                    best_paths = {
                        'user1': path1,
                        'user2': path2,
                        'cost1': cost1,
                        'cost2': cost2,
                        'eta1': eta1,
                        'eta2': eta2
                    }
                    
            except Exception:
                continue
                
        if best_meeting_point and best_paths:
            return {
                'meeting_point': best_meeting_point,
                'user1_path': best_paths['user1'],
                'user2_path': best_paths['user2'],
                'eta_seconds': max(best_paths['eta1'], best_paths['eta2']),
                'user1_eta': best_paths['eta1'],
                'user2_eta': best_paths['eta2'],
                'distance_user1': best_paths['cost1'],
                'distance_user2': best_paths['cost2']
            }
        else:
            # Fallback: midpoint
            mid_lat = (lat1 + lat2) / 2
            mid_lon = (lon1 + lon2) / 2
            dist = math.hypot(lat2 - lat1, lon2 - lon1) * 111000 / 2
            
            return {
                'meeting_point': [mid_lat, mid_lon],
                'user1_path': [user1_pos, [mid_lat, mid_lon]],
                'user2_path': [user2_pos, [mid_lat, mid_lon]],
                'eta_seconds': dist / user1_speed,
                'user1_eta': dist / user1_speed,
                'user2_eta': dist / user2_speed,
                'distance_user1': dist,
                'distance_user2': dist,
                'note': 'Using midpoint fallback'
            }
            
    def get_live_eta(self, user1_id: str, user2_id: str) -> Optional[Dict[str, Any]]:
        """Get live ETA for actively tracked users."""
        if user1_id not in self.active_users or user2_id not in self.active_users:
            return None
            
        u1 = self.active_users[user1_id]
        u2 = self.active_users[user2_id]
        
        return self.calculate_meeting_point(
            [u1['lat'], u1['lon']],
            [u2['lat'], u2['lon']],
            u1['speed'],
            u2['speed']
        )
