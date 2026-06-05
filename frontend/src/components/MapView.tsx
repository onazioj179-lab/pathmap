/* eslint-disable react/no-unknown-property */
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import AlgorithmVisualizer from './AlgorithmVisualizer';
import type { AlgorithmType, VisualizationMode } from '../services/visualization';
import type { NavigationState } from '../services/navigation';
import { uiScaleEngine } from '../services/uiScaleEngine';
import { mapEngine } from '../services/mapEngine';
// Device location service removed for minimal mode

interface MapViewProps {
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  routeData: any | null;
  comparisonResults: any[] | null;
  trackingHistory: [number, number][];
  landmarks: Array<{ id: string; position: [number, number]; name: string; type: string }>;
  visualizationMode: VisualizationMode; // Algorithm reveal mode
  showAlgorithmBehavior: boolean; // Show algorithm behavior
  algorithm: AlgorithmType; // Current algorithm
  liveNavigation: NavigationState | null; // Real-time navigation state
  isLiveNavActive: boolean; // Live navigation active
  onMapClick: (lat: number, lng: number) => void;
}

// Retro-style markers
const startIcon = new Icon({
  iconUrl:
    'data:image/svg+xml;base64,' +
    btoa(`
    <svg width="30" height="40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0 L30 40 L15 35 L0 40 Z" fill="#00ff88" stroke="#003322" stroke-width="2"/>
      <circle cx="15" cy="15" r="6" fill="#0a0a0a" stroke="#00ff88" stroke-width="2"/>
    </svg>
  `),
  iconSize: [30, 40],
  iconAnchor: [15, 40],
});

const endIcon = new Icon({
  iconUrl:
    'data:image/svg+xml;base64,' +
    btoa(`
    <svg width="30" height="40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0 L30 40 L15 35 L0 40 Z" fill="#ff3366" stroke="#330011" stroke-width="2"/>
      <circle cx="15" cy="15" r="6" fill="#0a0a0a" stroke="#ff3366" stroke-width="2"/>
    </svg>
  `),
  iconSize: [30, 40],
  iconAnchor: [15, 40],
});

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: e => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Current location icon (pulsing blue dot)
const currentLocationIcon = new Icon({
  iconUrl:
    'data:image/svg+xml;base64,' +
    btoa(`
    <svg width="30" height="30" xmlns="http://www.w3.org/2000/svg">
      <circle cx="15" cy="15" r="8" fill="#3b82f6" opacity="0.3">
        <animate attributeName="r" from="8" to="14" dur="1.5s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.3" to="0" dur="1.5s" repeatCount="indefinite"/>
      </circle>
      <circle cx="15" cy="15" r="6" fill="#2563eb"/>
      <circle cx="15" cy="15" r="3" fill="white"/>
    </svg>
  `),
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

// Map recenter component
function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);

  return null;
}

// Bind Leaflet map instance to window for external controls
function MapInstanceBinder() {
  const map = useMap();
  useEffect(() => {
    (window as any).map = map;
    return () => {
      if ((window as any).map === map) {
        try {
          delete (window as any).map;
        } catch {
          (window as any).map = undefined;
        }
      }
    };
  }, [map]);
  return null;
}

export default function MapView({
  startPoint,
  endPoint,
  routeData,
  comparisonResults,
  trackingHistory,
  landmarks,
  visualizationMode,
  showAlgorithmBehavior,
  algorithm,
  liveNavigation,
  isLiveNavActive,
  onMapClick,
}: MapViewProps) {
  // Map center defaults
  const [mapCenter, setMapCenter] = useState<[number, number]>([40.7128, -74.006]);
  const defaultZoom = 15;

  // Scan overlay removed for clarity

  // Center updates can be passed via props (startPoint)
  useEffect(() => {
    if (startPoint) setMapCenter(startPoint);
  }, [startPoint]);

  // Ensure UI scale mode reflects 2D map when this view mounts
  useEffect(() => {
    try {
      uiScaleEngine.setMode('2D');
    } catch {}
  }, []);

  // Map engine initializes automatically
  useEffect(() => {
    console.log('[MapView] Map engine status:', mapEngine.ready);
    if (mapEngine.ready) {
      console.log('[MapView] Map engine ready');
    }
  }, []);

  // Override map center if navigation is active and we have a position
  const effectiveCenter = liveNavigation?.currentPosition
    ? ([liveNavigation.currentPosition.lat, liveNavigation.currentPosition.lon] as [number, number])
    : startPoint
      ? startPoint
      : mapCenter;

  return (
    <div id="map" className="relative w-full h-full map-surface-root">
      <MapContainer
        center={effectiveCenter}
        zoom={defaultZoom}
        className="absolute inset-0 w-full h-full"
        zoomControl={false}
      >
        <MapInstanceBinder />
        <MapRecenter center={effectiveCenter} />
        {/* Retro dark map tiles with optimized loading */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          maxZoom={19}
          minZoom={3}
          keepBuffer={2}
          updateWhenIdle={false}
          updateWhenZooming={false}
          updateInterval={150}
          className="map-tiles"
        />
        <MapClickHandler onMapClick={onMapClick} />

        {startPoint && <Marker position={startPoint} icon={startIcon} />}
        {endPoint && <Marker position={endPoint} icon={endIcon} />}

        {/* Algorithm Visualization Overlay for single route */}
        {routeData?.path && routeData.visualization && visualizationMode !== 'path-only' && (
          <AlgorithmVisualizer
            algorithm={algorithm}
            path={routeData.path}
            visualizationData={routeData.visualization}
            mode={visualizationMode}
            isActive={true}
          />
        )}

        {/* Standard route rendering with safety/traffic coloring */}
        {routeData?.path && (!routeData.visualization || visualizationMode === 'path-only') && (
          <>
            {Array.isArray(routeData.segments) && routeData.segments.length > 0 ? (
              routeData.segments.map((seg: any, idx: number) => {
                const status = (seg.status || seg.safety || '').toString().toLowerCase();
                const color =
                  status === 'unsafe' ? '#ef4444' : status === 'traffic' ? '#f59e0b' : '#10b981';
                const weight = 5;
                const positions = seg.path
                  ? seg.path
                  : seg.indices && Array.isArray(seg.indices) && seg.indices.length === 2
                    ? routeData.path.slice(seg.indices[0], seg.indices[1] + 1)
                    : routeData.path;
                return (
                  <Polyline
                    key={`seg-${idx}`}
                    positions={positions}
                    color={color}
                    weight={weight}
                    opacity={0.95}
                  />
                );
              })
            ) : (
              <Polyline positions={routeData.path} color="#10b981" weight={5} opacity={0.95} />
            )}
          </>
        )}

        {/* Algorithm Visualization for comparison mode */}
        {comparisonResults?.map((result, idx) => {
          const algoType = result.algorithm as AlgorithmType;
          const hasViz = result.visualization && showAlgorithmBehavior;

          if (hasViz) {
            return (
              <AlgorithmVisualizer
                key={`viz-${idx}`}
                algorithm={algoType}
                path={result.path}
                visualizationData={result.visualization}
                mode={visualizationMode}
                isActive={true}
              />
            );
          }

          // Standard polyline fallback
          return (
            <Polyline
              key={idx}
              positions={result.path}
              color={['#3b82f6', '#10b981', '#f59e0b'][idx]}
              weight={3}
              opacity={0.7}
            />
          );
        })}

        {trackingHistory.length > 0 && (
          <Polyline positions={trackingHistory} color="#8b5cf6" weight={3} dashArray="5,10" />
        )}

        {/* Device location indicator removed in minimal mode */}

        {/* Live Navigation - Current Position (if different from device location) */}
        {isLiveNavActive && liveNavigation?.currentPosition && (
          <Marker
            position={[liveNavigation.currentPosition.lat, liveNavigation.currentPosition.lon]}
            icon={currentLocationIcon}
          />
        )}

        {/* Breadcrumb trail from live navigation */}
        {isLiveNavActive &&
          liveNavigation?.breadcrumbTrail &&
          liveNavigation.breadcrumbTrail.length > 1 && (
            <Polyline
              positions={liveNavigation.breadcrumbTrail}
              color="#10b981"
              weight={3}
              dashArray="5,10"
              opacity={0.7}
            />
          )}

        {/* Landmarks */}
        {landmarks.map(landmark => (
          <Marker key={landmark.id} position={landmark.position} />
        ))}
      </MapContainer>
    </div>
  );
}
