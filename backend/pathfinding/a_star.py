import heapq
import logging
import math
from typing import Any, Tuple, List, Dict, Union

from .utils import (
    nearest_node,
    nodes_to_coords,
    edge_length,
    path_length,
    reconstruct_path,
)
from . import native_routing

logger = logging.getLogger(__name__)


class AStar:
    """A* pathfinding that returns path, visited order, and total cost.

    When the optional Rust core (`pathmap_core`) is installed, the search runs
    natively for a large speedup; otherwise it falls back to the pure-Python
    implementation below. Both paths produce identical results.
    """

    # Allow callers/tests to force the pure-Python path even when the native
    # core is present (e.g. for parity testing).
    use_native: bool = True

    def __init__(self, graph):
        self.graph = graph

    # Mean Earth radius in metres.
    _EARTH_RADIUS_M = 6_371_000.0

    def _heuristic_estimate(self, a: Any, b: Any) -> float:
        # Great-circle straight-line distance in METRES (equirectangular
        # approximation). Edge weights are road lengths in metres, so the
        # heuristic must be in metres to actually guide A*. It stays admissible
        # (straight-line distance can never exceed the real road distance), so
        # the route remains optimal while exploring far fewer nodes.
        n1 = self.graph.nodes[a]
        n2 = self.graph.nodes[b]
        lat1 = math.radians(n1['y'])
        lat2 = math.radians(n2['y'])
        dlat = lat2 - lat1
        dlon = math.radians(n2['x'] - n1['x'])
        mean_lat = (lat1 + lat2) * 0.5
        x = dlon * math.cos(mean_lat)
        return math.hypot(x, dlat) * self._EARTH_RADIUS_M

    def find_route(
        self, start_lat: float, start_lon: float, end_lat: float, end_lon: float
    ) -> Tuple[List[List[float]], List[int], float, List[Dict[str, Union[int, float]]]]:
        # Fast path: native Rust core. Any failure silently falls through to the
        # pure-Python search below, so routing never breaks if it is missing.
        if self.use_native and native_routing.NATIVE_AVAILABLE:
            try:
                return native_routing.find_route_native(
                    self.graph, start_lat, start_lon, end_lat, end_lon
                )
            except Exception:
                # The native core is present but failed at runtime. Log it so the
                # silent loss of the speedup is observable, then fall back to the
                # pure-Python search below (routing still succeeds).
                logger.warning(
                    "native routing failed; falling back to pure-Python A*",
                    exc_info=True,
                )

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
