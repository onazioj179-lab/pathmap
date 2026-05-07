"""
V14 - Landmark Database
Simple JSON-based landmark storage (no authentication needed).
"""

import json
import os
from typing import List, Dict, Any, Optional
from pathlib import Path


class LandmarkDatabase:
    """Local landmark database for safe navigation."""
    
    def __init__(self, db_path: str = None):
        if db_path is None:
            # Default to landmarks.json in same directory
            db_path = Path(__file__).parent / 'landmarks.json'
        self.db_path = db_path
        self.landmarks: Dict[str, List[Dict[str, Any]]] = {
            'safe': [],      # Police, hospitals, fire stations
            'personal': [],  # User's custom landmarks
            'poi': []        # Points of interest
        }
        self.load()
        
    def load(self):
        """Load landmarks from JSON file."""
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'r') as f:
                    data = json.load(f)
                    self.landmarks = data
            except Exception as e:
                print(f"Error loading landmarks: {e}")
                self._init_default_landmarks()
        else:
            self._init_default_landmarks()
            self.save()
            
    def save(self):
        """Save landmarks to JSON file."""
        try:
            with open(self.db_path, 'w') as f:
                json.dump(self.landmarks, f, indent=2)
        except Exception as e:
            print(f"Error saving landmarks: {e}")
            
    def _init_default_landmarks(self):
        """Initialize with some default Berkeley/Oakland area landmarks."""
        self.landmarks = {
            'safe': [
                {
                    'id': 'safe_1',
                    'name': 'Berkeley Police Department',
                    'type': 'police',
                    'lat': 37.8697,
                    'lon': -122.2735
                },
                {
                    'id': 'safe_2',
                    'name': 'Alta Bates Summit Medical Center',
                    'type': 'hospital',
                    'lat': 37.8574,
                    'lon': -122.2645
                }
            ],
            'personal': [],
            'poi': [
                {
                    'id': 'poi_1',
                    'name': 'UC Berkeley Campus',
                    'type': 'university',
                    'lat': 37.8719,
                    'lon': -122.2585
                }
            ]
        }
        
    def get_all_landmarks(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get all landmarks."""
        return self.landmarks
        
    def get_landmarks_by_category(self, category: str) -> List[Dict[str, Any]]:
        """Get landmarks in a specific category."""
        return self.landmarks.get(category, [])
        
    def add_landmark(self, category: str, name: str, lat: float, lon: float, 
                    landmark_type: str = 'custom') -> Dict[str, Any]:
        """Add a new landmark."""
        import uuid
        landmark = {
            'id': f"{category}_{uuid.uuid4().hex[:8]}",
            'name': name,
            'type': landmark_type,
            'lat': lat,
            'lon': lon,
            'created_at': str(os.times())
        }
        
        if category not in self.landmarks:
            self.landmarks[category] = []
            
        self.landmarks[category].append(landmark)
        self.save()
        return landmark
        
    def remove_landmark(self, landmark_id: str) -> bool:
        """Remove a landmark by ID."""
        for category in self.landmarks:
            self.landmarks[category] = [
                lm for lm in self.landmarks[category]
                if lm.get('id') != landmark_id
            ]
        self.save()
        return True
        
    def find_nearest_landmark(self, lat: float, lon: float, 
                            category: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Find nearest landmark to given coordinates."""
        import math
        
        search_landmarks = []
        if category:
            search_landmarks = self.landmarks.get(category, [])
        else:
            # Search all categories
            for cat in self.landmarks.values():
                search_landmarks.extend(cat)
                
        if not search_landmarks:
            return None
            
        nearest = None
        min_dist = float('inf')
        
        for lm in search_landmarks:
            dist = math.hypot(lm['lat'] - lat, lm['lon'] - lon)
            if dist < min_dist:
                min_dist = dist
                nearest = lm
                
        return nearest
        
    def search_landmarks(self, query: str) -> List[Dict[str, Any]]:
        """Search landmarks by name."""
        results = []
        query_lower = query.lower()
        
        for category in self.landmarks.values():
            for lm in category:
                if query_lower in lm.get('name', '').lower():
                    results.append(lm)
                    
        return results
