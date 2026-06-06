/* eslint-disable react/no-unknown-property */
import { useEffect, useRef, useState, memo, useMemo, useCallback } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  cinematicLighting,
  type LightConfig,
  type AtmosphericConfig,
} from '../services/cinematicLighting';
import { framePacingEngine } from '../services/framePacingEngine';
import { locationFluidityEngine } from '../services/locationFluidityEngine';
import { gpuStreamingPipeline } from '../services/gpuStreamingPipeline';
import { cameraFluidityEngine } from '../services/cameraFluidityEngine';
import { CursorArrowRaysIcon, MagnifyingGlassIcon, MapPinIcon } from '@heroicons/react/24/solid';
import { aiCameraEngine } from '../services/aiCameraEngine';
import { motionClassificationEngine } from '../services/motionClassificationEngine';
import { environmentDetectionEngine } from '../services/environmentDetectionEngine';
import { deadZoneRecoverySystem } from '../services/deadZoneRecoverySystem';
import { computeLaneHint } from '../services/laneLevelPrediction';
import { getViewSettings } from '../services/autoModeSwitcher';
import { microRouteOptimizer } from '../services/microRouteOptimizer';
import { realGPSBridge } from '../services/realGPSBridge';
import { globalSafetyEngine } from '../services/globalSafetyEngine';
import { arxController } from '../services/arxController';
import {
  AUTHOR_NAME,
  WATERMARK_SHORT,
  ensureUIWatermark,
  enforceIntegrity,
} from '../services/watermark';
import { movementAnalyticsEngine } from '../services/movementAnalyticsEngine';
import { localHeatmapGenerator } from '../services/localHeatmapGenerator';
import { travelPatternModel } from '../services/travelPatternModel';
import { pathQualityAnalyzer } from '../services/pathQualityAnalyzer';
import { experienceOptimizationEngine } from '../services/experienceOptimizationEngine';
import { sessionMetricsLayer } from '../services/sessionMetricsLayer';
import { ultraSmoothAnimationEngine } from '../services/ultraSmoothAnimationEngine';
import { motionInterpolationEngine } from '../services/motionInterpolationEngine';
import { uiScaleEngine } from '../services/uiScaleEngine';
import { earthScaleTerrainEngine } from '../services/earthScaleTerrainEngine';
import { globalElevationTerrainMorphingEngine } from '../services/globalElevationTerrainMorphingEngine';
import { atmosphericRenderingModel } from '../services/atmosphericRenderingModel';
import { earthZoomPipeline } from '../services/earthZoomPipeline';
import { globalOfflineTerrainCache } from '../services/globalOfflineTerrainCache';
import { automaticQualityScalingSystem } from '../services/automaticQualityScalingSystem';
import { fullDarkModeEngine } from '../services/fullDarkModeEngine';
import { aiGlobalLightingEngine } from '../services/aiGlobalLightingEngine';
import { realTimeShadowSystem } from '../services/realTimeShadowSystem';
import { darkAdaptiveAtmosphere } from '../services/darkAdaptiveAtmosphere';
import { checkIntegrity as bfisCheck } from '../services/bfis';
import { mapBootPipeline } from '../services/mapBootPipeline';
import { getMapRendererFix } from '../services/mapRendererFix';
import { getMapModeController } from '../services/mapModeController';
import type { MapMode } from '../services/mapModeController';
import { mapEngine } from '../services/mapEngine';

// Map library reference and provider flag
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MapLib: any = null;
let isMapbox = false;

type AlgorithmType = 'ShadowPath' | 'HomeGuard' | 'PathfinderX';

interface MapView3DProps {
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  routeData: any | null;
  comparisonResults: any[] | null;
  trackingHistory: [number, number][];
  landmarks: Array<{ id: string; position: [number, number]; name: string; type: string }>;
  visualizationMode: string;
  showAlgorithmBehavior: boolean;
  algorithm: AlgorithmType;
  liveNavigation: {
    currentPosition?: { lat: number; lon: number; heading?: number; speedMps?: number };
    breadcrumbTrail?: [number, number][];
  } | null;
  isLiveNavActive: boolean;
  onMapClick: (lat: number, lng: number) => void;
}

function svgToDataUrl(svg: string) {
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

const startSVG = svgToDataUrl(`
  <svg width="34" height="46" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 0 L34 46 L17 40 L0 46 Z" fill="#2fc79b" stroke="#18705a" stroke-width="2"/>
    <circle cx="17" cy="17" r="7" fill="#1f1c16" stroke="#2fc79b" stroke-width="2"/>
  </svg>
`);
const endSVG = svgToDataUrl(`
  <svg width="34" height="46" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 0 L34 46 L17 40 L0 46 Z" fill="#7b74f2" stroke="#463c9e" stroke-width="2"/>
    <circle cx="17" cy="17" r="7" fill="#1f1c16" stroke="#7b74f2" stroke-width="2"/>
  </svg>
`);
const currentDotSVG = svgToDataUrl(`
  <svg width="28" height="28" xmlns="http://www.w3.org/2000/svg">
    <circle cx="14" cy="14" r="8" fill="#3da5f5" opacity="0.35" />
    <circle cx="14" cy="14" r="6" fill="#3da5f5" />
    <circle cx="14" cy="14" r="3" fill="#f4efe3" />
  </svg>
`);

// Main component (exported with memo at bottom)
function MapView3D(props: MapView3DProps) {
  const {
    startPoint,
    endPoint,
    routeData,
    comparisonResults,
    trackingHistory,
    landmarks,
    liveNavigation,
    isLiveNavActive,
    onMapClick,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any | null>(null);
  const startMarkerRef = useRef<any | null>(null);
  const endMarkerRef = useRef<any | null>(null);
  const currentMarkerRef = useRef<any | null>(null);
  // Landmark/target markers
  const landmarkMarkersRef = useRef<Map<string, any>>(new Map());
  const [ready, setReady] = useState(false);

  // Initialize theme bridge once on mount
  useEffect(() => {
    // Theme control removed per V63 request
  }, []);

  // Initialize analytics stores on mount and start session
  useEffect(() => {
    // Set scaling mode for 3D view
    try {
      uiScaleEngine.setMode('3D');
    } catch {}
    // Initialize dark mode engine
    try {
      fullDarkModeEngine.init();
    } catch {}

    (async () => {
      try {
        await Promise.all([
          localHeatmapGenerator.load(),
          travelPatternModel.load?.(),
          sessionMetricsLayer.load?.(),
        ]);
      } catch {}
      sessionMetricsLayer.startSession();
    })();
    return () => {
      sessionMetricsLayer.endSession().catch(() => {});
    };
  }, []);

  // Map engine initializes automatically
  useEffect(() => {
    console.log('[MapView3D] Map engine status:', mapEngine.ready);
    if (mapEngine.ready) {
      console.log('[MapView3D] Map engine ready');
    } else {
      console.warn('[MapView3D] Map engine not ready yet');
    }
  }, []);

  // Initialize map with ESM-safe dynamic import
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!containerRef.current || mapRef.current) return;

      // V82 BFIS: version-aligned readiness gating
      try {
        if (window.location.hostname === 'localhost') {
          const r = await bfisCheck();
          if (!r.ok)
            console.warn(
              '[V82:BFIS] Backend not ready or version mismatch; using public tile sources'
            );
        } else {
          (window as any).__pfBackendReady = false;
        }
      } catch {}

      try {
        const token: string | undefined = (import.meta as any).env?.VITE_MAPBOX_TOKEN;
        if (token) {
          // @ts-ignore - mapbox-gl is optional, dynamically imported when token is present
          const mod: any = await import(/* @vite-ignore */ 'mapbox-gl');
          MapLib = mod.default || mod;
          MapLib.accessToken = token;
          isMapbox = true;
        } else {
          const mod = await import('maplibre-gl');
          MapLib = mod.default || mod;
          isMapbox = false;
        }
      } catch {
        const mod = await import('maplibre-gl');
        MapLib = (mod as any).default || mod;
        isMapbox = false;
      }

      if (cancelled) return;

      const initialCenter: [number, number] = startPoint || [40.7128, -74.006];

      // Always-available map style fallback that does not depend on backend proxies.
      function pickStyle(): any {
        if (isMapbox) return 'mapbox://styles/mapbox/dark-v11';
        return {
          version: 8,
          sources: {
            carto: {
              type: 'raster',
              tiles: [
                'https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
                'https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
                'https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
              ],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors © CARTO',
            },
          },
          layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
        };
      }

      const styleUrl = pickStyle();

      const isCompactViewport = window.matchMedia('(max-width: 720px)').matches;

      const options: any = {
        container: containerRef.current,
        style: styleUrl,
        center: [initialCenter[1], initialCenter[0]],
        zoom: isCompactViewport ? 14 : 15,
        pitch: isCompactViewport ? 0 : 28,
        bearing: 0,
        antialias: true,
        preserveDrawingBuffer: false,
        failIfMajorPerformanceCaveat: false,
        attributionControl: true,
        cooperativeGestures: true,
        dragRotate: true,
        pitchWithRotate: true,
        touchZoomRotate: true,
        maxPitch: 60,
        refreshExpiredTiles: false,
        maxTileCacheSize: 100,
        performanceMetricsCollection: false,
      };

      const map = new MapLib.Map(options);
      mapRef.current = map;
      (window as any).glMap = map;

      // Initialize map mode controller
      const mapModeController = getMapModeController();
      mapModeController.bindMap(map);
      console.log('[V92] Map Mode Controller bound - Standard/Satellite/Globe modes ready');

      // Run full boot pipeline before map initialization
      console.log('[V87] Starting map boot pipeline...');
      const bootSuccess = await mapBootPipeline.onBoot(map);
      if (!bootSuccess) {
        console.error('[V87] Map boot failed, failover mode active');
        // Failover mode handles retry automatically
      } else {
        console.log('[V87] Map boot complete');
      }

      // V84-V86: Initialize tile engines
      const mapRendererFix = getMapRendererFix();
      mapRendererFix.attachToMap(map);
      console.log('[V84] Map renderer fix attached - tile retry logic active');

      // Live heartbeat monitoring now active
      console.log('[V91] Live tile heartbeat monitoring active - 3s interval');

      map.on('load', () => {
        // Initialize 120Hz rendering pipeline
        console.log('[V57] Initializing ultra-fluid 120Hz rendering');

        if (!isCompactViewport) {
          try {
            earthScaleTerrainEngine.init(map);
            atmosphericRenderingModel.apply(map, { enableSkyLayer: isMapbox });
            if (fullDarkModeEngine.isDark()) {
              try {
                darkAdaptiveAtmosphere.apply(map);
              } catch {}
            }
          } catch (e) {
            console.warn('Map atmosphere setup partial', e);
          }
        }

        // Start Global Offline Terrain Cache (GOTC) & AQSS
        try {
          globalOfflineTerrainCache.start({ maxBytes: 400 * 1024 * 1024 });
        } catch {}
        try {
          automaticQualityScalingSystem.start();
        } catch {}

        // Start frame pacing engine with V56 lighting + V57 fluidity
        framePacingEngine.start(deltaMs => {
          // Cinematic lighting (update every 30s)
          if (performance.now() % 30000 < deltaMs) {
            cinematicLighting.update(30000);
          }

          // Update camera fluidity
          const cameraState = cameraFluidityEngine.update(deltaMs);

          // Update location fluidity if in navigation
          if (liveNavigation?.currentPosition) {
            const loc = locationFluidityEngine.getInterpolatedLocation(deltaMs);
            if (loc && map.getSource('current-position')) {
              // Update current position marker smoothly
              const geojson = {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [loc.lon, loc.lat],
                },
              };
              (map.getSource('current-position') as any).setData(geojson);
            }
          }

          if (!isCompactViewport) {
            try {
              earthScaleTerrainEngine.adaptWithZoom(map);
              atmosphericRenderingModel.adaptWithZoom(map);
              globalElevationTerrainMorphingEngine.tick(map, deltaMs);
            } catch {}
          }
          // Update global lighting and shadows
          try {
            const cpos = map.getCenter();
            const lig = aiGlobalLightingEngine.compute({
              lat: cpos.lat,
              lon: cpos.lng,
              time: new Date(),
            });
            const sunColor = cinematicLighting.colorTemperatureToRGB(5400);
            map.setLight({
              anchor: 'viewport',
              color: sunColor,
              intensity: 0.5 + 0.5 * lig.surfaceLightValue,
              position: [1.15, lig.sunAzimuth, lig.sunElevation],
            } as any);
            realTimeShadowSystem.update(map, map.getZoom?.() ?? 12);
          } catch {}
        });

        // Cinematic lighting with real-time sun simulation
        const applyLighting = () => {
          try {
            const lightCfg: LightConfig = cinematicLighting.getLightConfig();
            const atmoCfg: AtmosphericConfig = cinematicLighting.getAtmosphericConfig();
            const sunColor = cinematicLighting.colorTemperatureToRGB(lightCfg.colorTemperature);

            map.setLight({
              anchor: 'viewport',
              color: sunColor,
              intensity: lightCfg.intensity * 0.6,
              position: [1.15, lightCfg.sunAzimuth, lightCfg.sunElevation],
            } as any);

            if ((map as any).setFog) {
              (map as any).setFog({
                color: atmoCfg.hazeColor,
                'horizon-blend': atmoCfg.horizonBlend,
                'high-color': sunColor,
                'space-color': 'rgb(0,0,0)',
                'star-intensity': lightCfg.sunElevation < 5 ? 0.6 : 0.0,
                range: [0.5, 10],
                'fog-color': atmoCfg.hazeColor,
              });
            }

            // Sky layer for HDR realism
            if (isMapbox && !map.getLayer('sky')) {
              map.addLayer({
                id: 'sky',
                type: 'sky',
                paint: {
                  'sky-type': 'atmosphere',
                  'sky-atmosphere-sun': [lightCfg.sunAzimuth, lightCfg.sunElevation],
                  'sky-atmosphere-sun-intensity': lightCfg.intensity * 15,
                  'sky-atmosphere-color': sunColor,
                  'sky-atmosphere-halo-color': atmoCfg.hazeColor,
                },
              } as any);
            }
          } catch (e) {
            console.warn('[V56] Lighting setup partial:', e);
          }
        };

        applyLighting();

        // Expose quick test hook for Earth Zoom Pipeline
        try {
          (window as any).pfEarthZoom = async (lat: number, lon: number) => {
            await earthZoomPipeline.fly(map, { lat, lon });
          };
        } catch {}

        // GPU streaming pipeline - prefetch tiles
        const center = map.getCenter();
        const zoom = Math.floor(map.getZoom());
        // Convert lng/lat to tile coordinates (simplified)
        const scale = Math.pow(2, zoom);
        const tileX = Math.floor(((center.lng + 180) / 360) * scale);
        const tileY = Math.floor(
          ((1 -
            Math.log(
              Math.tan((center.lat * Math.PI) / 180) + 1 / Math.cos((center.lat * Math.PI) / 180)
            ) /
              Math.PI) /
            2) *
            scale
        );
        gpuStreamingPipeline.prefetchArea(zoom, tileX, tileY, 2);

        if (!isCompactViewport && isMapbox) {
          try {
            const buildingLayerId = 'building';
            const sourceId = 'composite';
            const sourceLayer = 'building';

            if (!map.getLayer('building-extrusion')) {
              const lightCfg = cinematicLighting.getLightConfig();

              map.addLayer(
                {
                  id: 'building-extrusion',
                  type: 'fill-extrusion',
                  source: sourceId,
                  'source-layer': sourceLayer,
                  minzoom: 15,
                  paint: {
                    // Dynamic building color based on material type
                    'fill-extrusion-color': [
                      'case',
                      ['==', ['get', 'type'], 'glass'],
                      '#b3a890', // Glass facade
                      ['==', ['get', 'material'], 'glass'],
                      '#b3a890',
                      '#a59a85', // Default concrete/brick
                    ],
                    'fill-extrusion-height': [
                      'coalesce',
                      ['get', 'height'],
                      ['get', 'render_height'],
                      20,
                    ],
                    'fill-extrusion-base': [
                      'coalesce',
                      ['get', 'min_height'],
                      ['get', 'render_min_height'],
                      0,
                    ],
                    // Glass transparency
                    'fill-extrusion-opacity': [
                      'case',
                      ['==', ['get', 'type'], 'glass'],
                      0.7,
                      ['==', ['get', 'material'], 'glass'],
                      0.75,
                      0.92,
                    ],
                    'fill-extrusion-vertical-gradient': true,
                  },
                } as any,
                buildingLayerId
              );
            }

            // Add roof detail layer for photorealistic rooftops
            if (isMapbox && !map.getLayer('building-roof-detail')) {
              map.addLayer({
                id: 'building-roof-detail',
                type: 'fill',
                source: sourceId,
                'source-layer': sourceLayer,
                minzoom: 17,
                paint: {
                  'fill-color': '#4c4538',
                  'fill-opacity': 0.15,
                  'fill-pattern': 'roof-texture', // Falls back gracefully if not in style
                },
              } as any);
            }
          } catch (e) {
            console.warn('Building layer setup partial:', e);
          }
        }

        // Route source/layers
        if (!map.getSource('route')) {
          map.addSource('route', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            paint: {
              'line-color': '#2fc79b',
              'line-width': 5,
              'line-opacity': 0.95,
            },
          });
        }

        // Segment layers for colored safety/traffic
        ['seg-safe', 'seg-traffic', 'seg-unsafe'].forEach((id, idx) => {
          if (!map.getSource(id)) {
            map.addSource(id, {
              type: 'geojson',
              data: { type: 'FeatureCollection', features: [] },
            });
            map.addLayer({
              id: id + '-line',
              type: 'line',
              source: id,
              paint: {
                'line-color': idx === 0 ? '#2fc79b' : idx === 1 ? '#e0a43c' : '#ef6b6b',
                'line-width': 5,
                'line-opacity': 0.95,
              },
            });
          }
        });

        // Click handler
        map.on('click', (e: any) => {
          const { lng, lat } = e.lngLat;
          onMapClick(lat, lng);
        });

        setReady(true);
      });
    })();

    return () => {
      cancelled = true;
      const m = mapRef.current;
      if (m) {
        // Clean up V56 lighting interval
        if ((m as any)._lightInterval) {
          clearInterval((m as any)._lightInterval);
        }
        try {
          m.remove();
        } catch {}
      }
      mapRef.current = null;
      if ((window as any).glMap) delete (window as any).glMap;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensure UI watermark exists and integrity is enforced
  useEffect(() => {
    // Try to mount into the map root
    const root =
      containerRef.current?.parentElement ||
      (document.querySelector('.glmap-root') as HTMLElement | null);
    ensureUIWatermark(root || undefined);
    enforceIntegrity(document);
  }, []);

  // Start/end markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const M = MapLib;
    // Start
    if (startPoint) {
      if (!startMarkerRef.current) {
        startMarkerRef.current = new M.Marker({ element: markerEl(startSVG) })
          .setLngLat([startPoint[1], startPoint[0]])
          .addTo(map);
      } else {
        startMarkerRef.current.setLngLat([startPoint[1], startPoint[0]]);
      }
    } else if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }
    // End
    if (endPoint) {
      if (!endMarkerRef.current) {
        endMarkerRef.current = new M.Marker({ element: markerEl(endSVG) })
          .setLngLat([endPoint[1], endPoint[0]])
          .addTo(map);
      } else {
        endMarkerRef.current.setLngLat([endPoint[1], endPoint[0]]);
      }
    } else if (endMarkerRef.current) {
      endMarkerRef.current.remove();
      endMarkerRef.current = null;
    }
  }, [startPoint, endPoint, ready]);

  // Landmark/Target markers rendering
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const M = MapLib;

    // Track current landmark IDs
    const currentIds = new Set(landmarks.map(l => l.id));

    // Remove markers that are no longer in landmarks
    landmarkMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        landmarkMarkersRef.current.delete(id);
      }
    });

    // Add or update landmark markers
    landmarks.forEach(landmark => {
      const existingMarker = landmarkMarkersRef.current.get(landmark.id);

      if (existingMarker) {
        // Update position
        existingMarker.setLngLat([landmark.position[1], landmark.position[0]]);
      } else {
        // Create new marker with custom element
        const el = document.createElement('div');
        el.className = 'landmark-marker';
        el.style.cssText = `
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #6f86c4, #5a6fb0);
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        `;

        // Inner content with SVG icon (rotated back)
        const inner = document.createElement('div');
        inner.style.cssText = `
          transform: rotate(45deg);
          display: flex;
          align-items: center;
          justify-content: center;
        `;

        // SVG icons for different types
        const typeIcons: Record<string, string> = {
          person:
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>',
          place:
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
          object:
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>',
          custom:
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>',
          home: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>',
          work: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>',
          safe: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>',
          alert:
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
        };
        inner.innerHTML = typeIcons[landmark.type] || typeIcons.place;
        el.appendChild(inner);

        // Color by type
        const typeColors: Record<string, string> = {
          person: 'linear-gradient(135deg, #6f86c4, #5a6fb0)',
          place: 'linear-gradient(135deg, #7fa86a, #5f8a55)',
          object: 'linear-gradient(135deg, #d6a44a, #c4603f)',
          custom: 'linear-gradient(135deg, #a585c4, #7d5fa8)',
          home: 'linear-gradient(135deg, #7fa86a, #5f8a55)',
          work: 'linear-gradient(135deg, #6f86c4, #d97757)',
          safe: 'linear-gradient(135deg, #7fa86a, #5f8a55)',
          alert: 'linear-gradient(135deg, #cf6a52, #b04632)',
        };
        el.style.background = typeColors[landmark.type] || typeColors.place;

        // Hover effect
        el.onmouseenter = () => {
          el.style.transform = 'rotate(-45deg) scale(1.1)';
        };
        el.onmouseleave = () => {
          el.style.transform = 'rotate(-45deg) scale(1)';
        };

        // Create popup with name
        const popup = new M.Popup({
          offset: 25,
          closeButton: false,
          className: 'landmark-popup',
        }).setHTML(`
          <div style="padding: 8px 12px; font-weight: 600; font-size: 14px;">
            ${landmark.name}
          </div>
        `);

        const marker = new M.Marker({ element: el })
          .setLngLat([landmark.position[1], landmark.position[0]])
          .setPopup(popup)
          .addTo(map);

        landmarkMarkersRef.current.set(landmark.id, marker);
      }
    });
  }, [landmarks, ready]);

  // Current position marker + AI camera follow
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const M = MapLib;
    const pos = liveNavigation?.currentPosition;
    if (isLiveNavActive && pos) {
      if (!currentMarkerRef.current) {
        currentMarkerRef.current = new M.Marker({ element: markerEl(currentDotSVG) })
          .setLngLat([pos.lon, pos.lat])
          .addTo(map);
      } else {
        currentMarkerRef.current.setLngLat([pos.lon, pos.lat]);
      }

      // Feed pose into V61 movement model + V62 engines
      aiCameraEngine.updateFromPose({
        lat: pos.lat,
        lon: pos.lon,
        headingDeg: (pos.heading ?? 0) % 360,
        speedMps: pos.speedMps ?? 0,
      });
      const now = Date.now();
      motionClassificationEngine.update({
        t: now,
        lat: pos.lat,
        lon: pos.lon,
        heading: pos.heading ?? 0,
        speed: pos.speedMps ?? 0,
      });
      environmentDetectionEngine.update({
        t: now,
        lat: pos.lat,
        lon: pos.lon,
        heading: pos.heading ?? 0,
        speed: pos.speedMps ?? 0,
        accuracy: pos ? undefined : 50,
      });
      deadZoneRecoverySystem.update(pos.lat, pos.lon, pos.heading, pos.speedMps);

      const suggestion = aiCameraEngine.suggest(routeData, 800);
      // refine camera by motion mode, lane hint, micro-route optimizer
      const motion = motionClassificationEngine.getState();
      const view = getViewSettings(motion.mode);
      const lane =
        routeData?.path && pos.heading !== undefined
          ? computeLaneHint(routeData.path, 1, pos.heading)
          : null;
      const micro = microRouteOptimizer(routeData, pos.speedMps ?? 0);
      const eoe = experienceOptimizationEngine.getAdjustments();
      const bearingAdj = (suggestion?.bearing ?? pos.heading ?? 0) + (lane?.bearingOffset ?? 0);
      let pitchAdj =
        (suggestion
          ? Math.round(suggestion.pitch * 0.6 + view.targetPitch * 0.4)
          : view.targetPitch) + eoe.pitchBias;
      const center = suggestion?.center
        ? ([suggestion.center.lon, suggestion.center.lat] as [number, number])
        : ([pos.lon, pos.lat] as [number, number]);
      let zoomTarget = Math.max(
        12,
        Math.min(
          20,
          (map.getZoom?.() ?? view.targetZoom) * 0.8 +
            view.targetZoom * 0.2 +
            (micro.preferZoomDelta ?? 0) +
            eoe.zoomBias
        )
      );

      // Safety-aware camera adjustments
      const gse = globalSafetyEngine.getState();
      let duration = 450;
      if (gse.visibility_level === 'low' || gse.visibility_level === 'critical') {
        pitchAdj = Math.min(pitchAdj, 40);
        zoomTarget = Math.max(13, zoomTarget - 0.5);
        duration = 520;
      }
      if (gse.risk_level === 'high' || gse.recommended_action === 'slowdown') {
        pitchAdj = Math.min(pitchAdj, 42);
        duration = Math.max(duration, 540);
      }

      // Movement analytics + heatmap + path scoring + session metrics
      movementAnalyticsEngine.update(
        { lat: pos.lat, lon: pos.lon, speedMps: pos.speedMps, heading: pos.heading },
        now
      );
      localHeatmapGenerator.addSample(pos.lat, pos.lon, 100, now);
      travelPatternModel.tick(new Date(now), pos.heading);
      pathQualityAnalyzer.updateWithPosition({
        lat: pos.lat,
        lon: pos.lon,
        speedMps: pos.speedMps,
        heading: pos.heading,
      });
      sessionMetricsLayer.recordNavTick(pos.lat, pos.lon, gse.hazard_flags.length);

      const durations = ultraSmoothAnimationEngine.getTransitionDurations();
      const cameraDuration = Math.max(
        durations.cameraEaseBase,
        duration + (eoe.durationBiasMs || 0)
      );

      if (suggestion) {
        // V74 FMI: interpolate between last and next camera poses per-frame
        const currentCenter = map.getCenter();
        const currentBearing = map.getBearing ? map.getBearing() : 0;
        const currentPitch = map.getPitch ? map.getPitch() : 60;
        motionInterpolationEngine.setTarget(
          {
            lat: currentCenter.lat,
            lon: currentCenter.lng,
            bearing: currentBearing,
            pitch: currentPitch,
            zoom: map.getZoom?.(),
          },
          { lat: center[1], lon: center[0], bearing: bearingAdj, pitch: pitchAdj, zoom: zoomTarget }
        );
        const bezier = ultraSmoothAnimationEngine.cubicBezier(0.16, 0.84, 0.44, 1);
        const cancel = ultraSmoothAnimationEngine.schedule({
          durationMs: cameraDuration,
          easing: bezier,
          onUpdate: (_t, dt) => {
            const pose = motionInterpolationEngine.update(dt, cameraDuration);
            if (!pose) return;
            map.jumpTo({
              center: [pose.lon, pose.lat],
              bearing: pose.bearing,
              pitch: pose.pitch,
              zoom: pose.zoom ?? map.getZoom?.(),
            });
          },
        });
        // Note: cancel handle available if needed
      } else {
        // Fallback to simple follow
        const speed = pos.speedMps ?? 0;
        const pitch = speed > 5 ? view.targetPitch : Math.min(view.targetPitch, 40);
        const bearing = ((pos.heading ?? 0) % 360) + (lane?.bearingOffset ?? 0);
        // Respect safety state here too
        const gse2 = globalSafetyEngine.getState();
        let dur = cameraDuration;
        if (gse2.visibility_level !== 'clear') dur = 520;
        if (gse2.risk_level === 'high') dur = 560;
        const bezier = ultraSmoothAnimationEngine.cubicBezier(0.16, 0.84, 0.44, 1);
        map.easeTo(
          {
            center: [pos.lon, pos.lat],
            pitch,
            bearing,
            zoom: view.targetZoom,
            duration: dur,
            easing: bezier,
          },
          { animate: true }
        );
      }
    } else if (startPoint) {
      // Recenter to start when not live navigating
      const isCompactViewport = window.matchMedia('(max-width: 720px)').matches;
      map.easeTo({
        center: [startPoint[1], startPoint[0]],
        pitch: isCompactViewport ? 0 : 28,
        bearing: 0,
        duration: 350,
      });
      if (currentMarkerRef.current) {
        currentMarkerRef.current.remove();
        currentMarkerRef.current = null;
      }
    }
  }, [isLiveNavActive, liveNavigation?.currentPosition, startPoint, ready]);

  // Keep GSE route in sync for scoring/hazards
  useEffect(() => {
    try {
      globalSafetyEngine.setRoute(routeData || null);
    } catch {}
    try {
      pathQualityAnalyzer.setRoute(routeData || null);
    } catch {}
  }, [routeData]);

  // Route and segments update
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    function toLineString(coords: [number, number][]) {
      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords.map(c => [c[1], c[0]]) },
        properties: {},
      } as const;
    }

    if (routeData?.path) {
      const base = { type: 'FeatureCollection', features: [toLineString(routeData.path)] } as any;
      (map.getSource('route') as any)?.setData(base);

      // Segments
      const safe: any = { type: 'FeatureCollection', features: [] };
      const traffic: any = { type: 'FeatureCollection', features: [] };
      const unsafe: any = { type: 'FeatureCollection', features: [] };
      if (Array.isArray(routeData.segments) && routeData.segments.length > 0) {
        routeData.segments.forEach((seg: any) => {
          const status = (seg.status || seg.safety || '').toString().toLowerCase();
          const path = seg.path
            ? seg.path
            : seg.indices && Array.isArray(seg.indices) && seg.indices.length === 2
              ? routeData.path.slice(seg.indices[0], seg.indices[1] + 1)
              : routeData.path;
          const feature = toLineString(path);
          if (status === 'unsafe') unsafe.features.push(feature);
          else if (status === 'traffic') traffic.features.push(feature);
          else safe.features.push(feature);
        });
      }
      (map.getSource('seg-safe') as any)?.setData(safe);
      (map.getSource('seg-traffic') as any)?.setData(traffic);
      (map.getSource('seg-unsafe') as any)?.setData(unsafe);
    } else {
      const empty = { type: 'FeatureCollection', features: [] } as any;
      ['route', 'seg-safe', 'seg-traffic', 'seg-unsafe'].forEach(id => {
        if (map.getSource(id)) (map.getSource(id) as any).setData(empty);
      });
    }
  }, [routeData, ready]);

  // Helper to create marker elements
  function markerEl(url: string) {
    const el = document.createElement('div');
    el.style.width = '34px';
    el.style.height = '46px';
    el.style.backgroundImage = `url(${url})`;
    el.style.backgroundSize = 'contain';
    el.style.backgroundRepeat = 'no-repeat';
    return el;
  }

  return (
    <div id="map" className="glmap-root map-surface-root">
      <div ref={containerRef} className="glmap-canvas" />

      {/* Global Author Watermark (UIWO) */}
      <div id="pf-uiwm" className="ui-watermark">
        {AUTHOR_NAME} — {WATERMARK_SHORT}
      </div>

      {/* Left floating controls - Search + AR balanced on left side */}
      {!isLiveNavActive && (
        <div className="v58-floating-controls-left">
          <SearchControl />
          <ARModeButton routeData={routeData} />
        </div>
      )}

      {/* V66/V69 UI: GPS control on right side */}
      <div className="v58-floating-controls2">
        <EnableGPSButton />
      </div>

      {/* Map mode switcher (Standard/Satellite/Globe) */}
      {!isLiveNavActive && (
        <div className="v92-mode-switcher">
          <MapModeSwitcher />
        </div>
      )}
    </div>
  );
}

function MapModeSwitcher() {
  const [currentMode, setCurrentMode] = useState<MapMode>('standard');
  const [busy, setBusy] = useState(false);

  const switchMode = async (mode: MapMode) => {
    if (busy || mode === currentMode) return;
    setBusy(true);
    try {
      const controller = getMapModeController();
      const success = await controller.switchToMode(mode);
      if (success) {
        setCurrentMode(mode);
      }
    } catch (error) {
      console.error('[V92:UI] Mode switch failed:', error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="v92-mode-buttons">
      <button
        onClick={() => switchMode('standard')}
        className={`v92-mode-btn ${currentMode === 'standard' ? 'active' : ''}`}
        disabled={busy}
        aria-label="Standard Map"
        title="Standard Map (2D)"
      >
        2D
      </button>
      <button
        onClick={() => switchMode('satellite')}
        className={`v92-mode-btn ${currentMode === 'satellite' ? 'active' : ''}`}
        disabled={busy}
        aria-label="Satellite Map"
        title="Satellite Imagery"
      >
        SAT
      </button>
      <button
        onClick={() => switchMode('globe')}
        className={`v92-mode-btn ${currentMode === 'globe' ? 'active' : ''}`}
        disabled={busy}
        aria-label="Globe Mode"
        title="3D Globe View"
      >
        3D
      </button>
    </div>
  );
}

function SearchControl() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  return (
    <div className={`glass-search ${open ? 'expanded' : 'collapsed'}`}>
      <button
        aria-label={open ? 'Close search' : 'Open search'}
        className="glass-search__button"
        onClick={() => setOpen(v => !v)}
      >
        <MagnifyingGlassIcon className="w-5 h-5" />
      </button>
      {open && (
        <input
          ref={inputRef}
          className="glass-search__input"
          type="text"
          placeholder="Search place or address"
        />
      )}
    </div>
  );
}

// Memoized AR button for performance
const ARModeButton = memo(function ARModeButton({ routeData }: { routeData: any | null }) {
  const [active, setActive] = useState(() => arxController.isActive());
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (active) {
        arxController.stop();
        setActive(false);
      } else {
        const ok = await arxController.start(routeData);
        setActive(ok);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, active, routeData]);

  return (
    <button
      onClick={onClick}
      aria-label={active ? 'Stop AR' : 'Start AR'}
      title="AR"
      className="v58-control-btn"
    >
      {busy ? (
        <span className="v58-control-loading" aria-hidden="true" />
      ) : (
        <CursorArrowRaysIcon className="v58-control-icon" aria-hidden="true" />
      )}
    </button>
  );
});

// Memoized GPS button for performance
const EnableGPSButton = memo(function EnableGPSButton() {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(() => realGPSBridge.isRunning());

  useEffect(() => {
    // Poll once at mount in case already running
    setEnabled(realGPSBridge.isRunning());
  }, []);

  const onClick = useCallback(async () => {
    if (busy || enabled) return;
    setBusy(true);
    try {
      const ok = await realGPSBridge.start();
      setEnabled(ok);
    } finally {
      setBusy(false);
    }
  }, [busy, enabled]);

  if (enabled) return null;

  return (
    <button onClick={onClick} aria-label="Enable GPS" title="GPS" className="v58-control-btn">
      {busy ? (
        <span className="v58-control-loading" aria-hidden="true" />
      ) : (
        <MapPinIcon className="v58-control-icon" aria-hidden="true" />
      )}
    </button>
  );
});

// Memoized export of MapView3D for parent component optimization
export default memo(MapView3D);
