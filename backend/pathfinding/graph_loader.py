import os
import osmnx as ox
from pathlib import Path


class GraphLoader:
    """Loads and manages OpenStreetMap graph data"""

    def __init__(self, cache_path: str = None):
        # Cache path is configurable via OSM_GRAPH_CACHE so operators can point
        # at a prebuilt graph without code changes.
        cache_path = cache_path or os.getenv("OSM_GRAPH_CACHE", "data/graph.graphml")
        self.cache_path = Path(__file__).parent.parent / cache_path
        self.graph = None

    def load_graph(self, location: str = None, force_reload: bool = False):
        """
        Load graph from cache or download from OSM
        
        Args:
            location: Location name (e.g., "Piedmont, California, USA")
            force_reload: Force download even if cache exists
        
        Returns:
            NetworkX MultiDiGraph
        """
        # Try to load from cache
        if not force_reload and self.cache_path.exists():
            print(f"Loading graph from cache: {self.cache_path}")
            self.graph = ox.load_graphml(self.cache_path)
            return self.graph
        
        # Download from OSM. Operators set OSM_GRAPH_LOCATION (e.g.
        # "Manhattan, New York, USA") to build a graph for their real coverage
        # area; defaults to a small real sample so the app runs out of the box.
        if location is None:
            location = os.getenv("OSM_GRAPH_LOCATION", "Piedmont, California, USA")

        print(f"Downloading OSM graph for: {location}")
        print("This may take a few minutes on first run...")
        
        self.graph = ox.graph_from_place(location, network_type='drive')
        
        # Save to cache
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        ox.save_graphml(self.graph, self.cache_path)
        print(f"Graph cached to: {self.cache_path}")
        
        return self.graph
