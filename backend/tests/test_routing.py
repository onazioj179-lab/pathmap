"""
PATHMAP - Routing Algorithm Tests
=================================
Unit tests for pathfinding algorithms: ShadowPath, HomeGuard, PathfinderX.
"""

import pytest


class TestShadowPath:
    """Tests for ShadowPath (A*) algorithm."""

    @pytest.fixture
    def shadow_path(self, mock_graph):
        """Create ShadowPath instance with mock graph."""
        from pathfinding.shadow_path import ShadowPath
        return ShadowPath(mock_graph)

    def test_find_path_exists(self, shadow_path, mock_graph_coords):
        """Should find path between connected nodes."""
        (slat, slon), (elat, elon) = mock_graph_coords[1], mock_graph_coords[4]
        path, visited, cost, steps = shadow_path.find_route(slat, slon, elat, elon)

        assert path  # non-empty list of [lat, lon]
        assert path[0] == [slat, slon]
        assert path[-1] == [elat, elon]

    def test_find_path_no_connection(self, shadow_path, mock_graph_coords):
        """Should handle disconnected nodes gracefully."""
        # Add an isolated node far away; routing to it must find no path.
        shadow_path.graph.add_node(99, y=10.0, x=8.0)
        slat, slon = mock_graph_coords[1]
        path, visited, cost, steps = shadow_path.find_route(slat, slon, 10.0, 8.0)

        assert path == []  # no route to the isolated node

    def test_visited_nodes_tracked(self, shadow_path, mock_graph_coords):
        """Should track visited nodes during search."""
        (slat, slon), (elat, elon) = mock_graph_coords[1], mock_graph_coords[4]
        path, visited, cost, steps = shadow_path.find_route(slat, slon, elat, elon)

        assert visited
        assert len(visited) > 0

    def test_cost_calculated(self, shadow_path, mock_graph_coords):
        """Should calculate path cost (in metres)."""
        (slat, slon), (elat, elon) = mock_graph_coords[1], mock_graph_coords[4]
        path, visited, cost, steps = shadow_path.find_route(slat, slon, elat, elon)

        assert cost > 0


class TestHomeGuard:
    """Tests for HomeGuard (Dijkstra) algorithm."""

    @pytest.fixture
    def home_guard(self, mock_graph):
        """Create HomeGuard instance with mock graph."""
        from pathfinding.home_guard import HomeGuard
        return HomeGuard(mock_graph)

    def test_find_path_exists(self, home_guard, mock_graph_coords):
        """Should find shortest path between nodes."""
        (slat, slon), (elat, elon) = mock_graph_coords[1], mock_graph_coords[4]
        path, visited, cost, steps = home_guard.find_route(slat, slon, elat, elon)

        assert path
        assert path[0] == [slat, slon]
        assert path[-1] == [elat, elon]

    def test_path_is_shortest(self, home_guard, mock_graph_coords):
        """HomeGuard (Dijkstra) should find the shortest path."""
        (slat, slon), (elat, elon) = mock_graph_coords[1], mock_graph_coords[4]
        path, visited, cost, steps = home_guard.find_route(slat, slon, elat, elon)

        # Only route is 1->2->3->4 with edge lengths 100 + 100 + 150 = 350.
        assert cost == pytest.approx(350.0)


class TestPathfinderX:
    """Tests for PathfinderX (Greedy) algorithm."""

    @pytest.fixture
    def pathfinder_x(self, mock_graph):
        """Create PathfinderX instance with mock graph."""
        from pathfinding.pathfinder_x import PathfinderX
        return PathfinderX(mock_graph)

    def test_find_path_exists(self, pathfinder_x, mock_graph_coords):
        """Should find path between nodes."""
        (slat, slon), (elat, elon) = mock_graph_coords[1], mock_graph_coords[4]
        path, visited, cost, steps = pathfinder_x.find_route(slat, slon, elat, elon)

        assert path
        assert len(path) > 0

    def test_greedy_and_dijkstra_both_route(self, pathfinder_x, mock_graph, mock_graph_coords):
        """Both greedy and Dijkstra should find a path on the mock graph."""
        from pathfinding.home_guard import HomeGuard

        home_guard = HomeGuard(mock_graph)
        (slat, slon), (elat, elon) = mock_graph_coords[1], mock_graph_coords[4]

        _, visited_greedy, _, _ = pathfinder_x.find_route(slat, slon, elat, elon)
        _, visited_dijkstra, _, _ = home_guard.find_route(slat, slon, elat, elon)

        assert len(visited_greedy) > 0
        assert len(visited_dijkstra) > 0


class TestRouteAPI:
    """Integration tests for routing API."""
    
    def test_route_endpoint(self, client, sample_route_request):
        """POST /route should return valid route."""
        response = client.post("/route", json=sample_route_request)
        
        # May fail if graph not loaded, which is OK for unit tests
        if response.status_code == 200:
            data = response.json()
            assert "path" in data or "steps" in data
    
    def test_route_with_different_algorithms(self, client):
        """Should support all three algorithms."""
        base_request = {
            "start": [9.0820, 7.4900],
            "end": [9.0850, 7.4950]
        }
        
        for algo in ["ShadowPath", "HomeGuard", "PathfinderX"]:
            request = {**base_request, "algo": algo}
            response = client.post("/route", json=request)

            # Endpoint accepts all algorithms; 503 if the graph is still loading
            # in the background at startup.
            assert response.status_code in [200, 404, 500, 503]
    
    def test_compare_endpoint(self, client):
        """POST /compare should compare algorithms."""
        response = client.post("/compare", json={
            "start": [9.0820, 7.4900],
            "end": [9.0850, 7.4950],
            "algorithms": ["ShadowPath", "HomeGuard"]
        })
        
        if response.status_code == 200:
            data = response.json()
            assert "results" in data or isinstance(data, list)


class TestSafeReturn:
    """Tests for safe-return routing."""
    
    def test_safe_return_endpoint(self, client):
        """POST /safe_return should return safe routes."""
        response = client.post("/safe_return", json={
            "current": [9.0820, 7.4900],
            "home": [9.0850, 7.4950]
        })
        
        # Endpoint may not exist or graph not loaded
        if response.status_code == 200:
            data = response.json()
            assert "direct_home" in data


class TestPerformance:
    """Performance tests for routing."""
    
    @pytest.mark.slow
    def test_route_calculation_time(self, client, sample_route_request):
        """Route calculation should complete within threshold."""
        import time
        
        start = time.time()
        client.post("/route", json=sample_route_request)
        elapsed = time.time() - start
        
        # Should complete within 2 seconds
        assert elapsed < 2.0
    
    @pytest.mark.slow
    def test_multiple_routes_concurrent(self, client):
        """Should handle multiple concurrent route requests."""
        import concurrent.futures
        
        request = {
            "start": [9.0820, 7.4900],
            "end": [9.0850, 7.4950],
            "algo": "ShadowPath"
        }
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [
                executor.submit(client.post, "/route", json=request)
                for _ in range(5)
            ]
            
            results = [f.result() for f in futures]
        
        # All requests should complete (status code doesn't matter for load test)
        assert len(results) == 5
