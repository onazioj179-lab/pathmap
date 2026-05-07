/*
 V75: Satellite Imagery Layer (SIL)
 - Adds global satellite raster tiles
 - Smooth blending across zoom levels and simple day/night presets
 - Optional AI-esque enhancement (contrast/brightness/saturation tweaks as proxy)
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GLMap = any;

export type SatelliteOptions = {
  urlTemplate?: string;
  minzoom?: number;
  maxzoom?: number;
  layerId?: string;
  attribution?: string;
};

// EOX Sentinel-2 cloudless public tiles (demo-friendly)
const DEFAULT_S2 = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2019_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg";
// V77: Backend proxy endpoint (with fallback to direct)
const BACKEND_PROXY_S2 = "/api/v1/tiles/eox/{z}/{x}/{y}";

export const satelliteImageryLayer = {
  _added: false,
  _layerId: 'v75-satellite' as const,
  _sourceId: 'v75-satellite-src' as const,

  init(map: GLMap, opts?: SatelliteOptions) {
    if (this._added) return;
    // V77: Try backend proxy only if backend reported ready
    const useBackend = (window as any).__pfBackendReady === true && window.location.hostname === 'localhost';
    const url = opts?.urlTemplate || (useBackend ? BACKEND_PROXY_S2 : DEFAULT_S2);
    const minzoom = opts?.minzoom ?? 0;
    const maxzoom = opts?.maxzoom ?? 19;
    const layerId = opts?.layerId || this._layerId;
    const attribution = opts?.attribution || 'Imagery © EOX Sentinel-2 Cloudless';

    try {
      if (!map.getSource(this._sourceId)) {
        map.addSource(this._sourceId, {
          type: 'raster',
          tiles: [url],
          tileSize: 256,
          minzoom,
          maxzoom,
          attribution
        });
      }
      if (!map.getLayer(layerId)) {
        // Render under labels/buildings if possible.
        map.addLayer({
          id: layerId,
          type: 'raster',
          source: this._sourceId,
          paint: {
            'raster-opacity': 1.0,
            'raster-contrast': 0.05,
            'raster-saturation': 0.0,
            'raster-brightness-min': 0.0,
            'raster-brightness-max': 1.0,
            'raster-fade-duration': 300
          }
        }, this._findFirstSymbolLayerId(map));
      }
      this._added = true;
    } catch (e) {
      console.warn('[V75:SIL] Partial imagery layer init', e);
    }
  },

  dayPreset(map: GLMap) {
    if (!this._added) return;
    try {
      map.setPaintProperty(this._layerId, 'raster-brightness-min', 0.0);
      map.setPaintProperty(this._layerId, 'raster-brightness-max', 1.0);
      map.setPaintProperty(this._layerId, 'raster-contrast', 0.05);
      map.setPaintProperty(this._layerId, 'raster-saturation', 0.0);
    } catch {}
  },

  nightPreset(map: GLMap) {
    if (!this._added) return;
    try {
      map.setPaintProperty(this._layerId, 'raster-brightness-min', 0.0);
      map.setPaintProperty(this._layerId, 'raster-brightness-max', 0.7);
      map.setPaintProperty(this._layerId, 'raster-contrast', 0.15);
      map.setPaintProperty(this._layerId, 'raster-saturation', -0.15);
    } catch {}
  },

  enhance(map: GLMap, level: number) {
    // Proxy for AI upscaling: gently boost contrast at low zoom to reduce muddy look
    if (!this._added) return;
    const t = Math.max(0, Math.min(1, level));
    try {
      map.setPaintProperty(this._layerId, 'raster-contrast', 0.05 + 0.15 * t);
      map.setPaintProperty(this._layerId, 'raster-brightness-max', 1.0 - 0.2 * t);
    } catch {}
  },

  _findFirstSymbolLayerId(map: GLMap): string | undefined {
    try {
      const layers = map.getStyle()?.layers || [];
      const symbolLayer = layers.find((l: any) => l.type === 'symbol');
      return symbolLayer?.id;
    } catch {
      return undefined;
    }
  }
};
