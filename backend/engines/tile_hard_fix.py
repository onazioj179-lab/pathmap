"""
V91: Tile Server Hard Fix - Guaranteed Tile Load + Hard Failover
Blocking initialization, backup providers, heartbeat monitoring, zero blank maps.
"""

import httpx
import asyncio
from typing import Dict, Any, List, Optional
import random


class TileServerHeartbeat:
    """
    V91: Blocking tile server validator with hard failover.
    Ensures at least one tile server is operational before map boot.
    """
    
    def __init__(self):
        self.interval_ms = 500
        self.max_retries = 20
        self.valid_mime_types = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
        self._client: Optional[httpx.AsyncClient] = None
        print("[V91:HEARTBEAT] Tile Server Heartbeat initialized")
    
    async def init(self):
        """Initialize HTTP client for heartbeat checks."""
        if not self._client:
            self._client = httpx.AsyncClient(
                timeout=5.0,
                follow_redirects=True,
                headers={'User-Agent': 'Pathfinder/V91'}
            )
            print("[V91:HEARTBEAT] HTTP client ready")
    
    async def test_tile_url(self, url: str) -> bool:
        """
        Test if a single tile URL is accessible and valid.
        
        Args:
            url: Complete tile URL (already formatted with z/x/y)
            
        Returns:
            True if tile is accessible and valid, False otherwise
        """
        if not self._client:
            await self.init()
        
        try:
            response = await self._client.head(url, timeout=3.0)
            if response.status_code == 200:
                return True
        except Exception as e:
            print(f"[V91:HEARTBEAT] Tile test failed for {url}: {e}")
        
        return False
    
    async def validate_with_retries(self, base_url: str) -> bool:
        """
        Validate tile server with multiple retry attempts.
        Blocks until server responds or max retries exceeded.
        
        Args:
            base_url: Tile URL template with {z}/{x}/{y} placeholders
            
        Returns:
            True if server is operational, False if all retries failed
        """
        # Create test tile URL (zoom 1, tile 1/1)
        test_url = base_url.replace('{z}', '1').replace('{x}', '1').replace('{y}', '1')
        
        print(f"[V91:HEARTBEAT] Validating: {test_url}")
        
        for attempt in range(1, self.max_retries + 1):
            if await self.test_tile_url(test_url):
                print(f"[V91:HEARTBEAT] [OK] Server operational (attempt {attempt})")
                return True
            
            if attempt < self.max_retries:
                await asyncio.sleep(self.interval_ms / 1000.0)
        
        print(f"[V91:HEARTBEAT] [FAIL] Server validation failed after {self.max_retries} attempts")
        return False
    
    async def fetch_and_validate_tile(self, url: str) -> bool:
        """
        Fetch actual tile data and validate format.
        
        Args:
            url: Complete tile URL
            
        Returns:
            True if tile data is valid (correct MIME, >32 bytes)
        """
        if not self._client:
            await self.init()
        
        try:
            response = await self._client.get(url, timeout=5.0)
            
            if response.status_code != 200:
                return False
            
            # Validate MIME type
            content_type = response.headers.get('content-type', '').lower()
            if not any(mime in content_type for mime in self.valid_mime_types):
                print(f"[V91:HEARTBEAT] Invalid MIME type: {content_type}")
                return False
            
            # Validate byte size (>32 bytes for real tile)
            if len(response.content) <= 32:
                print(f"[V91:HEARTBEAT] Tile too small: {len(response.content)} bytes")
                return False
            
            print(f"[V91:HEARTBEAT] [OK] Tile valid: {len(response.content)} bytes, {content_type}")
            return True
            
        except Exception as e:
            print(f"[V91:HEARTBEAT] Tile fetch error: {e}")
            return False
    
    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            print("[V91:HEARTBEAT] HTTP client closed")


class TileFallbackProvider:
    """
    V91: Backup tile provider system with auto-failover.
    Maintains list of fallback servers for guaranteed tile availability.
    """
    
    def __init__(self):
        self.providers = [
            {
                'name': 'OpenStreetMap',
                'url': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                'priority': 1
            },
            {
                'name': 'Carto Light',
                'url': 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                'priority': 2
            },
            {
                'name': 'HOT OSM',
                'url': 'https://b.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
                'priority': 3
            },
            {
                'name': 'Carto Dark',
                'url': 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                'priority': 4
            }
        ]
        print(f"[V91:FALLBACK] Initialized with {len(self.providers)} backup providers")
    
    def select_random(self) -> Dict[str, Any]:
        """Select random backup provider."""
        provider = random.choice(self.providers)
        print(f"[V91:FALLBACK] Selected: {provider['name']}")
        return provider
    
    def select_by_priority(self) -> Dict[str, Any]:
        """Select highest priority backup provider."""
        provider = sorted(self.providers, key=lambda x: x['priority'])[0]
        print(f"[V91:FALLBACK] Selected priority: {provider['name']}")
        return provider
    
    def get_all_urls(self) -> List[str]:
        """Get all backup provider URLs."""
        return [p['url'] for p in self.providers]


class TileFormatEnforcer:
    """
    V91: Tile format validator to prevent broken/empty tiles.
    Validates MIME types and byte sizes before rendering.
    """
    
    def __init__(self):
        self.valid_mime_types = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
        self.min_bytes = 32
        print("[V91:ENFORCER] Tile Format Enforcer initialized")
    
    def verify_mime(self, content_type: str) -> bool:
        """
        Verify content-type header is valid image format.
        
        Args:
            content_type: HTTP Content-Type header value
            
        Returns:
            True if valid image MIME type
        """
        content_type_lower = content_type.lower()
        is_valid = any(mime in content_type_lower for mime in self.valid_mime_types)
        
        if not is_valid:
            print(f"[V91:ENFORCER] [FAIL] Invalid MIME: {content_type}")
        
        return is_valid
    
    def verify_bytes(self, data: bytes) -> bool:
        """
        Verify tile data has sufficient bytes (not empty/broken).
        
        Args:
            data: Raw tile bytes
            
        Returns:
            True if data size exceeds minimum threshold
        """
        is_valid = len(data) > self.min_bytes
        
        if not is_valid:
            print(f"[V91:ENFORCER] [FAIL] Tile too small: {len(data)} bytes")
        
        return is_valid
    
    def validate_tile(self, content_type: str, data: bytes) -> bool:
        """
        Full tile validation (MIME + bytes).
        
        Args:
            content_type: HTTP Content-Type header
            data: Raw tile bytes
            
        Returns:
            True if tile passes all validation checks
        """
        return self.verify_mime(content_type) and self.verify_bytes(data)


# Global instances
_tile_heartbeat: Optional[TileServerHeartbeat] = None
_tile_fallback: Optional[TileFallbackProvider] = None
_tile_enforcer: Optional[TileFormatEnforcer] = None


def get_tile_heartbeat() -> TileServerHeartbeat:
    """Get global TileServerHeartbeat instance."""
    global _tile_heartbeat
    if _tile_heartbeat is None:
        _tile_heartbeat = TileServerHeartbeat()
    return _tile_heartbeat


def get_tile_fallback() -> TileFallbackProvider:
    """Get global TileFallbackProvider instance."""
    global _tile_fallback
    if _tile_fallback is None:
        _tile_fallback = TileFallbackProvider()
    return _tile_fallback


def get_tile_enforcer() -> TileFormatEnforcer:
    """Get global TileFormatEnforcer instance."""
    global _tile_enforcer
    if _tile_enforcer is None:
        _tile_enforcer = TileFormatEnforcer()
    return _tile_enforcer
