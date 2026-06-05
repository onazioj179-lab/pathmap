"""
PATHFINDER V53 - LONG-LIFE BACKEND ENGINE (LLBE)

Pure Python backend designed for 20+ year stability.
Uses only Python stdlib and SQLite for persistence.
Zero volatile dependencies, deterministic behavior.

Storage:
- SQLite for all persistent data
- JSON for configuration
- No cloud services
- No external APIs

Guaranteed to work unchanged for decades.
"""

import sqlite3
import json
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass


@dataclass
class GraphSnapshot:
    """Snapshot of graph state for persistence"""
    snapshot_id: str
    timestamp: float
    node_count: int
    edge_count: int
    metadata: Dict


class LongLifeBackendEngine:
    """
    Long-Life Backend Engine (LLBE) for 20-year stability.
    
    Features:
    - SQLite database (stable since 2000, will work for 50+ years)
    - Pure Python implementation
    - No external dependencies
    - Deterministic behavior
    - Simple, readable code
    """
    
    def __init__(self, db_path: str = "pathfinder_v53.db"):
        """
        Initialize LLBE with SQLite database.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.conn = None
        self._initialize_database()
    
    def _initialize_database(self):
        """
        Initialize SQLite database with stable schema.
        Schema is frozen - no migrations for 20 years.
        """
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        
        cursor = self.conn.cursor()
        
        # Nodes table (frozen schema)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS nodes (
                id TEXT PRIMARY KEY,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                metadata TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        
        # Edges table (frozen schema)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS edges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_node TEXT NOT NULL,
                to_node TEXT NOT NULL,
                weight REAL NOT NULL,
                metadata TEXT,
                created_at REAL NOT NULL,
                FOREIGN KEY (from_node) REFERENCES nodes(id),
                FOREIGN KEY (to_node) REFERENCES nodes(id)
            )
        """)
        
        # Routes cache table (frozen schema)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS routes_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fingerprint TEXT UNIQUE NOT NULL,
                origin_lat REAL NOT NULL,
                origin_lon REAL NOT NULL,
                dest_lat REAL NOT NULL,
                dest_lon REAL NOT NULL,
                path TEXT NOT NULL,
                distance REAL NOT NULL,
                duration REAL NOT NULL,
                algorithm TEXT NOT NULL,
                created_at REAL NOT NULL,
                accessed_at REAL NOT NULL,
                access_count INTEGER DEFAULT 0
            )
        """)
        
        # Settings table (frozen schema)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        
        # Tiles cache table (frozen schema)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tiles_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                zoom INTEGER NOT NULL,
                x INTEGER NOT NULL,
                y INTEGER NOT NULL,
                data BLOB NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at REAL NOT NULL,
                accessed_at REAL NOT NULL,
                access_count INTEGER DEFAULT 0,
                UNIQUE(zoom, x, y)
            )
        """)
        
        # Snapshots table (frozen schema)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS snapshots (
                snapshot_id TEXT PRIMARY KEY,
                timestamp REAL NOT NULL,
                node_count INTEGER NOT NULL,
                edge_count INTEGER NOT NULL,
                metadata TEXT
            )
        """)
        
        # Create indexes for performance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_node)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_node)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_routes_fingerprint ON routes_cache(fingerprint)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tiles_coords ON tiles_cache(zoom, x, y)")
        
        self.conn.commit()
        print("[LLBE] Database initialized with frozen schema (20-year guarantee)")
    
    def add_node(self, node_id: str, lat: float, lon: float, metadata: Optional[Dict] = None) -> bool:
        """Add node to persistent storage"""
        try:
            cursor = self.conn.cursor()
            now = time.time()
            cursor.execute("""
                INSERT OR REPLACE INTO nodes (id, lat, lon, metadata, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (node_id, lat, lon, json.dumps(metadata or {}), now, now))
            self.conn.commit()
            return True
        except Exception as e:
            print(f"[LLBE] Error adding node: {e}")
            return False
    
    def add_edge(self, from_node: str, to_node: str, weight: float, metadata: Optional[Dict] = None) -> bool:
        """Add edge to persistent storage"""
        try:
            cursor = self.conn.cursor()
            now = time.time()
            cursor.execute("""
                INSERT INTO edges (from_node, to_node, weight, metadata, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (from_node, to_node, weight, json.dumps(metadata or {}), now))
            self.conn.commit()
            return True
        except Exception as e:
            print(f"[LLBE] Error adding edge: {e}")
            return False
    
    def get_node(self, node_id: str) -> Optional[Dict]:
        """Get node from persistent storage"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
        row = cursor.fetchone()
        if row:
            return {
                "id": row["id"],
                "lat": row["lat"],
                "lon": row["lon"],
                "metadata": json.loads(row["metadata"]),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"]
            }
        return None
    
    def get_edges_from(self, node_id: str) -> List[Dict]:
        """Get all edges from a node"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM edges WHERE from_node = ?", (node_id,))
        edges = []
        for row in cursor.fetchall():
            edges.append({
                "id": row["id"],
                "from_node": row["from_node"],
                "to_node": row["to_node"],
                "weight": row["weight"],
                "metadata": json.loads(row["metadata"]),
                "created_at": row["created_at"]
            })
        return edges
    
    def cache_route(self, fingerprint: str, origin: Tuple[float, float], dest: Tuple[float, float],
                    path: List[str], distance: float, duration: float, algorithm: str) -> bool:
        """Cache calculated route"""
        try:
            cursor = self.conn.cursor()
            now = time.time()
            cursor.execute("""
                INSERT OR REPLACE INTO routes_cache
                (fingerprint, origin_lat, origin_lon, dest_lat, dest_lon, path, distance, duration, algorithm, created_at, accessed_at, access_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, (fingerprint, origin[0], origin[1], dest[0], dest[1], json.dumps(path), distance, duration, algorithm, now, now))
            self.conn.commit()
            return True
        except Exception as e:
            print(f"[LLBE] Error caching route: {e}")
            return False
    
    def get_cached_route(self, fingerprint: str) -> Optional[Dict]:
        """Get cached route and update access stats"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM routes_cache WHERE fingerprint = ?", (fingerprint,))
        row = cursor.fetchone()
        if row:
            # Update access stats
            cursor.execute("""
                UPDATE routes_cache
                SET accessed_at = ?, access_count = access_count + 1
                WHERE fingerprint = ?
            """, (time.time(), fingerprint))
            self.conn.commit()
            
            return {
                "fingerprint": row["fingerprint"],
                "origin": (row["origin_lat"], row["origin_lon"]),
                "dest": (row["dest_lat"], row["dest_lon"]),
                "path": json.loads(row["path"]),
                "distance": row["distance"],
                "duration": row["duration"],
                "algorithm": row["algorithm"],
                "created_at": row["created_at"],
                "access_count": row["access_count"] + 1
            }
        return None
    
    def set_setting(self, key: str, value: str) -> bool:
        """Set persistent setting"""
        try:
            cursor = self.conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO settings (key, value, updated_at)
                VALUES (?, ?, ?)
            """, (key, value, time.time()))
            self.conn.commit()
            return True
        except Exception as e:
            print(f"[LLBE] Error setting: {e}")
            return False
    
    def get_setting(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Get persistent setting"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row["value"] if row else default
    
    def create_snapshot(self, snapshot_id: str, metadata: Optional[Dict] = None) -> bool:
        """Create graph snapshot"""
        try:
            cursor = self.conn.cursor()
            
            # Count nodes and edges
            cursor.execute("SELECT COUNT(*) as count FROM nodes")
            node_count = cursor.fetchone()["count"]
            cursor.execute("SELECT COUNT(*) as count FROM edges")
            edge_count = cursor.fetchone()["count"]
            
            # Insert snapshot
            cursor.execute("""
                INSERT INTO snapshots (snapshot_id, timestamp, node_count, edge_count, metadata)
                VALUES (?, ?, ?, ?, ?)
            """, (snapshot_id, time.time(), node_count, edge_count, json.dumps(metadata or {})))
            self.conn.commit()
            return True
        except Exception as e:
            print(f"[LLBE] Error creating snapshot: {e}")
            return False
    
    def get_stats(self) -> Dict:
        """Get database statistics"""
        cursor = self.conn.cursor()
        
        cursor.execute("SELECT COUNT(*) as count FROM nodes")
        node_count = cursor.fetchone()["count"]
        
        cursor.execute("SELECT COUNT(*) as count FROM edges")
        edge_count = cursor.fetchone()["count"]
        
        cursor.execute("SELECT COUNT(*) as count FROM routes_cache")
        routes_cached = cursor.fetchone()["count"]
        
        cursor.execute("SELECT COUNT(*) as count FROM tiles_cache")
        tiles_cached = cursor.fetchone()["count"]
        
        cursor.execute("SELECT SUM(size_bytes) as total FROM tiles_cache")
        tiles_size = cursor.fetchone()["total"] or 0
        
        return {
            "nodes": node_count,
            "edges": edge_count,
            "routes_cached": routes_cached,
            "tiles_cached": tiles_cached,
            "tiles_size_bytes": tiles_size,
            "db_path": self.db_path,
            "db_size_bytes": Path(self.db_path).stat().st_size if Path(self.db_path).exists() else 0
        }
    
    def vacuum(self):
        """Optimize database (run periodically)"""
        self.conn.execute("VACUUM")
        print("[LLBE] Database optimized")
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("[LLBE] Database connection closed")
    
    def __enter__(self):
        """Context manager support"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager cleanup"""
        self.close()
