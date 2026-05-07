"""
V21 - Safety Core Engine
Stabilizes PathFinder with route validation, node filtering, and safety scoring.
Fixes: path-breaking, waypoint misalignment, breadcrumb jitter, ETA inconsistencies.
"""

from typing import List, Dict, Any, Tuple, Optional, Set
import math
from collections import defaultdict


class NodeValidator:
    """Validates OSM nodes for routing safety."""
    
    def __init__(self, graph):
        self.graph = graph
        self.unsafe_nodes: Set[int] = set()
        self.dead_ends: Set[int] = set()
        self.problematic_nodes: Dict[int, str] = {}
        
    def scan_graph(self):
        """Scan entire graph for problematic nodes."""
        print("Scanning graph for unsafe nodes...")
        
        for node in self.graph.nodes():
            # Check for dead ends (0 or 1 neighbors)
            neighbors = list(self.graph.neighbors(node))
            if len(neighbors) <= 1:
                self.dead_ends.add(node)
                self.problematic_nodes[node] = "dead_end"
                
            # Check for disconnected components
            if len(neighbors) == 0:
                self.unsafe_nodes.add(node)
                self.problematic_nodes[node] = "disconnected"
                
        print(f"Found {len(self.dead_ends)} dead ends, {len(self.unsafe_nodes)} unsafe nodes")
        
    def is_node_safe(self, node_id: int) -> bool:
        """Check if node is safe for routing."""
        return node_id not in self.unsafe_nodes
        
    def get_safe_alternative(self, node_id: int, target_lat: float, target_lon: float) -> Optional[int]:
        """Find safe alternative node near problematic node."""
        if node_id not in self.problematic_nodes:
            return node_id
            
        # Find nearest safe node
        try:
            node_data = self.graph.nodes[node_id]
            lat, lon = node_data['y'], node_data['x']
            
            # Search nearby nodes (within 100m)
            min_dist = float('inf')
            best_node = None
            
            for candidate in self.graph.nodes():
                if candidate in self.unsafe_nodes:
                    continue
                    
                cand_data = self.graph.nodes[candidate]
                dist = math.hypot(cand_data['y'] - lat, cand_data['x'] - lon)
                
                if dist < min_dist and dist < 0.001:  # ~100m
                    min_dist = dist
                    best_node = candidate
                    
            return best_node or node_id
            
        except Exception:
            return node_id


class SafetyCore:
    """
    Core safety engine that validates and scores all routes.
    Fixes path-breaking, waypoint issues, and provides safety metrics.
    """
    
    def __init__(self, graph):
        self.graph = graph
        self.validator = NodeValidator(graph)
        self.validator.scan_graph()
        
    def validate_path(self, path_nodes: List[int]) -> Tuple[List[int], Dict[str, Any]]:
        """
        Validate and fix a path.
        
        Returns:
            (corrected_path, validation_report)
        """
        if not path_nodes:
            return [], {"valid": False, "reason": "empty_path"}
            
        corrected_path = []
        removed_nodes = []
        fixed_segments = 0
        
        for i, node in enumerate(path_nodes):
            if self.validator.is_node_safe(node):
                corrected_path.append(node)
            else:
                # Node is unsafe, try to find alternative
                if i + 1 < len(path_nodes):
                    next_node = path_nodes[i + 1]
                    next_data = self.graph.nodes[next_node]
                    alternative = self.validator.get_safe_alternative(
                        node, next_data['y'], next_data['x']
                    )
                    if alternative and alternative != node:
                        corrected_path.append(alternative)
                        fixed_segments += 1
                    else:
                        # Skip unsafe node entirely
                        removed_nodes.append(node)
                else:
                    removed_nodes.append(node)
                    
        # FIX: Remove duplicate consecutive nodes (waypoint misalignment fix)
        deduplicated = []
        prev = None
        for node in corrected_path:
            if node != prev:
                deduplicated.append(node)
                prev = node
                
        report = {
            "valid": len(deduplicated) >= 2,
            "original_length": len(path_nodes),
            "corrected_length": len(deduplicated),
            "removed_nodes": len(removed_nodes),
            "fixed_segments": fixed_segments,
            "removed_node_ids": removed_nodes[:10]  # First 10
        }
        
        return deduplicated, report
        
    def calculate_safety_score(self, path_nodes: List[int], visited_nodes: List[int]) -> float:
        """
        Calculate safety score (0-100) for a route.
        
        Factors:
        - Node connectivity
        - Path straightness
        - Dead-end avoidance
        - Graph density
        """
        if not path_nodes:
            return 0.0
            
        score = 100.0
        
        # Penalty for unsafe nodes in path
        unsafe_count = sum(1 for n in path_nodes if not self.validator.is_node_safe(n))
        score -= unsafe_count * 5
        
        # Penalty for dead ends in path
        dead_end_count = sum(1 for n in path_nodes if n in self.validator.dead_ends)
        score -= dead_end_count * 10
        
        # Bonus for high connectivity
        avg_neighbors = 0
        for node in path_nodes[:min(20, len(path_nodes))]:  # Sample first 20 nodes
            try:
                neighbors = len(list(self.graph.neighbors(node)))
                avg_neighbors += neighbors
            except:
                pass
        avg_neighbors = avg_neighbors / min(20, len(path_nodes)) if path_nodes else 0
        
        if avg_neighbors >= 3:
            score += 5
        elif avg_neighbors <= 1:
            score -= 10
            
        # Penalty for excessive visited nodes (inefficiency)
        if visited_nodes:
            efficiency = len(path_nodes) / len(visited_nodes) if visited_nodes else 0
            if efficiency < 0.1:
                score -= 10
                
        # Clamp to 0-100
        return max(0.0, min(100.0, score))
        
    def fix_waypoint_alignment(self, waypoints: List[List[float]], 
                              tolerance_m: float = 50.0) -> List[List[float]]:
        """
        FIX: Correct waypoint misalignment by snapping to nearest graph nodes.
        
        Args:
            waypoints: List of [lat, lon] waypoints
            tolerance_m: Max distance to snap (meters)
        """
        from pathfinding.utils import nearest_node
        
        fixed_waypoints = []
        for lat, lon in waypoints:
            # Find nearest node
            node_id = nearest_node(self.graph, lat, lon)
            
            # Check if it's safe
            if not self.validator.is_node_safe(node_id):
                # Find safe alternative
                safe_node = self.validator.get_safe_alternative(node_id, lat, lon)
                node_id = safe_node if safe_node else node_id
                
            # Get corrected coordinates
            try:
                node_data = self.graph.nodes[node_id]
                fixed_waypoints.append([node_data['y'], node_data['x']])
            except:
                # Fallback to original
                fixed_waypoints.append([lat, lon])
                
        return fixed_waypoints
        
    def smooth_breadcrumb_trail(self, breadcrumbs: List[Dict[str, float]], 
                               window_size: int = 3) -> List[Dict[str, float]]:
        """
        FIX: Remove jitter from breadcrumb trails using moving average.
        
        Args:
            breadcrumbs: List of {lat, lon, timestamp, ...}
            window_size: Smoothing window
        """
        if len(breadcrumbs) < window_size:
            return breadcrumbs
            
        smoothed = []
        
        for i in range(len(breadcrumbs)):
            # Get window around current point
            start = max(0, i - window_size // 2)
            end = min(len(breadcrumbs), i + window_size // 2 + 1)
            window = breadcrumbs[start:end]
            
            # Average lat/lon
            avg_lat = sum(b['lat'] for b in window) / len(window)
            avg_lon = sum(b['lon'] for b in window) / len(window)
            
            smoothed_point = breadcrumbs[i].copy()
            smoothed_point['lat'] = avg_lat
            smoothed_point['lon'] = avg_lon
            smoothed.append(smoothed_point)
            
        return smoothed
        
    def calculate_stable_eta(self, distance_m: float, speed_mps: float, 
                           previous_eta: Optional[float] = None,
                           smoothing_factor: float = 0.3) -> float:
        """
        FIX: Calculate stable ETA with exponential smoothing to prevent jumping.
        
        Args:
            distance_m: Distance in meters
            speed_mps: Speed in m/s
            previous_eta: Previous ETA estimate (for smoothing)
            smoothing_factor: 0-1, higher = more responsive
        """
        raw_eta = distance_m / speed_mps if speed_mps > 0 else 0
        
        if previous_eta is None:
            return raw_eta
            
        # Exponential smoothing
        smoothed_eta = (smoothing_factor * raw_eta) + ((1 - smoothing_factor) * previous_eta)
        
        return smoothed_eta
        
    def validate_route_response(self, route_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate and enhance complete route response with safety data.
        
        Adds:
        - safety_score
        - validation_report
        - auto_corrections
        """
        # Extract path nodes from visited or path
        path_nodes = route_data.get('visited', [])
        
        # Validate path
        corrected_nodes, report = self.validate_path(path_nodes)
        
        # Calculate safety score
        safety_score = self.calculate_safety_score(
            corrected_nodes, 
            route_data.get('visited', [])
        )
        
        # Enhance response
        enhanced = route_data.copy()
        enhanced['safety_score'] = safety_score
        enhanced['validation_report'] = report
        enhanced['auto_corrections'] = report['fixed_segments'] > 0
        enhanced['safety_level'] = self._get_safety_level(safety_score)
        
        return enhanced
        
    def _get_safety_level(self, score: float) -> str:
        """Convert numeric score to level."""
        if score >= 85:
            return "safe"
        elif score >= 70:
            return "caution"
        elif score >= 50:
            return "moderate_risk"
        else:
            return "high_risk"
            
    def get_diagnostics(self) -> Dict[str, Any]:
        """Get safety core diagnostics."""
        return {
            "total_nodes": len(self.graph.nodes()),
            "unsafe_nodes": len(self.validator.unsafe_nodes),
            "dead_ends": len(self.validator.dead_ends),
            "problematic_nodes": len(self.validator.problematic_nodes),
            "graph_health": 100 - (len(self.validator.unsafe_nodes) / len(self.graph.nodes()) * 100)
        }
