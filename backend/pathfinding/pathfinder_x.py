import heapq
import math
from typing import Any, Tuple, List, Dict, Union

from .utils import (
    nearest_node,
    nodes_to_coords,
    edge_length,
    path_length,
    reconstruct_path,
)


class PathfinderX:
    """PathfinderX (Greedy Best-First) - Explorer scouting with quick discovery.
    Uses only heuristic for priority. Returns path, visited order, and total path cost.
    """

    def __init__(self, graph):
        self.graph = graph

    def _h(self, a: Any, b: Any) -> float:
        n1 = self.graph.nodes[a]
        n2 = self.graph.nodes[b]
        return math.hypot(n1['y'] - n2['y'], n1['x'] - n2['x'])

    def find_route(
        self, start_lat: float, start_lon: float, end_lat: float, end_lon: float
    ) -> Tuple[List[List[float]], List[int], float, List[Dict[str, Union[int, float]]]]:
        start = nearest_node(self.graph, start_lat, start_lon)
        goal = nearest_node(self.graph, end_lat, end_lon)

        pq: List[Tuple[float, Any]] = []
        heapq.heappush(pq, (0.0, start))

        came_from: dict = {}
        visited_order: List[Any] = []
        steps: List[Dict[str, Union[int, float]]] = []
        visited_set = set()

        while pq:
            _, u = heapq.heappop(pq)
            if u in visited_set:
                continue
            visited_set.add(u)
            visited_order.append(u)
            nd = self.graph.nodes[u]
            steps.append({"node": int(u), "lat": float(nd['y']), "lon": float(nd['x'])})

            if u == goal:
                nodes_path = reconstruct_path(came_from, u)
                path_coords = nodes_to_coords(self.graph, nodes_path)
                cost = path_length(self.graph, nodes_path)
                visited_ids = [int(n) for n in visited_order]
                return path_coords, visited_ids, cost, steps

            for v in self.graph.neighbors(u):
                w = edge_length(self.graph, u, v)
                if w == float('inf'):
                    continue
                if v in visited_set:
                    continue
                came_from[v] = u
                heapq.heappush(pq, (self._h(v, goal), v))

        return [], [int(n) for n in visited_order], 0.0, steps
