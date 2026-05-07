/**
 * PATHMAP V97 — HOLOGRAPHIC MAP ENGINE (HME)
 *
 * Cyberpunk/Sci-fi style holographic visualization:
 * - Cyan wireframe buildings with glow
 * - Orange/red glowing routes
 * - Floating data labels
 * - Grid overlay
 * - Scanline effects
 *
 * @version 1.0.0
 * @author PathMap AI
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapInstance = any;

export interface HolographicConfig {
  // Colors
  gridColor: string;
  gridOpacity: number;
  buildingOutlineColor: string;
  buildingFillColor: string;
  routeColor: string;
  routeGlowColor: string;
  labelColor: string;
  accentColor: string;

  // Effects
  glowIntensity: number;
  scanlineSpeed: number;
  pulseFrequency: number;

  // Features
  enableGrid: boolean;
  enableScanlines: boolean;
  enableVignette: boolean;
  enable3DBuildings: boolean;
  enableDataLabels: boolean;
  enableDeliveryCard: boolean;
}

export const HOLO_PRESETS = {
  CYBERPUNK: {
    gridColor: '#00ffff',
    gridOpacity: 0.25,
    buildingOutlineColor: '#00d4ff',
    buildingFillColor: 'rgba(10, 22, 40, 0.85)',
    routeColor: '#ff6b35',
    routeGlowColor: '#ff4500',
    labelColor: '#00ffff',
    accentColor: '#ff3366',
    glowIntensity: 1.5,
    scanlineSpeed: 8,
    pulseFrequency: 1.5,
    enableGrid: true,
    enableScanlines: true,
    enableVignette: true,
    enable3DBuildings: true,
    enableDataLabels: true,
    enableDeliveryCard: true,
  },
  MINIMAL: {
    gridColor: '#00ffff',
    gridOpacity: 0.15,
    buildingOutlineColor: '#00d4ff',
    buildingFillColor: 'rgba(10, 22, 40, 0.7)',
    routeColor: '#ff6b35',
    routeGlowColor: '#ff4500',
    labelColor: '#00ffff',
    accentColor: '#ff3366',
    glowIntensity: 1.0,
    scanlineSpeed: 12,
    pulseFrequency: 2,
    enableGrid: false,
    enableScanlines: false,
    enableVignette: true,
    enable3DBuildings: true,
    enableDataLabels: false,
    enableDeliveryCard: true,
  },
};

interface FloatingLabel {
  id: string;
  element: HTMLDivElement;
  lat: number;
  lng: number;
}

interface CurrentPosition {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
}

class HolographicMapEngine {
  private map: MapInstance | null = null;
  private config: HolographicConfig = HOLO_PRESETS.CYBERPUNK;
  private container: HTMLElement | null = null;
  private overlayContainer: HTMLDivElement | null = null;
  private scanlineOverlay: HTMLDivElement | null = null;
  private vignetteOverlay: HTMLDivElement | null = null;
  private gridOverlay: HTMLDivElement | null = null;
  private deliveryCard: HTMLDivElement | null = null;
  private floatingLabels: Map<string, FloatingLabel> = new Map();
  private animationFrame: number | null = null;
  private _currentPosition: CurrentPosition | null = null;
  private isInitialized = false;
  private startTime: number = Date.now();

  /**
   * Initialize holographic map mode
   */
  init(map: MapInstance, config: Partial<HolographicConfig> = {}): void {
    if (this.isInitialized) {
      console.log('[HoloMap] Already initialized, updating config');
      this.setConfig(config);
      return;
    }

    this.map = map;
    this.config = { ...HOLO_PRESETS.CYBERPUNK, ...config };
    this.container = map.getContainer?.() || null;
    this.startTime = Date.now();

    console.log('[HoloMap] ═══════════════════════════════════════');
    console.log('[HoloMap] HOLOGRAPHIC MAP ENGINE V1.0 INITIALIZING');
    console.log('[HoloMap] ═══════════════════════════════════════');

    // Create overlay container
    this.createOverlayContainer();

    // Apply dark base style
    this.applyDarkBase();

    // Add holographic layers
    this.addHolographicLayers();

    // Add CSS effects overlay
    if (this.config.enableScanlines) this.addScanlineOverlay();
    if (this.config.enableVignette) this.addVignetteOverlay();
    if (this.config.enableGrid) this.addCSSGridOverlay();

    // Add delivery card
    if (this.config.enableDeliveryCard) this.addDeliveryCard();

    // Inject global styles
    this.injectGlobalStyles();

    // Start animation loop
    this.startAnimationLoop();

    // Listen for map move to update labels
    this.map.on('move', () => this.updateFloatingLabelsPosition());
    this.map.on('zoom', () => this.updateFloatingLabelsPosition());

    this.isInitialized = true;
    console.log('[HoloMap] ✓ Holographic mode ACTIVE');
  }

  /**
   * Create overlay container
   */
  private createOverlayContainer(): void {
    if (!this.container) return;

    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'holo-overlay-container';
    this.overlayContainer.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 10;
      overflow: hidden;
    `;
    this.container.appendChild(this.overlayContainer);
  }

  /**
   * Apply dark base theme to map
   */
  private applyDarkBase(): void {
    if (!this.map) return;

    try {
      // Set fog for cyberpunk atmosphere
      if (this.map.setFog) {
        this.map.setFog({
          color: '#050a15',
          'horizon-blend': 0.08,
          'high-color': '#0a1628',
          'space-color': '#000508',
          'star-intensity': 0.6,
        });
      }

      // Set dramatic lighting
      if (this.map.setLight) {
        this.map.setLight({
          anchor: 'viewport',
          color: '#00d4ff',
          intensity: 0.35,
          position: [1.5, 180, 50],
        });
      }

      // Darken existing layers
      const style = this.map.getStyle?.();
      if (style?.layers) {
        for (const layer of style.layers) {
          try {
            if (layer.type === 'background') {
              this.map.setPaintProperty(layer.id, 'background-color', '#050a15');
            }
            if (layer.type === 'fill' && !layer.id.includes('holo')) {
              this.map.setPaintProperty(layer.id, 'fill-color', '#0a1628');
              this.map.setPaintProperty(layer.id, 'fill-opacity', 0.7);
            }
            if (
              layer.type === 'line' &&
              !layer.id.includes('holo') &&
              !layer.id.includes('route')
            ) {
              this.map.setPaintProperty(layer.id, 'line-color', '#1a3a5c');
              this.map.setPaintProperty(layer.id, 'line-opacity', 0.4);
            }
            if (layer.type === 'symbol') {
              this.map.setPaintProperty(layer.id, 'text-color', '#4fd1c5');
              this.map.setPaintProperty(layer.id, 'text-halo-color', '#000');
              this.map.setPaintProperty(layer.id, 'text-halo-width', 2);
            }
          } catch {
            // Some properties may not be settable
          }
        }
      }

      console.log('[HoloMap] ✓ Dark base applied');
    } catch (e) {
      console.warn('[HoloMap] Dark base partial:', e);
    }
  }

  /**
   * Add holographic map layers
   */
  private addHolographicLayers(): void {
    if (!this.map) return;

    const addLayers = () => {
      try {
        // Find building source
        const sources = ['composite', 'openmaptiles', 'carto'];
        let sourceId: string | null = null;

        for (const s of sources) {
          if (this.map.getSource(s)) {
            sourceId = s;
            break;
          }
        }

        // Add holographic building layer
        if (sourceId && this.config.enable3DBuildings) {
          // 3D building extrusions
          if (!this.map.getLayer('holo-buildings-3d')) {
            try {
              this.map.addLayer({
                id: 'holo-buildings-3d',
                type: 'fill-extrusion',
                source: sourceId,
                'source-layer': 'building',
                minzoom: 14,
                paint: {
                  'fill-extrusion-color': [
                    'interpolate',
                    ['linear'],
                    ['coalesce', ['get', 'height'], 15],
                    0,
                    '#0a1628',
                    30,
                    '#0d2137',
                    60,
                    '#102a46',
                    100,
                    '#153555',
                  ],
                  'fill-extrusion-height': ['coalesce', ['get', 'height'], 15],
                  'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
                  'fill-extrusion-opacity': 0.85,
                  'fill-extrusion-vertical-gradient': true,
                },
              });
              console.log('[HoloMap] ✓ 3D buildings added');
            } catch (e) {
              console.warn('[HoloMap] 3D buildings failed:', e);
            }
          }

          // Building outline glow
          if (!this.map.getLayer('holo-building-glow')) {
            try {
              this.map.addLayer({
                id: 'holo-building-glow',
                type: 'line',
                source: sourceId,
                'source-layer': 'building',
                minzoom: 14,
                paint: {
                  'line-color': this.config.buildingOutlineColor,
                  'line-width': 1.5,
                  'line-opacity': 0.7,
                  'line-blur': 2,
                },
              });
              console.log('[HoloMap] ✓ Building glow added');
            } catch (e) {
              console.warn('[HoloMap] Building glow failed:', e);
            }
          }
        }

        // Add holographic grid source and layer
        if (this.config.enableGrid && !this.map.getSource('holo-grid')) {
          const gridFeatures = this.generateGridFeatures();

          this.map.addSource('holo-grid', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: gridFeatures,
            },
          });

          this.map.addLayer(
            {
              id: 'holo-grid-lines',
              type: 'line',
              source: 'holo-grid',
              paint: {
                'line-color': this.config.gridColor,
                'line-opacity': this.config.gridOpacity,
                'line-width': 0.5,
              },
            },
            'holo-buildings-3d'
          );

          console.log('[HoloMap] ✓ Grid overlay added');
        }
      } catch (e) {
        console.warn('[HoloMap] Layer setup error:', e);
      }
    };

    if (this.map.isStyleLoaded?.()) {
      addLayers();
    } else {
      this.map.once('style.load', addLayers);
    }
  }

  /**
   * Generate grid GeoJSON features
   */
  private generateGridFeatures(): any[] {
    const features: any[] = [];
    const center = this.map?.getCenter?.() || { lng: 0, lat: 0 };
    const gridSize = 0.002; // ~200m grid
    const extent = 0.05; // Coverage area

    // Vertical lines
    for (let lng = center.lng - extent; lng <= center.lng + extent; lng += gridSize) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [lng, center.lat - extent],
            [lng, center.lat + extent],
          ],
        },
        properties: {},
      });
    }

    // Horizontal lines
    for (let lat = center.lat - extent; lat <= center.lat + extent; lat += gridSize) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [center.lng - extent, lat],
            [center.lng + extent, lat],
          ],
        },
        properties: {},
      });
    }

    return features;
  }

  /**
   * Add scanline overlay
   */
  private addScanlineOverlay(): void {
    if (!this.overlayContainer) return;

    this.scanlineOverlay = document.createElement('div');
    this.scanlineOverlay.className = 'holo-scanlines';
    this.scanlineOverlay.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 15;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 255, 255, 0.03) 2px,
        rgba(0, 255, 255, 0.03) 4px
      );
      animation: holo-scanline ${this.config.scanlineSpeed}s linear infinite;
    `;
    this.overlayContainer.appendChild(this.scanlineOverlay);
  }

  /**
   * Add vignette overlay
   */
  private addVignetteOverlay(): void {
    if (!this.overlayContainer) return;

    this.vignetteOverlay = document.createElement('div');
    this.vignetteOverlay.className = 'holo-vignette';
    this.vignetteOverlay.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 14;
      box-shadow: inset 0 0 150px rgba(0, 0, 0, 0.7);
      background: radial-gradient(
        ellipse at center,
        transparent 0%,
        transparent 40%,
        rgba(0, 10, 20, 0.4) 100%
      );
    `;
    this.overlayContainer.appendChild(this.vignetteOverlay);
  }

  /**
   * Add CSS grid overlay (in addition to map layer)
   */
  private addCSSGridOverlay(): void {
    if (!this.overlayContainer) return;

    this.gridOverlay = document.createElement('div');
    this.gridOverlay.className = 'holo-css-grid';
    this.gridOverlay.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 12;
      background: 
        linear-gradient(90deg, rgba(0, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(rgba(0, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 50px 50px;
      mask-image: radial-gradient(circle at center, black 20%, transparent 70%);
      -webkit-mask-image: radial-gradient(circle at center, black 20%, transparent 70%);
    `;
    this.overlayContainer.appendChild(this.gridOverlay);
  }

  /**
   * Add delivery status card
   */
  private addDeliveryCard(): void {
    if (!this.container) return;

    this.deliveryCard = document.createElement('div');
    this.deliveryCard.className = 'holo-delivery-card';
    this.deliveryCard.innerHTML = `
      <div class="hdc-status-line">
        <div class="hdc-status-dot"></div>
        <div class="hdc-status-text">AI TRACKING ACTIVE</div>
      </div>
      <div class="hdc-data-row">
        <span class="hdc-label">LATITUDE</span>
        <span class="hdc-value" id="holo-lat">---.------</span>
      </div>
      <div class="hdc-data-row">
        <span class="hdc-label">LONGITUDE</span>
        <span class="hdc-value" id="holo-lng">---.------</span>
      </div>
      <div class="hdc-data-row">
        <span class="hdc-label">ACCURACY</span>
        <span class="hdc-value" id="holo-acc">---m</span>
      </div>
      <div class="hdc-data-row">
        <span class="hdc-label">SPEED</span>
        <span class="hdc-value" id="holo-speed">---km/h</span>
      </div>
      <div class="hdc-footer">
        <span id="holo-time">00:00:00</span>
        <span class="hdc-id">HME-V1.0</span>
      </div>
    `;
    this.container.appendChild(this.deliveryCard);
  }

  /**
   * Inject global holographic styles
   */
  private injectGlobalStyles(): void {
    if (document.getElementById('holo-global-styles')) return;

    const style = document.createElement('style');
    style.id = 'holo-global-styles';
    style.textContent = `
      @keyframes holo-scanline {
        0% { background-position-y: 0; }
        100% { background-position-y: 100vh; }
      }
      
      @keyframes holo-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      
      @keyframes holo-glow {
        0%, 100% { filter: drop-shadow(0 0 2px ${this.config.buildingOutlineColor}); }
        50% { filter: drop-shadow(0 0 8px ${this.config.buildingOutlineColor}); }
      }
      
      @keyframes holo-ring-expand {
        0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
      }
      
      @keyframes holo-flicker {
        0%, 100% { opacity: 1; }
        92% { opacity: 1; }
        93% { opacity: 0.8; }
        94% { opacity: 1; }
        96% { opacity: 0.9; }
        97% { opacity: 1; }
      }
      
      .holo-delivery-card {
        position: absolute;
        top: 80px;
        right: 16px;
        background: linear-gradient(135deg, rgba(5, 10, 21, 0.95), rgba(10, 30, 50, 0.92));
        border: 1px solid ${this.config.buildingOutlineColor};
        border-radius: 8px;
        padding: 14px 18px;
        min-width: 200px;
        z-index: 200;
        font-family: 'Courier New', 'SF Mono', monospace;
        box-shadow: 
          0 0 20px rgba(0, 212, 255, 0.2),
          0 0 40px rgba(0, 212, 255, 0.1),
          inset 0 1px 0 rgba(0, 212, 255, 0.1);
        animation: holo-flicker 8s ease-in-out infinite;
        pointer-events: auto;
      }
      
      .hdc-status-line {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(0, 212, 255, 0.2);
      }
      
      .hdc-status-dot {
        width: 8px;
        height: 8px;
        background: ${this.config.routeColor};
        border-radius: 50%;
        animation: holo-pulse 1.5s ease-in-out infinite;
        box-shadow: 0 0 8px ${this.config.routeColor};
      }
      
      .hdc-status-text {
        color: ${this.config.routeColor};
        font-size: 11px;
        font-weight: bold;
        letter-spacing: 2px;
      }
      
      .hdc-data-row {
        display: flex;
        justify-content: space-between;
        padding: 5px 0;
        font-size: 11px;
      }
      
      .hdc-label {
        color: #00aaaa;
        letter-spacing: 1px;
      }
      
      .hdc-value {
        color: ${this.config.labelColor};
        font-weight: bold;
        font-variant-numeric: tabular-nums;
      }
      
      .hdc-footer {
        display: flex;
        justify-content: space-between;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid rgba(0, 212, 255, 0.2);
        font-size: 10px;
        color: #006688;
      }
      
      .hdc-id {
        letter-spacing: 1px;
      }
      
      .holo-floating-label {
        position: absolute;
        pointer-events: none;
        z-index: 150;
        animation: holo-pulse 2s ease-in-out infinite;
      }
      
      .hfl-content {
        background: rgba(5, 10, 21, 0.92);
        border: 1px solid ${this.config.buildingOutlineColor};
        border-left: 3px solid ${this.config.routeColor};
        padding: 8px 12px;
        font-family: 'Courier New', monospace;
        color: #fff;
        font-size: 11px;
        min-width: 100px;
        box-shadow: 0 0 15px rgba(0, 212, 255, 0.25);
      }
      
      .hfl-title {
        color: ${this.config.routeColor};
        font-weight: bold;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-size: 10px;
      }
      
      .hfl-value {
        color: ${this.config.labelColor};
        font-size: 14px;
        font-weight: bold;
      }
      
      .hfl-subtext {
        color: #668899;
        font-size: 9px;
        margin-top: 4px;
      }
      
      .hfl-connector {
        width: 1px;
        height: 25px;
        background: linear-gradient(to bottom, ${this.config.buildingOutlineColor}, transparent);
        margin-left: 12px;
      }
      
      .holo-marker {
        position: absolute;
        pointer-events: none;
        z-index: 180;
      }
      
      .holo-marker-core {
        width: 16px;
        height: 16px;
        background: ${this.config.accentColor};
        border-radius: 50%;
        box-shadow: 0 0 15px ${this.config.accentColor}, 0 0 30px ${this.config.accentColor};
        animation: holo-pulse 1s ease-in-out infinite;
      }
      
      .holo-marker-ring {
        position: absolute;
        width: 50px;
        height: 50px;
        border: 2px solid ${this.config.accentColor};
        border-radius: 50%;
        top: 50%;
        left: 50%;
        animation: holo-ring-expand 2s ease-out infinite;
      }
      
      .holo-marker-ring:nth-child(2) {
        animation-delay: 0.5s;
      }
      
      .holo-marker-ring:nth-child(3) {
        animation-delay: 1s;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Add holographic route with glow
   */
  addHoloRoute(coordinates: [number, number][]): void {
    if (!this.map || coordinates.length < 2) return;

    try {
      // Remove existing holo route layers
      ['holo-route-glow', 'holo-route-core', 'holo-route-pulse'].forEach(id => {
        if (this.map.getLayer(id)) this.map.removeLayer(id);
      });
      if (this.map.getSource('holo-route')) this.map.removeSource('holo-route');

      // Add route source
      this.map.addSource('holo-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coordinates.map(c => [c[1], c[0]]), // [lng, lat]
          },
          properties: {},
        },
      });

      // Outer glow
      this.map.addLayer({
        id: 'holo-route-glow',
        type: 'line',
        source: 'holo-route',
        paint: {
          'line-color': this.config.routeGlowColor,
          'line-width': 14,
          'line-opacity': 0.35,
          'line-blur': 6,
        },
      });

      // Middle glow
      this.map.addLayer({
        id: 'holo-route-pulse',
        type: 'line',
        source: 'holo-route',
        paint: {
          'line-color': this.config.routeColor,
          'line-width': 8,
          'line-opacity': 0.5,
          'line-blur': 3,
        },
      });

      // Core line
      this.map.addLayer({
        id: 'holo-route-core',
        type: 'line',
        source: 'holo-route',
        paint: {
          'line-color': this.config.routeColor,
          'line-width': 3,
          'line-opacity': 1,
        },
      });

      console.log('[HoloMap] ✓ Route added:', coordinates.length, 'points');
    } catch (e) {
      console.warn('[HoloMap] Route failed:', e);
    }
  }

  /**
   * Add floating data label
   */
  addFloatingLabel(data: {
    id: string;
    lat: number;
    lng: number;
    title: string;
    value: string;
    subtext?: string;
  }): void {
    if (!this.container || !this.map) return;

    // Remove existing label with same ID
    this.removeFloatingLabel(data.id);

    const label = document.createElement('div');
    label.className = 'holo-floating-label';
    label.innerHTML = `
      <div class="hfl-content">
        <div class="hfl-title">${data.title}</div>
        <div class="hfl-value">${data.value}</div>
        ${data.subtext ? `<div class="hfl-subtext">${data.subtext}</div>` : ''}
      </div>
      <div class="hfl-connector"></div>
    `;

    const point = this.map.project([data.lng, data.lat]);
    label.style.left = `${point.x}px`;
    label.style.top = `${point.y - 80}px`;
    label.style.transform = 'translateX(-50%)';

    this.container.appendChild(label);
    this.floatingLabels.set(data.id, { id: data.id, element: label, lat: data.lat, lng: data.lng });
  }

  /**
   * Remove floating label
   */
  removeFloatingLabel(id: string): void {
    const label = this.floatingLabels.get(id);
    if (label) {
      label.element.remove();
      this.floatingLabels.delete(id);
    }
  }

  /**
   * Update floating labels position on map move
   */
  private updateFloatingLabelsPosition(): void {
    if (!this.map) return;

    this.floatingLabels.forEach(label => {
      const point = this.map.project([label.lng, label.lat]);
      label.element.style.left = `${point.x}px`;
      label.element.style.top = `${point.y - 80}px`;
    });
  }

  /**
   * Add tracking marker at position
   */
  addTrackingMarker(lat: number, lng: number): HTMLDivElement | null {
    if (!this.container || !this.map) return null;

    // Remove existing marker
    const existing = this.container.querySelector('.holo-marker');
    if (existing) existing.remove();

    const marker = document.createElement('div');
    marker.className = 'holo-marker';
    marker.innerHTML = `
      <div class="holo-marker-core"></div>
      <div class="holo-marker-ring"></div>
      <div class="holo-marker-ring"></div>
      <div class="holo-marker-ring"></div>
    `;

    const point = this.map.project([lng, lat]);
    marker.style.left = `${point.x - 8}px`;
    marker.style.top = `${point.y - 8}px`;

    this.container.appendChild(marker);

    // Update on map move
    const updateMarker = () => {
      const p = this.map.project([lng, lat]);
      marker.style.left = `${p.x - 8}px`;
      marker.style.top = `${p.y - 8}px`;
    };
    this.map.on('move', updateMarker);

    return marker;
  }

  /**
   * Update current position (from AI Autopilot)
   */
  updateCurrentPosition(pos: CurrentPosition): void {
    this._currentPosition = pos;

    // Update delivery card values
    if (this.deliveryCard) {
      const latEl = this.deliveryCard.querySelector('#holo-lat');
      const lngEl = this.deliveryCard.querySelector('#holo-lng');
      const accEl = this.deliveryCard.querySelector('#holo-acc');
      const speedEl = this.deliveryCard.querySelector('#holo-speed');

      if (latEl) latEl.textContent = pos.lat.toFixed(6);
      if (lngEl) lngEl.textContent = pos.lng.toFixed(6);
      if (accEl) accEl.textContent = `${(pos.accuracy || 0).toFixed(0)}m`;
      if (speedEl)
        speedEl.textContent = pos.speed ? `${(pos.speed * 3.6).toFixed(1)}km/h` : '0.0km/h';
    }
  }

  /**
   * Animation loop
   */
  private startAnimationLoop(): void {
    const animate = () => {
      // Update elapsed time
      if (this.deliveryCard) {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const hours = Math.floor(elapsed / 3600)
          .toString()
          .padStart(2, '0');
        const mins = Math.floor((elapsed % 3600) / 60)
          .toString()
          .padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');

        const timeEl = this.deliveryCard.querySelector('#holo-time');
        if (timeEl) timeEl.textContent = `${hours}:${mins}:${secs}`;
      }

      this.animationFrame = requestAnimationFrame(animate);
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  /**
   * Update grid based on new center
   */
  updateGrid(): void {
    if (!this.map || !this.config.enableGrid) return;

    try {
      const source = this.map.getSource('holo-grid');
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: this.generateGridFeatures(),
        });
      }
    } catch {
      // Grid update failed
    }
  }

  /**
   * Update config
   */
  setConfig(config: Partial<HolographicConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current config
   */
  getConfig(): HolographicConfig {
    return { ...this.config };
  }

  /**
   * Check if initialized
   */
  isActive(): boolean {
    return this.isInitialized;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    // Remove overlays
    this.overlayContainer?.remove();
    this.deliveryCard?.remove();

    // Remove floating labels
    this.floatingLabels.forEach(label => label.element.remove());
    this.floatingLabels.clear();

    // Remove map layers
    if (this.map) {
      [
        'holo-grid-lines',
        'holo-buildings-3d',
        'holo-building-glow',
        'holo-route-glow',
        'holo-route-pulse',
        'holo-route-core',
      ].forEach(id => {
        if (this.map.getLayer(id)) this.map.removeLayer(id);
      });
      ['holo-grid', 'holo-route'].forEach(id => {
        if (this.map.getSource(id)) this.map.removeSource(id);
      });
    }

    // Remove global styles
    document.getElementById('holo-global-styles')?.remove();

    this.map = null;
    this.container = null;
    this.isInitialized = false;

    console.log('[HoloMap] Destroyed');
  }
}

// Singleton export
export const holographicMapEngine = new HolographicMapEngine();
