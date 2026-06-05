"""
PATHFINDER V44 — PYTHON PAGE ENGINE CORE

Responsibilities:
- Serve initial page bundle
- Generate incremental updates
- Manage page state transitions
- Cache templates and static assets
- Coordinate with Internal Sync Layer
"""

import time
from typing import Dict, Any, Optional, List
from jinja2 import Environment, FileSystemLoader, select_autoescape
from pathlib import Path
from dataclasses import dataclass, asdict


@dataclass
class PageState:
    """Current page state"""
    lockscreen_active: bool = True
    lockscreen_passcode: str = "598011"
    map_initialized: bool = False
    current_panel: Optional[str] = None
    scan_active: bool = False
    scan_mode: Optional[str] = None
    pipeline_state: str = "IDLE"
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    gps_accuracy: Optional[float] = None
    route_active: bool = False
    route_polyline: Optional[List[List[float]]] = None
    tracking_active: bool = False
    # V45: Location permission tracking
    gps_enabled: bool = False
    location_permission: str = "unknown"  # 'unknown', 'granted', 'denied', 'skipped'
    no_gps_mode: bool = False
    # V50: Map layer + navigation/action state (added without version banners)
    map_layer: str = "normal"            # 'normal', 'satellite', 'hybrid', '3d'
    map_pitch: float = 0.0               # degrees
    map_bearing: float = 0.0             # degrees
    navigation_state: str = "idle"       # 'idle','navigating','safe_return','exploring'
    action_in_progress: Optional[str] = None  # current action key while locked
    # V51: Gesture and preview state
    gesture_active: bool = False         # any gesture currently in progress
    preview_active: bool = False         # route preview mode active
    # V52: Offline mode tracking
    offline_mode: bool = False           # currently operating offline
    tiles_cached: int = 0                # number of tiles in offline cache
    routes_cached: int = 0               # number of routes in cache
    predictive_preload: bool = False     # predictive preload active
    version: int = 0  # State version for sync
    timestamp: float = 0.0


@dataclass
class PageUpdate:
    """Incremental page update"""
    update_type: str  # 'state', 'gps', 'route', 'panel', 'scan', 'pipeline'
    data: Dict[str, Any]
    version: int
    timestamp: float


class PageEngine:
    """
    Python Page Engine (PPE)
    
    Core rendering and state management system for Pathfinder V44.
    Provides server-side rendering, incremental updates, and state sync.
    """
    
    def __init__(self, template_dir: Optional[Path] = None):
        """Initialize the Page Engine"""
        if template_dir is None:
            template_dir = Path(__file__).parent / "templates"
        
        # Initialize Jinja2 environment
        self.env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=select_autoescape(['html', 'xml']),
            trim_blocks=True,
            lstrip_blocks=True
        )
        
        # Current page state
        self.state = PageState()
        
        # Update queue for incremental sync
        self.update_queue: List[PageUpdate] = []
        self.max_queue_size = 100
        
        # Performance tracking
        self.render_times: List[float] = []
        self.max_render_samples = 50
        
        # Template cache
        self.template_cache: Dict[str, Any] = {}
        
        print("[PPE] Python Page Engine initialized")
    
    def render_app_shell(self, **context) -> str:
        """
        Render the complete application shell
        
        Returns full HTML page with embedded state
        Target: < 300ms render time
        """
        start_time = time.time()
        
        # Merge context with current state
        full_context = {
            **asdict(self.state),
            **context,
            'render_time': None,  # Will be set after render
            'version': 'V44',
            'ppe_enabled': True
        }
        
        # Render template
        template = self.env.get_template('app_shell.html')
        html = template.render(**full_context)
        
        # Track render time
        render_time = (time.time() - start_time) * 1000
        self.render_times.append(render_time)
        if len(self.render_times) > self.max_render_samples:
            self.render_times.pop(0)
        
        print(f"[PPE] App shell rendered in {render_time:.2f}ms")
        return html
    
    def render_lockscreen(self) -> Dict[str, Any]:
        """Render lockscreen component"""
        template = self.env.get_template('lockscreen.html')
        return {
            'html': template.render(
                passcode=self.state.lockscreen_passcode,
                active=self.state.lockscreen_active
            ),
            'state': {
                'lockscreen_active': self.state.lockscreen_active
            }
        }
    
    def render_main_page(self) -> Dict[str, Any]:
        """Render main page with map and UI controls"""
        template = self.env.get_template('main_page.html')
        return {
            'html': template.render(
                map_initialized=self.state.map_initialized,
                current_panel=self.state.current_panel,
                gps_lat=self.state.gps_lat,
                gps_lon=self.state.gps_lon,
                route_active=self.state.route_active,
                tracking_active=self.state.tracking_active
            ),
            'state': {
                'map_initialized': self.state.map_initialized,
                'current_panel': self.state.current_panel
            }
        }
    
    def update_state(self, **updates) -> PageUpdate:
        """
        Update page state and create incremental update
        
        Returns PageUpdate object for sync layer
        Target: < 5ms update creation time
        """
        # Increment version
        self.state.version += 1
        self.state.timestamp = time.time()
        
        # Apply updates
        for key, value in updates.items():
            if hasattr(self.state, key):
                setattr(self.state, key, value)
        
        # Create update object
        update = PageUpdate(
            update_type='state',
            data=updates,
            version=self.state.version,
            timestamp=self.state.timestamp
        )
        
        # Add to queue
        self.update_queue.append(update)
        if len(self.update_queue) > self.max_queue_size:
            self.update_queue.pop(0)
        
        return update
    
    def update_gps(self, lat: float, lon: float, accuracy: float) -> PageUpdate:
        """
        Update GPS position
        
        Target: < 20ms from GPS event to update ready
        """
        self.state.version += 1
        self.state.timestamp = time.time()
        self.state.gps_lat = lat
        self.state.gps_lon = lon
        self.state.gps_accuracy = accuracy
        
        update = PageUpdate(
            update_type='gps',
            data={
                'lat': lat,
                'lon': lon,
                'accuracy': accuracy
            },
            version=self.state.version,
            timestamp=self.state.timestamp
        )
        
        self.update_queue.append(update)
        if len(self.update_queue) > self.max_queue_size:
            self.update_queue.pop(0)
        
        return update
    
    def update_route(self, polyline: List[List[float]], active: bool = True) -> PageUpdate:
        """
        Update route polyline
        
        Uses incremental updates for smooth rendering
        """
        self.state.version += 1
        self.state.timestamp = time.time()
        self.state.route_active = active
        self.state.route_polyline = polyline
        
        update = PageUpdate(
            update_type='route',
            data={
                'polyline': polyline,
                'active': active,
                'point_count': len(polyline) if polyline else 0
            },
            version=self.state.version,
            timestamp=self.state.timestamp
        )
        
        self.update_queue.append(update)
        if len(self.update_queue) > self.max_queue_size:
            self.update_queue.pop(0)
        
        return update
    
    def update_panel(self, panel_name: Optional[str]) -> PageUpdate:
        """
        Update current panel state
        
        Target: < 150ms panel transition
        """
        self.state.version += 1
        self.state.timestamp = time.time()
        self.state.current_panel = panel_name
        
        update = PageUpdate(
            update_type='panel',
            data={
                'panel': panel_name,
                'action': 'open' if panel_name else 'close'
            },
            version=self.state.version,
            timestamp=self.state.timestamp
        )
        
        self.update_queue.append(update)
        if len(self.update_queue) > self.max_queue_size:
            self.update_queue.pop(0)
        
        return update
    
    def update_scan(self, active: bool, mode: Optional[str] = None) -> PageUpdate:
        """Update scan animation state"""
        self.state.version += 1
        self.state.timestamp = time.time()
        self.state.scan_active = active
        self.state.scan_mode = mode
        
        update = PageUpdate(
            update_type='scan',
            data={
                'active': active,
                'mode': mode
            },
            version=self.state.version,
            timestamp=self.state.timestamp
        )
        
        self.update_queue.append(update)
        if len(self.update_queue) > self.max_queue_size:
            self.update_queue.pop(0)
        
        return update
    
    def update_pipeline(self, state: str) -> PageUpdate:
        """Update action pipeline state"""
        self.state.version += 1
        self.state.timestamp = time.time()
        self.state.pipeline_state = state
        
        update = PageUpdate(
            update_type='pipeline',
            data={
                'state': state
            },
            version=self.state.version,
            timestamp=self.state.timestamp
        )
        
        self.update_queue.append(update)
        if len(self.update_queue) > self.max_queue_size:
            self.update_queue.pop(0)
        
        return update
    
    def unlock_screen(self, passcode: str) -> bool:
        """Attempt to unlock screen"""
        if passcode == self.state.lockscreen_passcode:
            self.update_state(lockscreen_active=False, map_initialized=True)
            return True
        return False
    
    def get_pending_updates(self, since_version: int = 0) -> List[Dict[str, Any]]:
        """
        Get all updates since specified version
        
        Used for sync layer to send incremental updates
        """
        updates = [
            {
                'type': u.update_type,
                'data': u.data,
                'version': u.version,
                'timestamp': u.timestamp
            }
            for u in self.update_queue
            if u.version > since_version
        ]
        return updates
    
    def get_state_snapshot(self) -> Dict[str, Any]:
        """Get complete current state"""
        return {
            **asdict(self.state),
            'updates_pending': len(self.update_queue)
        }
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """Get performance statistics"""
        if not self.render_times:
            return {
                'avg_render_time': 0,
                'max_render_time': 0,
                'min_render_time': 0,
                'samples': 0
            }
        
        return {
            'avg_render_time': sum(self.render_times) / len(self.render_times),
            'max_render_time': max(self.render_times),
            'min_render_time': min(self.render_times),
            'samples': len(self.render_times),
            'target_render_time': 300,  # ms
            'meeting_target': max(self.render_times) < 300
        }
    
    def reset_state(self):
        """Reset page state to initial"""
        self.state = PageState()
        self.update_queue.clear()
        print("[PPE] State reset")


# Global PPE instance
_page_engine: Optional[PageEngine] = None


def get_page_engine() -> PageEngine:
    """Get global page engine instance"""
    global _page_engine
    if _page_engine is None:
        _page_engine = PageEngine()
    return _page_engine
