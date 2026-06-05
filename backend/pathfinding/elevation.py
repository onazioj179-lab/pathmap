# V6: Elevation and Profile Support

from typing import Dict, Any


class ElevationManager:
    """Manages elevation data and cost calculations."""
    
    def __init__(self, graph: Any):
        self.graph = graph
        self._precompute_elevation_data()
    
    def _precompute_elevation_data(self):
        """Pre-compute elevation for nodes if available."""
        # OSMnx graphs may have elevation data; if not, we'll use approximations
        for node in self.graph.nodes():
            if 'elevation' not in self.graph.nodes[node]:
                # Default to 0 if no elevation data
                self.graph.nodes[node]['elevation'] = 0.0
    
    def get_elevation(self, node: int) -> float:
        """Get elevation for a node."""
        return self.graph.nodes[node].get('elevation', 0.0)
    
    def calculate_elevation_gain_loss(self, path_nodes: list) -> Dict[str, float]:
        """Calculate total elevation gain and loss for a path."""
        gain = 0.0
        loss = 0.0
        
        for i in range(len(path_nodes) - 1):
            elev_diff = self.get_elevation(path_nodes[i + 1]) - self.get_elevation(path_nodes[i])
            if elev_diff > 0:
                gain += elev_diff
            else:
                loss += abs(elev_diff)
        
        return {'gain': gain, 'loss': loss}


class RoutingProfile:
    """Defines routing profiles with different cost weightings."""
    
    PROFILES = {
        'driving': {
            'name': 'Driving',
            'base_weight': 1.0,
            'elevation_gain_penalty': 0.1,
            'elevation_loss_bonus': 0.05,
            'max_slope': 0.25  # 25% grade
        },
        'walking': {
            'name': 'Walking',
            'base_weight': 1.0,
            'elevation_gain_penalty': 2.0,
            'elevation_loss_bonus': 0.5,
            'max_slope': 0.45  # 45% grade
        },
        'offroad': {
            'name': 'Offroad',
            'base_weight': 1.2,
            'elevation_gain_penalty': 0.3,
            'elevation_loss_bonus': 0.1,
            'max_slope': 0.60  # 60% grade
        }
    }
    
    @classmethod
    def get_profile(cls, name: str) -> Dict[str, Any]:
        """Get profile configuration by name."""
        return cls.PROFILES.get(name, cls.PROFILES['walking'])
    
    @classmethod
    def calculate_weighted_cost(cls, base_cost: float, elevation_gain: float, 
                                elevation_loss: float, profile_name: str,
                                elevation_weight: float = 1.0) -> float:
        """Calculate weighted cost including elevation factors."""
        profile = cls.get_profile(profile_name)
        
        gain_cost = elevation_gain * profile['elevation_gain_penalty'] * elevation_weight
        loss_bonus = elevation_loss * profile['elevation_loss_bonus'] * elevation_weight
        
        weighted = (base_cost * profile['base_weight']) + gain_cost - loss_bonus
        return max(weighted, 0.0)  # Ensure non-negative


def get_edge_cost_with_elevation(graph: Any, u: int, v: int, profile_name: str,
                                  elevation_weight: float = 1.0) -> float:
    """Calculate edge cost including elevation profile."""
    # Base distance cost
    edge_data = graph.get_edge_data(u, v)
    if not edge_data:
        return float('inf')
    
    base_length = edge_data.get(0, {}).get('length', 0)
    
    # Elevation component
    try:
        elev_u = graph.nodes[u].get('elevation', 0.0)
        elev_v = graph.nodes[v].get('elevation', 0.0)
        elev_diff = elev_v - elev_u
        
        gain = max(0, elev_diff)
        loss = max(0, -elev_diff)
        
        return RoutingProfile.calculate_weighted_cost(
            base_length, gain, loss, profile_name, elevation_weight
        )
    except Exception:
        return base_length
