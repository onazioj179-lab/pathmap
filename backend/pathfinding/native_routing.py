"""Optional native (Rust) acceleration for A* routing.

This module bridges the NetworkX road graph used by the pure-Python pathfinder
to the `pathmap_core` Rust extension (see `native/pathmap_core`). It is entirely
optional: if the extension is not built/installed, `NATIVE_AVAILABLE` is False
and callers fall back to the Python implementation, so the app always runs.

The graph is converted once into a compact CSR (compressed sparse row) form and
cached on the graph object, so repeated routing queries pay the conversion cost
only on the first call after a graph (re)load.
"""

from typing import Any, Dict, List, Tuple, Union

from .utils import nearest_node, edge_length

try:  # The Rust core is optional; absence is a normal, supported state.
    import pathmap_core  # type: ignore

    NATIVE_AVAILABLE = True
    NATIVE_VERSION = getattr(pathmap_core, "__version__", "unknown")
except Exception:  # pragma: no cover - depends on local build environment
    pathmap_core = None  # type: ignore
    NATIVE_AVAILABLE = False
    NATIVE_VERSION = None

# Attribute name under which the cached CSR view lives on the graph object.
_CSR_ATTR = "_pf_csr_cache"


def _build_csr(graph) -> Dict[str, Any]:
    """Build (and return) a CSR view of `graph` for the native core.

    Layout: neighbours of dense node `i` are `indices[indptr[i]:indptr[i+1]]`
    with matching `weights` (edge lengths in metres). `xs`/`ys` are per-node
    longitude/latitude; `node_ids` maps dense index back to the original id.
    """
    node_ids: List[Any] = list(graph.nodes)
    id_to_idx: Dict[Any, int] = {nid: i for i, nid in enumerate(node_ids)}

    xs: List[float] = []
    ys: List[float] = []
    for nid in node_ids:
        nd = graph.nodes[nid]
        xs.append(float(nd["x"]))
        ys.append(float(nd["y"]))

    indptr: List[int] = [0]
    indices: List[int] = []
    weights: List[float] = []
    for nid in node_ids:
        for nb in graph.neighbors(nid):
            w = edge_length(graph, nid, nb)
            # Skip edges with no usable length, exactly as the pure-Python A*
            # does (`if w == float('inf'): continue`), so the native search
            # explores the same edge set and stays in parity.
            if w == float("inf"):
                continue
            indices.append(id_to_idx[nb])
            weights.append(float(w))
        indptr.append(len(indices))

    return {
        "node_ids": node_ids,
        "id_to_idx": id_to_idx,
        "xs": xs,
        "ys": ys,
        "indptr": indptr,
        "indices": indices,
        "weights": weights,
    }


def _get_csr(graph) -> Dict[str, Any]:
    csr = getattr(graph, _CSR_ATTR, None)
    # Invalidate if the graph grew/shrank since the cache was built.
    if csr is None or len(csr["node_ids"]) != graph.number_of_nodes():
        csr = _build_csr(graph)
        try:
            setattr(graph, _CSR_ATTR, csr)
        except Exception:
            pass  # Some graph types forbid arbitrary attrs; just skip caching.
    return csr


def find_route_native(
    graph, start_lat: float, start_lon: float, end_lat: float, end_lon: float
) -> Tuple[List[List[float]], List[int], float, List[Dict[str, Union[int, float]]]]:
    """A* over the native core. Returns the same tuple shape as `AStar.find_route`.

    Raises `RuntimeError` if the native core is unavailable so callers can fall
    back deterministically.
    """
    if not NATIVE_AVAILABLE:
        raise RuntimeError("pathmap_core native extension is not available")

    csr = _get_csr(graph)
    id_to_idx = csr["id_to_idx"]
    node_ids = csr["node_ids"]

    start_id = nearest_node(graph, start_lat, start_lon)
    goal_id = nearest_node(graph, end_lat, end_lon)
    start_idx = id_to_idx[start_id]
    goal_idx = id_to_idx[goal_id]

    path_idx, visited_idx, cost = pathmap_core.astar(
        csr["xs"],
        csr["ys"],
        csr["indptr"],
        csr["indices"],
        csr["weights"],
        start_idx,
        goal_idx,
    )

    xs = csr["xs"]
    ys = csr["ys"]
    path_coords: List[List[float]] = [[ys[i], xs[i]] for i in path_idx]
    visited_ids: List[int] = [int(node_ids[i]) for i in visited_idx]
    steps: List[Dict[str, Union[int, float]]] = [
        {"node": int(node_ids[i]), "lat": float(ys[i]), "lon": float(xs[i])}
        for i in visited_idx
    ]
    return path_coords, visited_ids, float(cost), steps
