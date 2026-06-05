"""
V13 - Area Exploration with PathfinderX
Wide-radius scanning for interesting/safe/unfamiliar zones.
"""

from typing import List, Dict, Any
import math
import random


class ExplorationEngine:
    """Use PathfinderX for curiosity-driven area exploration."""
    
    def __init__(self, graph, pathfinder_x):
        self.graph = graph
        self.pathfinder_x = pathfinder_x
        self.visited_nodes = set()  # Track user's explored areas
        
    def scan_area(self, center_lat: float, center_lon: float, 
                 radius_km: float = 2.0) -> Dict[str, Any]:
        """
        Scan area around center point for interesting zones.
        
        Returns:
            {
                'interesting_zones': [{lat, lon, score, reason}],
                'safe_zones': [{lat, lon, score}],
                'unfamiliar_zones': [{lat, lon, familiarity_score}],
                'exploration_radius': radius_km
            }
        """
        interesting_zones = []
        safe_zones = []
        unfamiliar_zones = []
        
        # Sample points in a circle around center
        num_samples = 20
        for i in range(num_samples):
            angle = (2 * math.pi * i) / num_samples
            
            # Convert km to approximate lat/lon offset
            lat_offset = (radius_km / 111.0) * math.cos(angle)
            lon_offset = (radius_km / (111.0 * math.cos(math.radians(center_lat)))) * math.sin(angle)
            
            sample_lat = center_lat + lat_offset
            sample_lon = center_lon + lon_offset
            
            # PathfinderX explores to this point
            try:
                path, visited, cost, steps = self.pathfinder_x.find_route(
                    center_lat, center_lon, sample_lat, sample_lon
                )
                
                if path:
                    # Calculate zone properties
                    node_density = len(visited) / (cost + 1)  # nodes per meter
                    
                    # Interesting: high connectivity
                    if node_density > 0.05:
                        interesting_zones.append({
                            'lat': sample_lat,
                            'lon': sample_lon,
                            'score': node_density,
                            'reason': 'High connectivity area'
                        })
                    
                    # Safe: well-connected
                    if len(visited) > 50:
                        safe_zones.append({
                            'lat': sample_lat,
                            'lon': sample_lon,
                            'score': min(len(visited) / 100.0, 1.0)
                        })
                    
                    # Unfamiliar: not visited before
                    unfamiliar_count = sum(1 for n in visited if n not in self.visited_nodes)
                    if unfamiliar_count > len(visited) * 0.7:
                        unfamiliar_zones.append({
                            'lat': sample_lat,
                            'lon': sample_lon,
                            'familiarity_score': unfamiliar_count / len(visited)
                        })
                        
            except Exception:
                continue
                
        return {
            'interesting_zones': interesting_zones[:5],  # Top 5
            'safe_zones': safe_zones[:5],
            'unfamiliar_zones': unfamiliar_zones[:5],
            'exploration_radius': radius_km,
            'total_sampled': num_samples
        }
        
    def get_discovery_routes(self, start_lat: float, start_lon: float, 
                           num_routes: int = 3, max_distance_km: float = 3.0) -> List[Dict[str, Any]]:
        """
        Generate curiosity-driven discovery routes.
        
        Returns list of discovery paths:
            [{
                'path': [[lat, lon], ...],
                'cost': float,
                'discovery_score': float,
                'description': str
            }]
        """
        discovery_routes = []
        
        for i in range(num_routes):
            # Random direction
            angle = random.uniform(0, 2 * math.pi)
            distance_km = random.uniform(1.0, max_distance_km)
            
            # Calculate destination
            lat_offset = (distance_km / 111.0) * math.cos(angle)
            lon_offset = (distance_km / (111.0 * math.cos(math.radians(start_lat)))) * math.sin(angle)
            
            dest_lat = start_lat + lat_offset
            dest_lon = start_lon + lon_offset
            
            try:
                # Use PathfinderX for quick discovery
                path, visited, cost, steps = self.pathfinder_x.find_route(
                    start_lat, start_lon, dest_lat, dest_lon
                )
                
                if path:
                    # Calculate discovery score (unfamiliar nodes)
                    unfamiliar = sum(1 for n in visited if n not in self.visited_nodes)
                    discovery_score = unfamiliar / len(visited) if visited else 0
                    
                    descriptions = [
                        "Explore new neighborhood",
                        "Discover hidden paths",
                        "Venture into unknown territory"
                    ]
                    
                    discovery_routes.append({
                        'path': path,
                        'cost': cost,
                        'discovery_score': discovery_score,
                        'description': descriptions[i % len(descriptions)],
                        'unfamiliar_nodes': unfamiliar
                    })
                    
            except Exception:
                continue
                
        return sorted(discovery_routes, key=lambda x: x['discovery_score'], reverse=True)
        
    def mark_explored(self, node_ids: List[int]):
        """Mark nodes as explored (for familiarity tracking)."""
        self.visited_nodes.update(node_ids)
        
    def get_familiarity_score(self, node_ids: List[int]) -> float:
        """Calculate familiarity score for a route (0=unknown, 1=fully explored)."""
        if not node_ids:
            return 0.0
        familiar_count = sum(1 for n in node_ids if n in self.visited_nodes)
        return familiar_count / len(node_ids)
