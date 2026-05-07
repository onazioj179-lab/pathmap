/**
 * =====================================================================
 * PATHFINDER — CORE MAP ENGINE
 * Clean, stable map logic with zero complexity
 * =====================================================================
 * Features:
 *   - Clean Leaflet initialization
 *   - No popups, no error overlays
 *   - Proper container dimensions
 *   - OpenStreetMap tiles only
 * =====================================================================
 * Author: Onazi Treasure
 * Watermark: OJ
 */

import L from 'leaflet';

interface MapEngine {
  ready: boolean;
  tileUrl: string;
  container: HTMLElement | null;
  map: L.Map | null;
}

class MapEngineClass implements MapEngine {
  ready = false;
  tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  container: HTMLElement | null = null;
  map: L.Map | null = null;

  /**
   * Initialize clean map engine
   * No extra features, no complications
   */
  init(): void {
    console.log('[MapEngine] Initializing clean map engine...');

    this.container = document.getElementById('map');
    if (!this.container) {
      console.warn('[MapEngine] Map container not found, retrying...');
      setTimeout(() => this.init(), 100);
      return;
    }

    // Remove old engine ghosts
    this.container.innerHTML = '';

    // Force proper container dimensions (fixes blank map issue)
    this.container.style.minHeight = '100vh';
    this.container.style.height = '100vh';
    this.container.style.width = '100vw';
    this.container.style.display = 'block';
    this.container.style.visibility = 'visible';
    this.container.style.opacity = '1';
    this.container.style.position = 'fixed';
    this.container.style.top = '48px';
    this.container.style.left = '0';
    this.container.style.zIndex = '0';
    this.container.style.background = '#1a1a1a';

    console.log('[MapEngine] Container setup complete');

    // Create clean Leaflet map
    this.map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([0, 0], 2);

    // Add tile layer (English version)
    L.tileLayer(this.tileUrl, {
      maxZoom: 19,
      minZoom: 1,
      crossOrigin: true,
      // Force English labels
      className: 'map-tiles-en'
    }).addTo(this.map);

    this.ready = true;
    console.log('[MapEngine] [OK] Map engine ready');
  }

  /**
   * Disable all error popups and overlays
   */
  showErrorOverlay(_message?: string): void {
    // No-op: popups disabled
    return;
  }

  /**
   * Hide any error overlays (compatibility)
   */
  hideOverlay(): void {
    // No-op: overlays disabled
    return;
  }

  /**
   * Get map instance for external use (search engine, markers, etc.)
   */
  getMap(): L.Map | null {
    return this.map;
  }

  /**
   * Pan map to specific location
   */
  panTo(lat: number, lng: number, zoom?: number): void {
    if (!this.map) return;
    
    if (zoom !== undefined) {
      this.map.setView([lat, lng], zoom);
    } else {
      this.map.panTo([lat, lng]);
    }
  }

  /**
   * Force map container setup (can be called externally)
   */
  forceMapContainer(): void {
    const el = document.getElementById('map');
    if (!el) return;

    el.style.minHeight = '100vh';
    el.style.height = '100vh';
    el.style.width = '100vw';
    el.style.display = 'block';
    el.style.visibility = 'visible';
    el.style.opacity = '1';

    console.log('[MapEngine] Container forced to correct dimensions');
  }
}

// Export singleton instance
export const mapEngine = new MapEngineClass();

// Disable window alerts and confirms globally (ultra-clean mode)
if (typeof window !== 'undefined') {
  window.alert = () => {
    // No-op: alerts disabled
  };
  
  window.confirm = () => {
    // No-op: confirms disabled
    return false;
  };
}

// Initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mapEngine.init());
  } else {
    // DOM already ready
    setTimeout(() => mapEngine.init(), 0);
  }
}

export default mapEngine;
