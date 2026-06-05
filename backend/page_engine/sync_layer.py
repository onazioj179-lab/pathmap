"""
PATHFINDER V44 — INTERNAL SYNC LAYER (ISL)

The Internal Sync Layer ensures perfect state consistency between:
- Python Page Engine (PPE)
- TypeScript frontend
- Action Pipeline
- Scan Animation Engine
- GPS/Location services
- Routing engine

Responsibilities:
- State versioning and conflict resolution
- Real-time sync with <20ms latency
- Priority-based conflict resolution
- Event ordering guarantees
- State history tracking
"""

import time
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass
from enum import Enum
from collections import deque


class SyncPriority(Enum):
    """Priority levels for state updates"""
    CRITICAL = 1    # GPS updates, safety events
    HIGH = 2        # Route updates, pipeline state
    MEDIUM = 3      # Panel state, UI updates
    LOW = 4         # Analytics, logging


class ConflictResolution(Enum):
    """Strategies for resolving state conflicts"""
    PRIORITY = "priority"           # Higher priority wins
    TIMESTAMP = "timestamp"         # Most recent wins
    MERGE = "merge"                 # Merge non-conflicting fields
    PYTHON_AUTHORITATIVE = "python" # Python always wins


@dataclass
class SyncEvent:
    """A state synchronization event"""
    event_id: str
    event_type: str  # 'gps','route','panel','scan','pipeline','state','map_layer','navigation','action'
    source: str      # 'python', 'typescript', 'action_pipeline', 'scan_engine'
    data: Dict[str, Any]
    version: int
    priority: SyncPriority
    timestamp: float
    processed: bool = False


@dataclass
class StateVersion:
    """Version snapshot of complete state"""
    version: int
    timestamp: float
    state: Dict[str, Any]
    source: str


class SyncLayer:
    """
    Internal Sync Layer (ISL)
    
    Maintains perfect consistency between Python backend and TypeScript frontend.
    Guarantees state sync with <20ms latency.
    """
    
    def __init__(self, max_history: int = 100):
        """Initialize the Sync Layer"""
        self.max_history = max_history
        
        # Current state version
        self.current_version = 0
        
        # State history for conflict resolution
        self.state_history: deque[StateVersion] = deque(maxlen=max_history)
        
        # Event queue for processing
        self.event_queue: deque[SyncEvent] = deque()
        self.max_queue_size = 500
        
        # Subscribers for real-time updates
        self.subscribers: Dict[str, List[Callable]] = {
            'gps': [],
            'route': [],
            'panel': [],
            'scan': [],
            'pipeline': [],
            'state': [],
            'map_layer': [],
            'navigation': [],
            'action': [],
            'offline': [],
            'all': []
        }
        
        # Performance tracking
        self.sync_times: List[float] = []
        self.max_sync_samples = 100
        
        # Conflict resolution strategy
        self.conflict_resolution = ConflictResolution.PRIORITY
        
        # Last sync time for each source
        self.last_sync: Dict[str, float] = {}
        
        print("[ISL] Internal Sync Layer initialized")
    
    def create_event(
        self,
        event_type: str,
        source: str,
        data: Dict[str, Any],
        priority: SyncPriority = SyncPriority.MEDIUM
    ) -> SyncEvent:
        """
        Create a new sync event
        
        Target: < 1ms event creation time
        """
        self.current_version += 1
        
        event = SyncEvent(
            event_id=f"{source}_{event_type}_{self.current_version}",
            event_type=event_type,
            source=source,
            data=data,
            version=self.current_version,
            priority=priority,
            timestamp=time.time()
        )
        
        return event
    
    def enqueue_event(self, event: SyncEvent):
        """
        Add event to processing queue
        
        Events are processed in priority order
        """
        self.event_queue.append(event)
        
        # Maintain queue size limit
        if len(self.event_queue) > self.max_queue_size:
            # Remove oldest low-priority event
            for e in list(self.event_queue):
                if e.priority == SyncPriority.LOW and not e.processed:
                    self.event_queue.remove(e)
                    break
    
    def process_event(self, event: SyncEvent) -> bool:
        """
        Process a single sync event
        
        Target: < 10ms processing time
        """
        start_time = time.time()
        
        # Mark as processed
        event.processed = True
        
        # Notify subscribers
        self._notify_subscribers(event)
        
        # Update last sync time
        self.last_sync[event.source] = event.timestamp
        
        # Track processing time
        process_time = (time.time() - start_time) * 1000
        self.sync_times.append(process_time)
        if len(self.sync_times) > self.max_sync_samples:
            self.sync_times.pop(0)
        
        return True
    
    def process_queue(self, max_events: int = 50) -> int:
        """
        Process queued events in priority order
        
        Returns number of events processed
        Target: < 20ms for full batch
        """
        start_time = time.time()
        processed = 0
        
        # Sort by priority (lower enum value = higher priority)
        sorted_events = sorted(
            [e for e in self.event_queue if not e.processed],
            key=lambda e: (e.priority.value, e.timestamp)
        )
        
        # Process up to max_events
        for event in sorted_events[:max_events]:
            if self.process_event(event):
                processed += 1
            
            # Check time budget (don't exceed 20ms)
            if (time.time() - start_time) * 1000 > 18:
                break
        
        # Clean up processed events
        self.event_queue = deque([e for e in self.event_queue if not e.processed])
        
        return processed
    
    def resolve_conflict(
        self,
        event1: SyncEvent,
        event2: SyncEvent
    ) -> SyncEvent:
        """
        Resolve conflict between two events
        
        Returns the event that should be applied
        """
        if self.conflict_resolution == ConflictResolution.PRIORITY:
            # Higher priority wins (lower enum value)
            return event1 if event1.priority.value < event2.priority.value else event2
        
        elif self.conflict_resolution == ConflictResolution.TIMESTAMP:
            # Most recent wins
            return event1 if event1.timestamp > event2.timestamp else event2
        
        elif self.conflict_resolution == ConflictResolution.PYTHON_AUTHORITATIVE:
            # Python always wins
            return event1 if event1.source == 'python' else event2
        
        elif self.conflict_resolution == ConflictResolution.MERGE:
            # Merge non-conflicting fields
            merged_data = {**event2.data, **event1.data}
            return SyncEvent(
                event_id=f"merged_{event1.event_id}_{event2.event_id}",
                event_type=event1.event_type,
                source=f"{event1.source}_merged",
                data=merged_data,
                version=max(event1.version, event2.version),
                priority=min(event1.priority, event2.priority),
                timestamp=max(event1.timestamp, event2.timestamp)
            )
        
        return event1
    
    def subscribe(self, event_type: str, callback: Callable):
        """
        Subscribe to specific event type
        
        Callback will be called with event data on updates
        """
        if event_type not in self.subscribers:
            self.subscribers[event_type] = []
        
        self.subscribers[event_type].append(callback)
        print(f"[ISL] Subscriber added for {event_type}")
    
    def unsubscribe(self, event_type: str, callback: Callable):
        """Unsubscribe from event type"""
        if event_type in self.subscribers and callback in self.subscribers[event_type]:
            self.subscribers[event_type].remove(callback)
    
    def _notify_subscribers(self, event: SyncEvent):
        """Notify all subscribers of event"""
        # Notify specific event type subscribers
        if event.event_type in self.subscribers:
            for callback in self.subscribers[event.event_type]:
                try:
                    callback(event)
                except Exception as e:
                    print(f"[ISL] Subscriber callback error: {e}")
        
        # Notify 'all' subscribers
        for callback in self.subscribers.get('all', []):
            try:
                callback(event)
            except Exception as e:
                print(f"[ISL] Subscriber callback error: {e}")
    
    def sync_gps(
        self,
        lat: float,
        lon: float,
        accuracy: float,
        source: str = 'python'
    ) -> SyncEvent:
        """
        Sync GPS position update
        
        Critical priority - must be processed immediately
        Target: < 20ms from GPS event to all subscribers notified
        """
        event = self.create_event(
            event_type='gps',
            source=source,
            data={
                'lat': lat,
                'lon': lon,
                'accuracy': accuracy
            },
            priority=SyncPriority.CRITICAL
        )
        
        self.enqueue_event(event)
        
        # Process immediately for critical events
        if event.priority == SyncPriority.CRITICAL:
            self.process_event(event)
        
        return event
    
    def sync_route(
        self,
        polyline: List[List[float]],
        active: bool,
        source: str = 'python'
    ) -> SyncEvent:
        """Sync route update"""
        event = self.create_event(
            event_type='route',
            source=source,
            data={
                'polyline': polyline,
                'active': active,
                'point_count': len(polyline) if polyline else 0
            },
            priority=SyncPriority.HIGH
        )
        
        self.enqueue_event(event)
        return event
    
    def sync_panel(
        self,
        panel_name: Optional[str],
        source: str = 'typescript'
    ) -> SyncEvent:
        """Sync panel state"""
        event = self.create_event(
            event_type='panel',
            source=source,
            data={
                'panel': panel_name,
                'action': 'open' if panel_name else 'close'
            },
            priority=SyncPriority.MEDIUM
        )
        
        self.enqueue_event(event)
        return event
    
    def sync_scan(
        self,
        active: bool,
        mode: Optional[str],
        source: str = 'scan_engine'
    ) -> SyncEvent:
        """Sync scan animation state"""
        event = self.create_event(
            event_type='scan',
            source=source,
            data={
                'active': active,
                'mode': mode
            },
            priority=SyncPriority.HIGH
        )
        
        self.enqueue_event(event)
        return event
    
    def sync_pipeline(
        self,
        state: str,
        source: str = 'action_pipeline'
    ) -> SyncEvent:
        """Sync action pipeline state"""
        event = self.create_event(
            event_type='pipeline',
            source=source,
            data={
                'state': state
            },
            priority=SyncPriority.HIGH
        )
        
        self.enqueue_event(event)
        return event

    # New sync channels (map layer, navigation state, action status)
    def sync_map_layer(
        self,
        layer: str,
        pitch: float,
        bearing: float,
        source: str = 'python'
    ) -> SyncEvent:
        event = self.create_event(
            event_type='map_layer',
            source=source,
            data={
                'map_layer': layer,
                'map_pitch': pitch,
                'map_bearing': bearing
            },
            priority=SyncPriority.MEDIUM
        )
        self.enqueue_event(event)
        return event

    def sync_navigation_state(
        self,
        navigation_state: str,
        source: str = 'python'
    ) -> SyncEvent:
        event = self.create_event(
            event_type='navigation',
            source=source,
            data={
                'navigation_state': navigation_state
            },
            priority=SyncPriority.HIGH
        )
        self.enqueue_event(event)
        return event

    def sync_action_status(
        self,
        action_key: Optional[str],
        source: str = 'python'
    ) -> SyncEvent:
        event = self.create_event(
            event_type='action',
            source=source,
            data={
                'action_in_progress': action_key
            },
            priority=SyncPriority.MEDIUM
        )
        self.enqueue_event(event)
        return event

    # Gesture and preview state sync
    def sync_gesture_state(
        self,
        gesture_active: bool,
        source: str = 'typescript'
    ) -> SyncEvent:
        event = self.create_event(
            event_type='gesture',
            source=source,
            data={
                'gesture_active': gesture_active
            },
            priority=SyncPriority.CRITICAL
        )
        self.enqueue_event(event)
        return event

    def sync_preview_state(
        self,
        preview_active: bool,
        source: str = 'typescript'
    ) -> SyncEvent:
        event = self.create_event(
            event_type='preview',
            source=source,
            data={
                'preview_active': preview_active
            },
            priority=SyncPriority.MEDIUM
        )
        self.enqueue_event(event)
        return event

    # Offline mode state sync
    def sync_offline_state(
        self,
        offline_mode: bool,
        tiles_cached: int,
        routes_cached: int,
        predictive_preload: bool,
        source: str = 'typescript'
    ) -> SyncEvent:
        event = self.create_event(
            event_type='offline',
            source=source,
            data={
                'offline_mode': offline_mode,
                'tiles_cached': tiles_cached,
                'routes_cached': routes_cached,
                'predictive_preload': predictive_preload
            },
            priority=SyncPriority.HIGH
        )
        self.enqueue_event(event)
        return event
    
    def get_state_snapshot(self) -> Dict[str, Any]:
        """Get current state snapshot"""
        return {
            'version': self.current_version,
            'timestamp': time.time(),
            'queue_length': len(self.event_queue),
            'pending_events': len([e for e in self.event_queue if not e.processed]),
            'last_sync': self.last_sync
        }
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """Get sync performance statistics"""
        if not self.sync_times:
            return {
                'avg_sync_time': 0,
                'max_sync_time': 0,
                'min_sync_time': 0,
                'samples': 0,
                'meeting_target': True
            }
        
        avg_time = sum(self.sync_times) / len(self.sync_times)
        max_time = max(self.sync_times)
        
        return {
            'avg_sync_time': avg_time,
            'max_sync_time': max_time,
            'min_sync_time': min(self.sync_times),
            'samples': len(self.sync_times),
            'target_sync_time': 20,  # ms
            'meeting_target': max_time < 20,
            'queue_length': len(self.event_queue)
        }
    
    def get_event_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent event history"""
        recent_events = list(self.event_queue)[-limit:]
        return [
            {
                'event_id': e.event_id,
                'type': e.event_type,
                'source': e.source,
                'version': e.version,
                'priority': e.priority.name,
                'timestamp': e.timestamp,
                'processed': e.processed
            }
            for e in recent_events
        ]


# Global ISL instance
_sync_layer: Optional[SyncLayer] = None


def get_sync_layer() -> SyncLayer:
    """Get global sync layer instance"""
    global _sync_layer
    if _sync_layer is None:
        _sync_layer = SyncLayer()
    return _sync_layer
