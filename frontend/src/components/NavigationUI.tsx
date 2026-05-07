import React, { useEffect, useState, useRef } from 'react';
import { MapLayer } from '../engines/MapLayerEngine';
import { ActionEngine, ActionStatus } from '../engines/ActionEngine';
import { RealLocationClient } from '../engines/RealLocationClient';
import { MapUpdateEngine } from '../engines/MapUpdateEngine';
import { GestureControlEngine } from '../engines/GestureControlEngine';
import { AdaptiveUIEngine } from '../engines/AdaptiveUIEngine';
import { Navigation3DEngine } from '../engines/Navigation3DEngine';
import { RoutePreviewEngine } from '../engines/RoutePreviewEngine';
import { OfflineTileEngine } from '../engines/OfflineTileEngine';
import { LocalRouteCache } from '../engines/LocalRouteCache';
import { PredictivePreloadSystem } from '../engines/PredictivePreloadSystem';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './NavigationUI.css';

interface NavigationStats {
  speed_kmh: number;
  distance_traveled_m: number;
  average_accuracy: number;
  update_count: number;
}

interface NavigationState {
  isTracking: boolean;
  currentAction: string | null;
  actionStatus: ActionStatus;
  currentLayer: MapLayer;
  stats: NavigationStats;
  mode3D: boolean;
  previewActive: boolean;
  gestureOverride: boolean;
}

export const NavigationUI: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const actionEngine = useRef<ActionEngine | null>(null);
  const locationClient = useRef<RealLocationClient | null>(null);
  const mapUpdateEngine = useRef<MapUpdateEngine | null>(null);
  const gestureEngine = useRef<GestureControlEngine | null>(null);
  const adaptiveUI = useRef<AdaptiveUIEngine | null>(null);
  const nav3DEngine = useRef<Navigation3DEngine | null>(null);
  const previewEngine = useRef<RoutePreviewEngine | null>(null);
  const offlineTiles = useRef<OfflineTileEngine | null>(null);
  const routeCache = useRef<LocalRouteCache | null>(null);
  const predictivePreload = useRef<PredictivePreloadSystem | null>(null);

  const [navState, setNavState] = useState<NavigationState>({
    isTracking: false,
    currentAction: null,
    actionStatus: 'idle',
    currentLayer: 'normal',
    stats: {
      speed_kmh: 0,
      distance_traveled_m: 0,
      average_accuracy: 0,
      update_count: 0,
    },
    mode3D: false,
    previewActive: false,
    gestureOverride: false,
  });

  const [showStats, setShowStats] = useState(false);
  const [_scaleFactor, setScaleFactor] = useState(1.0);

  useEffect(() => {
    if (!mapContainer.current || leafletMap.current) return;

    adaptiveUI.current = new AdaptiveUIEngine();
    adaptiveUI.current.subscribe((profile, _rules) => {
      setScaleFactor(profile.scaleFactor);
    });

    leafletMap.current = L.map(mapContainer.current).setView([40.7128, -74.006], 13);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(leafletMap.current);

    gestureEngine.current = new GestureControlEngine(leafletMap.current, {
      onPan: delta => {
        console.log('Pan gesture:', delta);
      },
      onZoom: (delta, _center) => {
        const zoom = leafletMap.current!.getZoom();
        leafletMap.current!.setZoom(zoom + delta * 0.01);
      },
      onRotate: angle => {
        if (nav3DEngine.current) {
          nav3DEngine.current.adjustBearing(angle);
        }
      },
      onTilt: pitch => {
        if (nav3DEngine.current && navState.mode3D) {
          nav3DEngine.current.adjustPitch(pitch);
        }
      },
      onDoubleTap: _pos => {
        leafletMap.current!.zoomIn();
      },
      onLongPress: pos => {
        console.log('Long press at:', pos);
      },
      onNavigationLockOverride: active => {
        setNavState(prev => ({ ...prev, gestureOverride: active }));
      },
    });

    nav3DEngine.current = new Navigation3DEngine(leafletMap.current);
    previewEngine.current = new RoutePreviewEngine(leafletMap.current, {
      onSegmentInspect: (segment, index) => {
        console.log('Segment inspected:', segment, index);
      },
      onWaypointReach: (waypoint, eta) => {
        console.log('Waypoint reached:', waypoint, eta);
      },
      onPreviewComplete: () => {
        setNavState(prev => ({ ...prev, previewActive: false }));
      },
    });

    // V52 Offline Engines
    offlineTiles.current = new OfflineTileEngine();
    routeCache.current = new LocalRouteCache();
    predictivePreload.current = new PredictivePreloadSystem(offlineTiles.current);

    console.log('[V52] Offline engines initialized');

    actionEngine.current = new ActionEngine();
    locationClient.current = new RealLocationClient('http://localhost:8000', {
      onPositionUpdate: (position, stats) => {
        if (mapUpdateEngine.current) {
          mapUpdateEngine.current.updatePosition(position);
        }

        if (nav3DEngine.current && position.speed) {
          nav3DEngine.current.updateSpeed(position.speed * 3.6);
        }

        if (nav3DEngine.current && position.heading) {
          nav3DEngine.current.updateHeading(position.heading);
        }

        // V52 Predictive Preload
        if (predictivePreload.current && navState.isTracking && position.speed) {
          predictivePreload.current.updateLocation({
            lat: position.latitude,
            lon: position.longitude,
            heading: position.heading || 0,
            speed: position.speed,
            timestamp: Date.now(),
          });
        }

        if (stats) {
          setNavState(prev => ({
            ...prev,
            stats: {
              speed_kmh: stats.speed_kmh || 0,
              distance_traveled_m: stats.distance_traveled_m || 0,
              average_accuracy: stats.average_accuracy || 0,
              update_count: stats.update_count || 0,
            },
          }));
        }
      },
      onError: error => {
        console.error('Location error:', error);
      },
    });

    mapUpdateEngine.current = new MapUpdateEngine({
      map: leafletMap.current,
      autoCenter: true,
      showBreadcrumbs: true,
      smoothMarkerMovement: true,
    });

    actionEngine.current.subscribe(state => {
      setNavState(prev => ({
        ...prev,
        currentAction: state.current,
        actionStatus: state.status,
      }));
    });

    return () => {
      gestureEngine.current?.destroy();
      nav3DEngine.current?.destroy();
      previewEngine.current?.destroy();

      // V52 Cleanup
      if (predictivePreload.current) {
        predictivePreload.current.stop();
      }

      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  const handleStartTracking = async () => {
    if (!locationClient.current || !actionEngine.current) return;

    try {
      const result = await actionEngine.current.executeAction('track-start');
      if (result.success) {
        await locationClient.current.startTracking();
        setNavState(prev => ({ ...prev, isTracking: true }));

        // V52 Start predictive preload
        if (predictivePreload.current) {
          predictivePreload.current.start();
          console.log('[V52] Predictive preload enabled');
        }
      }
    } catch (error) {
      console.error('Failed to start tracking:', error);
    }
  };

  const handleStopTracking = async () => {
    if (!locationClient.current || !actionEngine.current) return;

    try {
      await locationClient.current.stopTracking();
      await actionEngine.current.executeAction('track-stop');
      setNavState(prev => ({ ...prev, isTracking: false }));

      // V52 Stop predictive preload
      if (predictivePreload.current) {
        predictivePreload.current.stop();
        console.log('[V52] Predictive preload disabled');
      }
    } catch (error) {
      console.error('Failed to stop tracking:', error);
    }
  };

  const handleLayerSwitch = async (layer: MapLayer) => {
    if (!leafletMap.current) return;

    try {
      setNavState(prev => ({ ...prev, currentLayer: layer }));

      await fetch('http://localhost:8000/api/map/layer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layer }),
      });
    } catch (error) {
      console.error('Layer switch failed:', error);
    }
  };

  const handleRoute = async () => {
    if (!actionEngine.current) return;

    // V52 Check route cache first
    if (routeCache.current) {
      const query = {
        origin: [40.7128, -74.006] as [number, number],
        destination: [40.7218, -73.999] as [number, number],
        profile: 'driving' as const,
      };

      const cached = await routeCache.current.getRoute(query);
      if (cached) {
        console.log('[V52] Route retrieved from cache (<50ms)');
        return;
      }
    }

    const result = await actionEngine.current.executeAction('route');

    // Cache route result
    if (result.success && result.data && routeCache.current) {
      const query = {
        origin: [40.7128, -74.006] as [number, number],
        destination: [40.7218, -73.999] as [number, number],
        profile: 'driving' as const,
      };
      await routeCache.current.cacheRoute(query, result.data);
      console.log('[V52] Route cached for future use');
    }
  };

  const handleSafeReturn = async () => {
    if (!actionEngine.current) return;
    await actionEngine.current.executeAction('safe-return');
  };

  const handleExplore = async () => {
    if (!actionEngine.current) return;
    await actionEngine.current.executeAction('explore');
  };

  const handleRecenter = async () => {
    if (!leafletMap.current || !locationClient.current) return;

    const state = await locationClient.current.getState();
    if (state && state.last_position) {
      leafletMap.current.setView(
        [state.last_position.latitude, state.last_position.longitude],
        16,
        { animate: true, duration: 1 }
      );
    }
  };

  const handle3DToggle = () => {
    const new3DMode = !navState.mode3D;
    setNavState(prev => ({ ...prev, mode3D: new3DMode }));

    if (gestureEngine.current) {
      gestureEngine.current.setAllow3DGestures(new3DMode);
    }

    if (nav3DEngine.current) {
      if (new3DMode) {
        nav3DEngine.current.setMode('auto');
      } else {
        nav3DEngine.current.reset();
      }
    }
  };

  const handlePreviewToggle = async () => {
    if (!previewEngine.current) return;

    if (navState.previewActive) {
      previewEngine.current.stopPreview();
      setNavState(prev => ({ ...prev, previewActive: false }));
    } else {
      const demoRoute = [
        L.latLng(40.7128, -74.006),
        L.latLng(40.7158, -74.003),
        L.latLng(40.7188, -74.001),
        L.latLng(40.7218, -73.999),
      ];

      await previewEngine.current.startPreview(demoRoute);
      setNavState(prev => ({ ...prev, previewActive: true }));
    }
  };

  const isActionDisabled = navState.actionStatus === 'processing';

  return (
    <div className="navigation-container">
      <div ref={mapContainer} className="map-container" />

      <div className="controls-overlay">
        <div className="layer-controls">
          <button
            onClick={() => handleLayerSwitch('normal')}
            disabled={navState.currentLayer === 'normal'}
            className={navState.currentLayer === 'normal' ? 'active' : ''}
          >
            Normal
          </button>
          <button
            onClick={() => handleLayerSwitch('satellite')}
            disabled={navState.currentLayer === 'satellite'}
            className={navState.currentLayer === 'satellite' ? 'active' : ''}
          >
            Satellite
          </button>
          <button
            onClick={() => handleLayerSwitch('hybrid')}
            disabled={navState.currentLayer === 'hybrid'}
            className={navState.currentLayer === 'hybrid' ? 'active' : ''}
          >
            Hybrid
          </button>
          <button
            onClick={() => handleLayerSwitch('3d')}
            disabled={navState.currentLayer === '3d'}
            className={navState.currentLayer === '3d' ? 'active' : ''}
          >
            3D
          </button>
        </div>

        <div className="action-controls">
          {!navState.isTracking ? (
            <button onClick={handleStartTracking} disabled={isActionDisabled}>
              Start GPS
            </button>
          ) : (
            <button onClick={handleStopTracking} disabled={isActionDisabled}>
              Stop GPS
            </button>
          )}

          <button onClick={handleRoute} disabled={isActionDisabled}>
            Route
          </button>
          <button onClick={handleSafeReturn} disabled={isActionDisabled}>
            Safe Return
          </button>
          <button onClick={handleExplore} disabled={isActionDisabled}>
            Explore
          </button>
          <button onClick={handleRecenter} disabled={!navState.isTracking}>
            Recenter
          </button>
          <button onClick={handle3DToggle} className={navState.mode3D ? 'active' : ''}>
            3D Mode
          </button>
          <button
            onClick={handlePreviewToggle}
            className={navState.previewActive ? 'active' : ''}
            disabled={navState.isTracking}
          >
            {navState.previewActive ? 'Stop Preview' : 'Preview Route'}
          </button>
        </div>

        <button className="stats-toggle" onClick={() => setShowStats(!showStats)}>
          Stats
        </button>

        {navState.gestureOverride && (
          <div className="gesture-override-indicator">Navigation unlocked - tap Recenter</div>
        )}

        {showStats && (
          <div className="stats-panel">
            <div className="stat">
              <span className="stat-label">Speed:</span>
              <span className="stat-value">{navState.stats.speed_kmh.toFixed(1)} km/h</span>
            </div>
            <div className="stat">
              <span className="stat-label">Distance:</span>
              <span className="stat-value">{navState.stats.distance_traveled_m.toFixed(0)} m</span>
            </div>
            <div className="stat">
              <span className="stat-label">Accuracy:</span>
              <span className="stat-value">{navState.stats.average_accuracy.toFixed(1)} m</span>
            </div>
            <div className="stat">
              <span className="stat-label">Updates:</span>
              <span className="stat-value">{navState.stats.update_count}</span>
            </div>
            {navState.currentAction && (
              <div className="stat">
                <span className="stat-label">Action:</span>
                <span className="stat-value">
                  {navState.currentAction} ({navState.actionStatus})
                </span>
              </div>
            )}
          </div>
        )}

        {navState.actionStatus === 'processing' && (
          <div className="processing-indicator">Processing {navState.currentAction}...</div>
        )}
      </div>
    </div>
  );
};
