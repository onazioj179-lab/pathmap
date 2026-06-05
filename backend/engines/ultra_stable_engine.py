"""
PATHFINDER V53 - ULTRA STABLE ENGINE (USE)

Pure routing algorithms designed for 20+ year stability.
Zero external dependencies except Python stdlib and minimal NetworkX for graph structures.

Algorithms:
- Dijkstra (primary) - proven 60+ years
- A* (optional) - proven 50+ years
- BFS (fallback) - proven 70+ years

All algorithms are textbook implementations with:
- Deterministic behavior
- Predictable performance
- No external API calls
- Pure Python logic
"""

import heapq
import math
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass
from collections import deque


@dataclass
class Node:
    """Graph node representing an intersection or waypoint"""
    id: str
    lat: float
    lon: float
    metadata: Dict = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


@dataclass
class Edge:
    """Graph edge representing a road segment"""
    from_node: str
    to_node: str
    weight: float  # distance in meters or time in seconds
    metadata: Dict = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


@dataclass
class RouteResult:
    """Result of a routing calculation"""
    success: bool
    path: List[str]  # node IDs
    total_distance: float  # meters
    total_time: float  # seconds
    nodes: List[Node]
    algorithm_used: str
    computation_time_ms: float


class UltraStableEngine:
    """
    Ultra Stable Engine (USE) for 20-year routing reliability.
    
    Implements classical graph algorithms with zero breaking changes expected.
    All algorithms are textbook implementations that will work identically
    for decades.
    """
    
    def __init__(self):
        self.nodes: Dict[str, Node] = {}
        self.edges: Dict[str, List[Edge]] = {}  # adjacency list
        self.default_speed_kmh = 50.0  # default travel speed
        
    def add_node(self, node: Node) -> None:
        """Add a node to the graph"""
        self.nodes[node.id] = node
        if node.id not in self.edges:
            self.edges[node.id] = []
    
    def add_edge(self, edge: Edge) -> None:
        """Add an edge to the graph"""
        if edge.from_node not in self.edges:
            self.edges[edge.from_node] = []
        self.edges[edge.from_node].append(edge)
    
    def haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculate great-circle distance between two points (meters).
        Haversine formula - stable since 1800s, will work for centuries.
        """
        R = 6371000  # Earth radius in meters
        
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = math.sin(delta_phi / 2) ** 2 + \
            math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def dijkstra(self, start: str, end: str) -> RouteResult:
        """
        Dijkstra's shortest path algorithm.
        
        Invented by Edsger W. Dijkstra in 1956.
        Proven stable for 60+ years, will work unchanged for centuries.
        Pure Python implementation with no external dependencies.
        
        Time complexity: O((V + E) log V)
        Space complexity: O(V)
        """
        import time
        start_time = time.time()
        
        if start not in self.nodes or end not in self.nodes:
            return RouteResult(
                success=False,
                path=[],
                total_distance=0,
                total_time=0,
                nodes=[],
                algorithm_used="dijkstra",
                computation_time_ms=0
            )
        
        # Priority queue: (distance, node_id)
        pq = [(0, start)]
        distances = {start: 0}
        previous = {start: None}
        visited = set()
        
        while pq:
            current_dist, current_node = heapq.heappop(pq)
            
            if current_node in visited:
                continue
            
            visited.add(current_node)
            
            if current_node == end:
                break
            
            if current_node not in self.edges:
                continue
            
            for edge in self.edges[current_node]:
                neighbor = edge.to_node
                distance = current_dist + edge.weight
                
                if neighbor not in distances or distance < distances[neighbor]:
                    distances[neighbor] = distance
                    previous[neighbor] = current_node
                    heapq.heappush(pq, (distance, neighbor))
        
        # Reconstruct path
        if end not in previous and end != start:
            elapsed = (time.time() - start_time) * 1000
            return RouteResult(
                success=False,
                path=[],
                total_distance=0,
                total_time=0,
                nodes=[],
                algorithm_used="dijkstra",
                computation_time_ms=elapsed
            )
        
        path = []
        current = end
        while current is not None:
            path.append(current)
            current = previous.get(current)
        path.reverse()
        
        total_distance = distances.get(end, 0)
        total_time = (total_distance / 1000) / self.default_speed_kmh * 3600  # seconds
        
        nodes = [self.nodes[node_id] for node_id in path if node_id in self.nodes]
        
        elapsed = (time.time() - start_time) * 1000
        
        return RouteResult(
            success=True,
            path=path,
            total_distance=total_distance,
            total_time=total_time,
            nodes=nodes,
            algorithm_used="dijkstra",
            computation_time_ms=elapsed
        )
    
    def astar(self, start: str, end: str, heuristic: Optional[Callable] = None) -> RouteResult:
        """
        A* shortest path algorithm with heuristic.
        
        Invented by Hart, Nilsson, Raphael in 1968.
        Proven stable for 50+ years, widely used in navigation.
        
        Time complexity: O(b^d) where b=branching, d=depth
        Space complexity: O(b^d)
        """
        import time
        start_time = time.time()
        
        if start not in self.nodes or end not in self.nodes:
            return RouteResult(
                success=False,
                path=[],
                total_distance=0,
                total_time=0,
                nodes=[],
                algorithm_used="astar",
                computation_time_ms=0
            )
        
        # Default heuristic: straight-line distance (admissible, consistent)
        if heuristic is None:
            def heuristic(node_id: str) -> float:
                if node_id not in self.nodes or end not in self.nodes:
                    return 0
                node = self.nodes[node_id]
                end_node = self.nodes[end]
                return self.haversine_distance(node.lat, node.lon, end_node.lat, end_node.lon)
        
        # Priority queue: (f_score, g_score, node_id)
        pq = [(heuristic(start), 0, start)]
        g_scores = {start: 0}
        previous = {start: None}
        visited = set()
        
        while pq:
            f_score, g_score, current_node = heapq.heappop(pq)
            
            if current_node in visited:
                continue
            
            visited.add(current_node)
            
            if current_node == end:
                break
            
            if current_node not in self.edges:
                continue
            
            for edge in self.edges[current_node]:
                neighbor = edge.to_node
                tentative_g = g_score + edge.weight
                
                if neighbor not in g_scores or tentative_g < g_scores[neighbor]:
                    g_scores[neighbor] = tentative_g
                    previous[neighbor] = current_node
                    f_score = tentative_g + heuristic(neighbor)
                    heapq.heappush(pq, (f_score, tentative_g, neighbor))
        
        # Reconstruct path
        if end not in previous and end != start:
            elapsed = (time.time() - start_time) * 1000
            return RouteResult(
                success=False,
                path=[],
                total_distance=0,
                total_time=0,
                nodes=[],
                algorithm_used="astar",
                computation_time_ms=elapsed
            )
        
        path = []
        current = end
        while current is not None:
            path.append(current)
            current = previous.get(current)
        path.reverse()
        
        total_distance = g_scores.get(end, 0)
        total_time = (total_distance / 1000) / self.default_speed_kmh * 3600
        
        nodes = [self.nodes[node_id] for node_id in path if node_id in self.nodes]
        
        elapsed = (time.time() - start_time) * 1000
        
        return RouteResult(
            success=True,
            path=path,
            total_distance=total_distance,
            total_time=total_time,
            nodes=nodes,
            algorithm_used="astar",
            computation_time_ms=elapsed
        )
    
    def bfs(self, start: str, end: str) -> RouteResult:
        """
        Breadth-First Search - fallback algorithm.
        
        Classic graph traversal, proven since 1950s.
        Finds shortest path by number of edges (not weighted).
        Most stable, simplest algorithm - guaranteed to work for centuries.
        
        Time complexity: O(V + E)
        Space complexity: O(V)
        """
        import time
        start_time = time.time()
        
        if start not in self.nodes or end not in self.nodes:
            return RouteResult(
                success=False,
                path=[],
                total_distance=0,
                total_time=0,
                nodes=[],
                algorithm_used="bfs",
                computation_time_ms=0
            )
        
        queue = deque([start])
        visited = {start}
        previous = {start: None}
        
        while queue:
            current_node = queue.popleft()
            
            if current_node == end:
                break
            
            if current_node not in self.edges:
                continue
            
            for edge in self.edges[current_node]:
                neighbor = edge.to_node
                if neighbor not in visited:
                    visited.add(neighbor)
                    previous[neighbor] = current_node
                    queue.append(neighbor)
        
        # Reconstruct path
        if end not in previous and end != start:
            elapsed = (time.time() - start_time) * 1000
            return RouteResult(
                success=False,
                path=[],
                total_distance=0,
                total_time=0,
                nodes=[],
                algorithm_used="bfs",
                computation_time_ms=elapsed
            )
        
        path = []
        current = end
        while current is not None:
            path.append(current)
            current = previous.get(current)
        path.reverse()
        
        # Calculate actual distance by summing edge weights
        total_distance = 0
        for i in range(len(path) - 1):
            from_node = path[i]
            to_node = path[i + 1]
            if from_node in self.edges:
                for edge in self.edges[from_node]:
                    if edge.to_node == to_node:
                        total_distance += edge.weight
                        break
        
        total_time = (total_distance / 1000) / self.default_speed_kmh * 3600
        
        nodes = [self.nodes[node_id] for node_id in path if node_id in self.nodes]
        
        elapsed = (time.time() - start_time) * 1000
        
        return RouteResult(
            success=True,
            path=path,
            total_distance=total_distance,
            total_time=total_time,
            nodes=nodes,
            algorithm_used="bfs",
            computation_time_ms=elapsed
        )
    
    def route(self, start: str, end: str, algorithm: str = "dijkstra") -> RouteResult:
        """
        Calculate route between two nodes.
        
        Args:
            start: Starting node ID
            end: Ending node ID
            algorithm: "dijkstra" (default), "astar", or "bfs"
        
        Returns:
            RouteResult with path, distance, time, and metadata
        """
        if algorithm == "astar":
            return self.astar(start, end)
        elif algorithm == "bfs":
            return self.bfs(start, end)
        else:  # dijkstra (default, most reliable)
            return self.dijkstra(start, end)
    
    def clear(self) -> None:
        """Clear all nodes and edges"""
        self.nodes.clear()
        self.edges.clear()
    
    def get_stats(self) -> Dict:
        """Get graph statistics"""
        edge_count = sum(len(edges) for edges in self.edges.values())
        return {
            "node_count": len(self.nodes),
            "edge_count": edge_count,
            "algorithms_available": ["dijkstra", "astar", "bfs"]
        }
