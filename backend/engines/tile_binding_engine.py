"""
V83: Python Tile Binding Rebuild
Rebuilds the tile-binding layer between Python backend and frontend map engine.
Ensures backend returns real tiles, enforces 200 OK status, and provides readiness flag.
"""

import httpx
from typing import Dict, Optional, Tuple
from dataclasses import dataclass
import asyncio

@dataclass
class TileConfig:
    """V83: Tile server configuration"""
    base_url: str = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    dark_url: str = "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
    satellite_url: str = "https://s2maps-tiles.eu/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"
    terrain_url: str = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
    headers: Dict[str, str] = None
    enable_cache: bool = True
    cache_path: str = "/backend/cache/tiles/"
    ready: bool = False
    
    def __post_init__(self):
        if self.headers is None:
            self.headers = {"User-Agent": "PathFinder/V83"}

class TileBindingEngine:
    """V83: Manages tile fetching, validation, and binding"""
    
    def __init__(self):
        self.config = TileConfig()
        self._cache: Dict[str, Tuple[bytes, str]] = {}
        self._max_cache_size = 500
        self._client: Optional[httpx.AsyncClient] = None
        self._ready = False
    
    async def init(self):
        """Initialize HTTP client and verify tile servers"""
        self._client = httpx.AsyncClient(
            timeout=10.0,
            headers=self.config.headers,
            follow_redirects=True
        )
        # Test connectivity to tile servers
        await self._verify_tile_servers()
        self._ready = True
        self.config.ready = True
        print("[V83:TBE] Tile Binding Engine initialized - backend tile streams ready")
    
    async def _verify_tile_servers(self):
        """V83: Verify tile servers are reachable"""
        test_tiles = [
            (self.config.base_url.format(z=0, x=0, y=0), "base"),
            (self.config.terrain_url.format(z=0, x=0, y=0), "terrain"),
        ]
        for url, name in test_tiles:
            try:
                resp = await self._client.head(url, timeout=5.0)
                if resp.status_code in (200, 304):
                    print(f"[V83:TBE] {name} tile server verified: {url}")
            except Exception as e:
                print(f"[V83:TBE] Warning: {name} tile server check failed: {e}")
    
    async def fetch_tile(self, url: str, tile_type: str = "base") -> Tuple[bytes, str]:
        """
        V83: Fetch tile with validation
        Returns (tile_data, content_type)
        Raises HTTPException on failure
        """
        if not self._ready or not self._client:
            raise RuntimeError("TileBindingEngine not initialized")
        
        cache_key = f"{tile_type}:{url}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        try:
            resp = await self._client.get(url)
            if resp.status_code != 200:
                raise Exception(f"HTTP {resp.status_code}")
            
            data = resp.content
            if len(data) == 0:
                raise Exception("Empty tile response")
            
            ct = resp.headers.get("content-type", "image/png")
            
            # Cache tile
            if len(self._cache) < self._max_cache_size:
                self._cache[cache_key] = (data, ct)
            
            return data, ct
        except Exception as e:
            raise Exception(f"Tile fetch failed for {url}: {str(e)}")
    
    async def close(self):
        """Cleanup HTTP client"""
        if self._client:
            await self._client.aclose()
            self._client = None
        self._ready = False
        self.config.ready = False
    
    def is_ready(self) -> bool:
        """Check if tile binding engine is ready"""
        return self._ready and self.config.ready
    
    def get_config(self) -> Dict:
        """Return tile configuration for frontend"""
        return {
            "base_url": self.config.base_url,
            "dark_url": self.config.dark_url,
            "satellite_url": self.config.satellite_url,
            "terrain_url": self.config.terrain_url,
            "ready": self.config.ready
        }

# Singleton instance
_tile_binding_engine: Optional[TileBindingEngine] = None

def get_tile_binding_engine() -> TileBindingEngine:
    """Get singleton tile binding engine"""
    global _tile_binding_engine
    if _tile_binding_engine is None:
        _tile_binding_engine = TileBindingEngine()
    return _tile_binding_engine
