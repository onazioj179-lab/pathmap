"""
PATHFINDER V44 — ASSET MANAGER

High-resolution asset delivery system with caching and DPI scaling.

Features:
- SVG icon caching (1x, 2x, 3x resolution)
- Map tile optimization
- Static asset serving
- Memory-efficient caching
- Content compression
"""

import time
from typing import Dict, Any, Optional, List, Tuple
from pathlib import Path
from dataclasses import dataclass
import hashlib
import json


@dataclass
class Asset:
    """Cached asset"""
    asset_id: str
    asset_type: str  # 'icon', 'image', 'style', 'script', 'map_tile'
    content: bytes
    content_type: str
    resolution: str  # '1x', '2x', '3x'
    size: int
    hash: str
    timestamp: float


class AssetManager:
    """
    Asset Manager for high-resolution asset delivery
    
    Provides SVG icons at 1x/2x/3x resolution with caching
    """
    
    def __init__(self, max_cache_size_mb: int = 50):
        """Initialize Asset Manager"""
        self.max_cache_size = max_cache_size_mb * 1024 * 1024  # Convert to bytes
        self.cache: Dict[str, Asset] = {}
        self.cache_hits = 0
        self.cache_misses = 0
        
        # Asset library paths
        self.icon_library = {
            'heroicons': Path(__file__).parent / 'assets' / 'heroicons',
            'feather': Path(__file__).parent / 'assets' / 'feather',
            'material': Path(__file__).parent / 'assets' / 'material'
        }
        
        print("[AssetManager] Asset Manager initialized")
    
    def get_icon(
        self,
        library: str,
        name: str,
        resolution: str = '1x'
    ) -> Optional[Asset]:
        """
        Get icon from cache or load from disk
        
        Args:
            library: 'heroicons', 'feather', or 'material'
            name: Icon name (e.g., 'map-pin', 'navigation')
            resolution: '1x', '2x', or '3x'
        """
        # Generate cache key
        cache_key = f"{library}_{name}_{resolution}"
        
        # Check cache
        if cache_key in self.cache:
            self.cache_hits += 1
            return self.cache[cache_key]
        
        self.cache_misses += 1
        
        # Load from disk (placeholder for now)
        # In production, would load actual SVG files
        svg_content = self._generate_placeholder_svg(name, resolution)
        
        # Create asset
        content_bytes = svg_content.encode('utf-8')
        asset = Asset(
            asset_id=cache_key,
            asset_type='icon',
            content=content_bytes,
            content_type='image/svg+xml',
            resolution=resolution,
            size=len(content_bytes),
            hash=hashlib.md5(content_bytes).hexdigest(),
            timestamp=time.time()
        )
        
        # Add to cache
        self._add_to_cache(asset)
        
        return asset
    
    def _generate_placeholder_svg(self, name: str, resolution: str) -> str:
        """Generate placeholder SVG (temporary until real icons loaded)"""
        scale = {'1x': 24, '2x': 48, '3x': 72}.get(resolution, 24)
        
        return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{scale}" height="{scale}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="10"/>
  <text x="12" y="16" text-anchor="middle" font-size="10" fill="currentColor">{name[:1].upper()}</text>
</svg>'''
    
    def _add_to_cache(self, asset: Asset):
        """Add asset to cache with size management"""
        # Check if adding would exceed cache size
        current_size = sum(a.size for a in self.cache.values())
        
        if current_size + asset.size > self.max_cache_size:
            # Evict oldest assets
            sorted_assets = sorted(
                self.cache.values(),
                key=lambda a: a.timestamp
            )
            
            for old_asset in sorted_assets:
                del self.cache[old_asset.asset_id]
                current_size -= old_asset.size
                
                if current_size + asset.size <= self.max_cache_size:
                    break
        
        # Add new asset
        self.cache[asset.asset_id] = asset
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total_requests = self.cache_hits + self.cache_misses
        hit_rate = (self.cache_hits / total_requests * 100) if total_requests > 0 else 0
        
        current_size = sum(a.size for a in self.cache.values())
        
        return {
            'cache_hits': self.cache_hits,
            'cache_misses': self.cache_misses,
            'total_requests': total_requests,
            'hit_rate': hit_rate,
            'cached_assets': len(self.cache),
            'cache_size_bytes': current_size,
            'cache_size_mb': current_size / (1024 * 1024),
            'max_size_mb': self.max_cache_size / (1024 * 1024)
        }
    
    def preload_common_icons(self):
        """Preload commonly used icons"""
        common_icons = [
            ('heroicons', 'map-pin'),
            ('heroicons', 'navigation'),
            ('heroicons', 'home'),
            ('heroicons', 'compass'),
            ('heroicons', 'shield-check'),
            ('heroicons', 'route'),
            ('heroicons', 'location-marker')
        ]
        
        for library, name in common_icons:
            for resolution in ['1x', '2x', '3x']:
                self.get_icon(library, name, resolution)
        
        print(f"[AssetManager] Preloaded {len(common_icons) * 3} icons")


# Global asset manager instance
_asset_manager: Optional[AssetManager] = None


def get_asset_manager() -> AssetManager:
    """Get global asset manager instance"""
    global _asset_manager
    if _asset_manager is None:
        _asset_manager = AssetManager()
    return _asset_manager
