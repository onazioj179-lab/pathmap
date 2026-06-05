import osmnx as ox
from typing import List, Any


def nearest_node(graph, lat: float, lon: float):
	"""Return nearest graph node id to the given coordinates (lat, lon)."""
	return ox.nearest_nodes(graph, lon, lat)


def nodes_to_coords(graph, nodes: List[Any]) -> List[List[float]]:
	"""Convert node ids to [[lat, lon], ...] coordinates."""
	coords: List[List[float]] = []
	for n in nodes:
		nd = graph.nodes[n]
		coords.append([nd['y'], nd['x']])
	return coords


def edge_length(graph, u: Any, v: Any) -> float:
	"""Return the minimal 'length' among multi-edges between u and v."""
	data = graph.get_edge_data(u, v)
	if not data:
		return float('inf')
	# MultiDiGraph: data is mapping of key -> edge_attr
	return min(edge_attr.get('length', float('inf')) for edge_attr in data.values())


def path_length(graph, nodes: List[Any]) -> float:
	"""Compute total path length (meters) along consecutive node pairs."""
	if not nodes or len(nodes) < 2:
		return 0.0
	total = 0.0
	for i in range(len(nodes) - 1):
		total += edge_length(graph, nodes[i], nodes[i + 1])
	return total


def reconstruct_path(came_from: dict, current: Any) -> List[Any]:
	path = [current]
	while current in came_from:
		current = came_from[current]
		path.append(current)
	path.reverse()
	return path
