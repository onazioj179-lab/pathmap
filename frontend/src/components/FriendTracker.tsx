/**
 * PATHMAP V94 - Friend Tracker Component
 * 
 * Real-time tracking visualization for friends with:
 * - Animated tracking line following the target
 * - Self-calibrating using compass and satellite GPS
 * - Precision indicators showing tracking quality
 * - Works for any trackable target (not just friends)
 */

declare const L: any;

import React, { useEffect, useState, useRef } from 'react';
import { getPrecisionTrackingService, TrackedPosition } from '../services/precisionTrackingService';
import { sharingService, FriendLocation } from '../services/sharingService';

interface TrackingTarget {
  id: string;
  name: string;
  type: 'self' | 'friend' | 'device';
  position?: TrackedPosition | FriendLocation;
  trail?: [number, number][];
  lastUpdate?: number;
}

interface FriendTrackerProps {
  map: any; // Leaflet map instance
  onTargetSelect?: (target: TrackingTarget) => void;
}

const FriendTracker: React.FC<FriendTrackerProps> = ({ map, onTargetSelect }) => {
  const [isTracking, setIsTracking] = useState(false);
  const [activeTargets, setActiveTargets] = useState<TrackingTarget[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [myPosition, setMyPosition] = useState<TrackedPosition | null>(null);
  const [trackingStats, setTrackingStats] = useState<any>(null);
  const [showStats, setShowStats] = useState(false);

  const trackingService = useRef(getPrecisionTrackingService());
  const markersRef = useRef<Map<string, any>>(new Map());
  const trailsRef = useRef<Map<string, any>>(new Map());
  const refreshInterval = useRef<number | null>(null);

  // Initialize tracking
  useEffect(() => {
    const service = trackingService.current;

    // Listen for position updates
    service.addPositionListener((position: TrackedPosition) => {
      setMyPosition(position);
      updateMyMarker(position);
    });

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
      clearAllMarkers();
    };
  }, []);

  // Fetch friend locations periodically
  useEffect(() => {
    if (isTracking) {
      fetchFriendLocations();
      refreshInterval.current = window.setInterval(fetchFriendLocations, 3000);
    } else {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
        refreshInterval.current = null;
      }
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [isTracking]);

  const fetchFriendLocations = async () => {
    try {
      const locations = await sharingService.getFriendLocations();
      
      setActiveTargets(prev => {
        const newTargets = [...prev.filter(t => t.type === 'self')];
        
        for (const loc of locations) {
          const existing = prev.find(t => t.id === loc.user_id);
          newTargets.push({
            id: loc.user_id,
            name: loc.display_name,
            type: 'friend',
            position: loc,
            trail: existing?.trail || [],
            lastUpdate: Date.now()
          });
        }
        
        return newTargets;
      });

      // Update friend markers on map
      for (const loc of locations) {
        updateFriendMarker(loc);
      }
    } catch (e) {
      console.error('[FriendTracker] Failed to fetch friend locations:', e);
    }
  };

  const startTracking = () => {
    const result = trackingService.current.startTracking();
    if (result.status === 'started' || result.status === 'already_active') {
      setIsTracking(true);
      
      // Add self to targets
      setActiveTargets(prev => {
        if (!prev.find(t => t.type === 'self')) {
          return [...prev, {
            id: 'self',
            name: 'My Location',
            type: 'self',
            trail: []
          }];
        }
        return prev;
      });
    }
  };

  const stopTracking = () => {
    const stats = trackingService.current.stopTracking();
    setIsTracking(false);
    setTrackingStats(stats);
  };

  const updateMyMarker = (position: TrackedPosition) => {
    if (!map || typeof L === 'undefined') return;

    let marker = markersRef.current.get('self');
    
    if (!marker) {
      const icon = createTrackingIcon(position, true);
      marker = L.marker([position.latitude, position.longitude], {
        icon,
        zIndexOffset: 1000
      }).addTo(map);
      markersRef.current.set('self', marker);
    } else {
      marker.setLatLng([position.latitude, position.longitude]);
      marker.setIcon(createTrackingIcon(position, true));
    }

    // Update trail
    updateTrail('self', position.latitude, position.longitude);
  };

  const updateFriendMarker = (location: FriendLocation) => {
    if (!map || typeof L === 'undefined') return;

    let marker = markersRef.current.get(location.user_id);
    
    if (!marker) {
      const icon = createFriendIcon(location);
      marker = L.marker([location.latitude, location.longitude], {
        icon,
        zIndexOffset: 500
      }).addTo(map);
      
      marker.bindPopup(`
        <div style="text-align: center; min-width: 120px;">
          <strong>${location.display_name}</strong><br>
          <span style="color: #666; font-size: 12px;">
            ${location.precision} precision
          </span>
        </div>
      `);
      
      markersRef.current.set(location.user_id, marker);
    } else {
      marker.setLatLng([location.latitude, location.longitude]);
    }

    // Update trail for friend
    updateTrail(location.user_id, location.latitude, location.longitude);
  };

  const updateTrail = (targetId: string, lat: number, lon: number) => {
    if (!map || typeof L === 'undefined') return;

    let trail = trailsRef.current.get(targetId);
    
    if (!trail) {
      const color = targetId === 'self' ? '#00ccff' : '#ff6699';
      trail = L.polyline([], {
        color,
        weight: 3,
        opacity: 0.7,
        smoothFactor: 1
      }).addTo(map);
      trailsRef.current.set(targetId, trail);
    }

    // Add point to trail
    const latlngs = trail.getLatLngs();
    latlngs.push([lat, lon]);
    
    // Keep only last 200 points
    if (latlngs.length > 200) {
      latlngs.shift();
    }
    
    trail.setLatLngs(latlngs);
  };

  const createTrackingIcon = (position: TrackedPosition, isSelf: boolean) => {
    const color = getQualityColor(position.sourceQuality);
    const size = isSelf ? 40 : 32;
    
    return L.divIcon({
      className: 'precision-tracking-marker',
      html: `
        <div style="
          width: ${size}px;
          height: ${size}px;
          position: relative;
        ">
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: ${color}33;
            animation: pulse 2s ease-in-out infinite;
          "></div>
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: ${size * 0.6}px;
            height: ${size * 0.6}px;
            border-radius: 50%;
            background: linear-gradient(135deg, ${color}, ${color}cc);
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          "></div>
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -100%) rotate(${position.heading}deg);
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-bottom: 12px solid ${color};
          "></div>
        </div>
        <style>
          @keyframes pulse {
            0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
            50% { transform: translate(-50%, -50%) scale(1.4); opacity: 0.2; }
          }
        </style>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  };

  const createFriendIcon = (location: FriendLocation) => {
    const initial = location.display_name.charAt(0).toUpperCase();
    
    return L.divIcon({
      className: 'friend-tracking-marker',
      html: `
        <div style="
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff6699, #ff3366);
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 16px;
        ">${initial}</div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
  };

  const getQualityColor = (quality: string): string => {
    switch (quality) {
      case 'excellent': return '#00ff88';
      case 'good': return '#00ccff';
      case 'fair': return '#ffcc00';
      case 'poor': return '#ff6600';
      case 'dead_reckoning': return '#ff0066';
      default: return '#00ccff';
    }
  };

  const clearAllMarkers = () => {
    markersRef.current.forEach(marker => {
      if (map && map.hasLayer(marker)) {
        map.removeLayer(marker);
      }
    });
    markersRef.current.clear();

    trailsRef.current.forEach(trail => {
      if (map && map.hasLayer(trail)) {
        map.removeLayer(trail);
      }
    });
    trailsRef.current.clear();
  };

  const centerOnTarget = (targetId: string) => {
    const target = activeTargets.find(t => t.id === targetId);
    if (target?.position && map) {
      const pos = target.position;
      const lat = 'latitude' in pos ? pos.latitude : (pos as any).lat;
      const lon = 'longitude' in pos ? pos.longitude : (pos as any).lon;
      map.setView([lat, lon], 17);
    }
    setSelectedTarget(targetId);
    onTargetSelect?.(target!);
  };

  return (
    <div className="friend-tracker bg-gray-900 rounded-xl p-4 max-w-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">Precision Tracking</h3>
        <button
          onClick={() => setShowStats(!showStats)}
          className="text-gray-400 hover:text-white text-sm"
        >
          {showStats ? 'Hide Stats' : 'Stats'}
        </button>
      </div>

      {/* Tracking Control */}
      <div className="mb-4">
        {!isTracking ? (
          <button
            onClick={startTracking}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Start Tracking
          </button>
        ) : (
          <button
            onClick={stopTracking}
            className="w-full py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
          >
            Stop Tracking
          </button>
        )}
      </div>

      {/* My Position Info */}
      {myPosition && (
        <div className="bg-gray-800 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-medium">My Position</span>
            <span className={`text-xs px-2 py-1 rounded ${
              myPosition.sourceQuality === 'excellent' ? 'bg-green-600' :
              myPosition.sourceQuality === 'good' ? 'bg-blue-600' :
              myPosition.sourceQuality === 'fair' ? 'bg-yellow-600' :
              'bg-red-600'
            } text-white`}>
              {myPosition.sourceQuality}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-400">
              Accuracy: <span className="text-white">{myPosition.accuracy.toFixed(1)}m</span>
            </div>
            <div className="text-gray-400">
              Heading: <span className="text-white">{myPosition.heading.toFixed(0)}deg</span>
            </div>
            <div className="text-gray-400">
              Speed: <span className="text-white">{(myPosition.speed * 3.6).toFixed(1)}km/h</span>
            </div>
            <div className="text-gray-400">
              Confidence: <span className="text-white">{(myPosition.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
          {myPosition.calibrationApplied && (
            <div className="mt-2 text-xs text-green-400">Calibration Active</div>
          )}
          {myPosition.isPredicted && (
            <div className="mt-2 text-xs text-yellow-400">Dead Reckoning Mode</div>
          )}
        </div>
      )}

      {/* Active Targets */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        <div className="text-sm text-gray-400 mb-2">
          Tracking {activeTargets.length} target{activeTargets.length !== 1 ? 's' : ''}
        </div>
        {activeTargets.map(target => (
          <div
            key={target.id}
            onClick={() => centerOnTarget(target.id)}
            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
              selectedTarget === target.id ? 'bg-blue-900/50' : 'bg-gray-800 hover:bg-gray-750'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
              target.type === 'self' ? 'bg-blue-600' : 'bg-pink-600'
            }`}>
              {target.type === 'self' ? 'Me' : target.name.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">{target.name}</p>
              {target.position && (
                <p className="text-gray-400 text-xs">
                  {target.type === 'self' 
                    ? `${(target.position as TrackedPosition).accuracy.toFixed(0)}m accuracy`
                    : `${(target.position as FriendLocation).precision} precision`
                  }
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Stats Panel */}
      {showStats && trackingStats && (
        <div className="mt-4 bg-gray-800 rounded-lg p-3">
          <h4 className="text-white font-medium mb-2">Session Stats</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-400">
              GPS Fixes: <span className="text-white">{trackingStats.gpsFixes}</span>
            </div>
            <div className="text-gray-400">
              DR Updates: <span className="text-white">{trackingStats.deadReckoningUpdates}</span>
            </div>
            <div className="text-gray-400">
              Distance: <span className="text-white">{(trackingStats.totalDistanceMeters / 1000).toFixed(2)}km</span>
            </div>
            <div className="text-gray-400">
              Trail Points: <span className="text-white">{trackingStats.trailPoints}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FriendTracker;
