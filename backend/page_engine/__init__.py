"""
PATHFINDER V44/V45/V46 — PYTHON PAGE ENGINE (PPE)

The Python Page Engine is the core rendering and state management system
for the Pathfinder application. It provides:

- Server-side rendering with Jinja2 templates
- State management and synchronization
- Asset caching and delivery
- Incremental update system
- High-resolution icon serving
- Zero-lag page transitions
- V45: Universal location access page
- V46: Smart permission fallback + block detection

Target performance:
- Page load: < 150ms (V46)
- GPS sync: < 20ms
- Panel transitions: < 150ms
- Button response: < 40ms (V46)
- 60fps animations
"""

from .page_engine import PageEngine
from .sync_layer import SyncLayer
from .asset_manager import AssetManager
from .location_access import LocationAccessPage
from .permission_state import (
    LocationPermissionState,
    PermissionDiagnostics,
    PermissionDetector,
    FallbackNavigationMode,
    get_current_diagnostics,
    set_current_diagnostics
)

__all__ = [
    "PageEngine", 
    "SyncLayer", 
    "AssetManager", 
    "LocationAccessPage",
    # V46 Permission State Model
    "LocationPermissionState",
    "PermissionDiagnostics",
    "PermissionDetector",
    "FallbackNavigationMode",
    "get_current_diagnostics",
    "set_current_diagnostics",
]
