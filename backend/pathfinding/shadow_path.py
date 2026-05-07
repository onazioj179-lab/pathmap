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


class ShadowPath:
    """ShadowPath (A*) - Fastest, intelligent routing with heuristic guidance.
    Returns path, visited order, and total cost."""

    def __init__(self, graph):
        self.graph = graph

    def _heuristic_estimate(self, a: Any, b: Any) -> float:
        # Straight-line (Euclidean on lat/lon) heuristic
        n1 = self.graph.nodes[a]
        n2 = self.graph.nodes[b]
        return math.hypot(n1['y'] - n2['y'], n1['x'] - n2['x'])

    def find_route(
        self, start_lat: float, start_lon: float, end_lat: float, end_lon: float
    ) -> Tuple[List[List[float]], List[int], float, List[Dict[str, Union[int, float]]]]:
        start = nearest_node(self.graph, start_lat, start_lon)
        goal = nearest_node(self.graph, end_lat, end_lon)

        open_heap: List[Tuple[float, int, Any]] = []
        counter = 0
        heapq.heappush(open_heap, (0.0, counter, start))

        came_from: dict = {}
        g_score: dict = {start: 0.0}
        f_score: dict = {start: self._heuristic_estimate(start, goal)}
        visited_order: List[Any] = []
        steps: List[Dict[str, Union[int, float]]] = []

        open_set = {start}

        while open_heap:
            _, _, current = heapq.heappop(open_heap)
            if current not in open_set:
                continue
            open_set.remove(current)

            visited_order.append(current)
            ncur = self.graph.nodes[current]
            steps.append({"node": int(current), "lat": float(ncur['y']), "lon": float(ncur['x'])})
            if current == goal:
                nodes_path = reconstruct_path(came_from, current)
                path_coords = nodes_to_coords(self.graph, nodes_path)
                cost = path_length(self.graph, nodes_path)
                visited_ids = [int(n) for n in visited_order]
                return path_coords, visited_ids, cost, steps

            for neighbor in self.graph.neighbors(current):
                w = edge_length(self.graph, current, neighbor)
                if w == float('inf'):
                    continue
                tentative_g = g_score[current] + w
                if tentative_g < g_score.get(neighbor, float('inf')):
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    f_score[neighbor] = tentative_g + self._heuristic_estimate(neighbor, goal)
                    counter += 1
                    heapq.heappush(open_heap, (f_score[neighbor], counter, neighbor))
                    open_set.add(neighbor)

        # No path found
        return [], [int(n) for n in visited_order], 0.0, steps
