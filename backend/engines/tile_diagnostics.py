"""
V89: Python Backend Tile Diagnostic Pipeline
Checks tile server connectivity, validates responses, prevents blank maps.
"""

import httpx
from typing import Dict, Any, List


class TileDiagnostics:
    """Backend tile server diagnostic and validation system."""
    
    def __init__(self):
        self.check_connectivity = True
        self.tile_servers = {
            'osm': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            'carto_dark': 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            'terrarium': 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        }
        self.valid_mime_types = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
        self._client: httpx.AsyncClient | None = None
        print("[V89:TD] Tile Diagnostics initialized")
    
    async def init(self):
        """Initialize HTTP client."""
        self._client = httpx.AsyncClient(timeout=10.0, follow_redirects=True)
        print("[V89:TD] HTTP client initialized")
    
    async def ping_tile_server(self, server_url: str) -> Dict[str, Any]:
        """
        Ping tile server with HEAD request to check availability.
        
        Args:
            server_url: Base URL with {z}/{x}/{y} placeholders
            
        Returns:
            Dict with status, reachable flag, and error if any
        """
        if not self._client:
            await self.init()
        
        # Replace placeholders with test tile coordinates
        test_url = server_url.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0')
        
        try:
            response = await self._client.head(test_url, timeout=5.0)
            return {
                'reachable': True,
                'status': response.status_code,
                'url': test_url,
                'error': None
            }
        except httpx.TimeoutException:
            return {
                'reachable': False,
                'status': 0,
                'url': test_url,
                'error': 'Timeout - server not responding'
            }
        except httpx.ConnectError:
            return {
                'reachable': False,
                'status': 0,
                'url': test_url,
                'error': 'Connection error - server unreachable'
            }
        except Exception as e:
            return {
                'reachable': False,
                'status': 0,
                'url': test_url,
                'error': f'Unexpected error: {str(e)}'
            }
    
    async def test_tile_fetch(self, server_url: str, z: int = 1, x: int = 1, y: int = 1) -> Dict[str, Any]:
        """
        Fetch a test tile and validate response.
        
        Args:
            server_url: Base URL with {z}/{x}/{y} placeholders
            z, x, y: Tile coordinates to test
            
        Returns:
            Dict with status, bytes, MIME type, and validation results
        """
        if not self._client:
            await self.init()
        
        test_url = server_url.replace('{z}', str(z)).replace('{x}', str(x)).replace('{y}', str(y))
        
        try:
            response = await self._client.get(test_url, timeout=10.0)
            content = response.content
            content_type = response.headers.get('Content-Type', '')
            
            return {
                'success': True,
                'status': response.status_code,
                'url': test_url,
                'bytes': len(content),
                'mime_type': content_type,
                'valid_mime': self.validate_mime(content_type),
                'non_empty': self.validate_not_empty(content),
                'error': None
            }
        except httpx.TimeoutException:
            return {
                'success': False,
                'status': 0,
                'url': test_url,
                'bytes': 0,
                'mime_type': '',
                'valid_mime': False,
                'non_empty': False,
                'error': 'Timeout - tile fetch failed'
            }
        except Exception as e:
            return {
                'success': False,
                'status': 0,
                'url': test_url,
                'bytes': 0,
                'mime_type': '',
                'valid_mime': False,
                'non_empty': False,
                'error': f'Fetch error: {str(e)}'
            }
    
    def validate_mime(self, content_type: str) -> bool:
        """Check if Content-Type is a valid image MIME type."""
        return any(mime in content_type.lower() for mime in self.valid_mime_types)
    
    def validate_not_empty(self, content: bytes) -> bool:
        """Check if tile data is not empty (> 20 bytes)."""
        return len(content) > 20
    
    async def run(self, server_name: str = 'carto_dark') -> Dict[str, Any]:
        """
        Run full diagnostic pipeline for a tile server.
        
        Args:
            server_name: Key from self.tile_servers
            
        Returns:
            Complete diagnostic report
        """
        if server_name not in self.tile_servers:
            return {
                'error': f'Unknown tile server: {server_name}',
                'available_servers': list(self.tile_servers.keys())
            }
        
        server_url = self.tile_servers[server_name]
        
        print(f"[V89:TD] Running diagnostics for {server_name}: {server_url}")
        
        # Ping test
        ping_result = await self.ping_tile_server(server_url)
        
        # Tile fetch test
        tile_result = await self.test_tile_fetch(server_url)
        
        # Overall assessment
        operational = (
            ping_result['reachable'] and
            tile_result['success'] and
            tile_result['status'] == 200 and
            tile_result['valid_mime'] and
            tile_result['non_empty']
        )
        
        issues: List[str] = []
        if not ping_result['reachable']:
            issues.append(f"Server unreachable: {ping_result['error']}")
        if tile_result['status'] != 200:
            issues.append(f"HTTP error: {tile_result['status']}")
        if not tile_result['valid_mime']:
            issues.append(f"Invalid MIME type: {tile_result.get('mime_type', 'none')}")
        if not tile_result['non_empty']:
            issues.append("Empty tile data (< 20 bytes)")
        
        result = {
            'server': server_name,
            'url': server_url,
            'operational': operational,
            'ping': ping_result,
            'tile_fetch': tile_result,
            'issues': issues,
            'recommendation': 'OK' if operational else 'FAIL - See issues'
        }
        
        print(f"[V89:TD] Diagnostics complete: {'OPERATIONAL' if operational else 'FAILED'}")
        if issues:
            for issue in issues:
                print(f"[V89:TD] Issue: {issue}")
        
        return result
    
    async def run_all(self) -> Dict[str, Any]:
        """Run diagnostics for all configured tile servers."""
        results = {}
        for server_name in self.tile_servers.keys():
            results[server_name] = await self.run(server_name)
        
        # Summary
        operational_count = sum(1 for r in results.values() if r['operational'])
        total_count = len(results)
        
        return {
            'servers': results,
            'summary': {
                'total': total_count,
                'operational': operational_count,
                'failed': total_count - operational_count
            }
        }
    
    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


# Singleton instance
_tile_diagnostics: TileDiagnostics | None = None


def get_tile_diagnostics() -> TileDiagnostics:
    """Get singleton tile diagnostics instance."""
    global _tile_diagnostics
    if _tile_diagnostics is None:
        _tile_diagnostics = TileDiagnostics()
    return _tile_diagnostics
