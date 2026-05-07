/**
 * PATHFINDER V48 - MAP UPDATE ENGINE (MUE)
 * 
 * Handles real-time map updates from GPS:
 * - Instant recenter on position update
 * - Smooth marker animation
 * - Breadcrumb trail
 * - Route polyline updates
 */

import L from 'leaflet';

interface MapUpdateOptions {
  map: L.Map;
  autoCenter: boolean;
  showBreadcrumbs: boolean;
  smoothMarkerMovement: boolean;
  breadcrumbLimit?: number;
}

interface LocationPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export class MapUpdateEngine {
  private map: L.Map;
  private userMarker: L.Marker | null = null;
  private accuracyCircle: L.Circle | null = null;
  private breadcrumbs: L.CircleMarker[] = [];
  private options: MapUpdateOptions;
  
  constructor(options: MapUpdateOptions) {
    this.map = options.map;
    this.options = {
      breadcrumbLimit: 100,
      ...options
    };
  }
  
  /**
   * Update user position on map
   */
  updatePosition(position: LocationPosition): void {
    const latLng = L.latLng(position.latitude, position.longitude);
    
    // Create or update marker
    if (!this.userMarker) {
      this.createUserMarker(latLng, position.heading);
    } else {
      this.moveUserMarker(latLng, position.heading);
    }
    
    // Update accuracy circle
    this.updateAccuracyCircle(latLng, position.accuracy);
    
    // Add breadcrumb if tracking
    if (this.options.showBreadcrumbs) {
      this.addBreadcrumb(latLng);
    }
    
    // Auto-center map if enabled
    if (this.options.autoCenter) {
      this.centerMapOnPosition(latLng);
    }
    
    console.log(`[V48 MUE] Position updated: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`);
  }
  
  /**
   * Create user marker with custom icon
   */
  private createUserMarker(latLng: L.LatLng, heading?: number | null): void {
    const icon = L.divIcon({
      className: 'user-position-marker',
      html: this.getUserMarkerHTML(heading),
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    
    this.userMarker = L.marker(latLng, { icon })
      .addTo(this.map)
      .bindPopup('Your Location');
  }
  
  /**
   * Move user marker with smooth animation
   */
  private moveUserMarker(latLng: L.LatLng, heading?: number | null): void {
    if (!this.userMarker) return;
    
    if (this.options.smoothMarkerMovement) {
      // Smooth slide to new position
      this.userMarker.slideTo(latLng, {
        duration: 1000,
        keepAtCenter: false
      });
    } else {
      // Instant update
      this.userMarker.setLatLng(latLng);
    }
    
    // Update icon if heading changed
    if (heading !== undefined) {
      const icon = L.divIcon({
        className: 'user-position-marker',
        html: this.getUserMarkerHTML(heading),
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      this.userMarker.setIcon(icon);
    }
  }
  
  /**
   * Get HTML for user marker with optional heading arrow
   */
  private getUserMarkerHTML(heading?: number | null): string {
    const rotation = heading !== null && heading !== undefined ? `transform: rotate(${heading}deg);` : '';
    
    return `
      <div style="position: relative; width: 32px; height: 32px;">
        <!-- Outer pulse ring -->
        <div style="
          position: absolute;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(59, 130, 246, 0.3);
          animation: pulse 2s infinite;
        "></div>
        
        <!-- Inner position dot -->
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3B82F6;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        "></div>
        
        <!-- Heading arrow (if available) -->
        ${heading !== null && heading !== undefined ? `
        <div style="
          position: absolute;
          top: -4px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-bottom: 10px solid #3B82F6;
          ${rotation}
        "></div>
        ` : ''}
      </div>
    `;
  }
  
  /**
   * Update accuracy circle
   */
  private updateAccuracyCircle(latLng: L.LatLng, accuracy: number): void {
    if (this.accuracyCircle) {
      this.accuracyCircle.setLatLng(latLng);
      this.accuracyCircle.setRadius(accuracy);
    } else {
      this.accuracyCircle = L.circle(latLng, {
        radius: accuracy,
        color: '#3B82F6',
        fillColor: '#3B82F6',
        fillOpacity: 0.1,
        weight: 1
      }).addTo(this.map);
    }
  }
  
  /**
   * Add breadcrumb to trail
   */
  private addBreadcrumb(latLng: L.LatLng): void {
    const breadcrumb = L.circleMarker(latLng, {
      radius: 3,
      color: '#3B82F6',
      fillColor: '#3B82F6',
      fillOpacity: 0.6,
      weight: 1
    }).addTo(this.map);
    
    this.breadcrumbs.push(breadcrumb);
    
    // Limit breadcrumb count
    if (this.breadcrumbs.length > (this.options.breadcrumbLimit || 100)) {
      const oldBreadcrumb = this.breadcrumbs.shift();
      if (oldBreadcrumb) {
        this.map.removeLayer(oldBreadcrumb);
      }
    }
  }
  
  /**
   * Center map on position with smooth animation
   */
  private centerMapOnPosition(latLng: L.LatLng): void {
    const currentZoom = this.map.getZoom();
    const targetZoom = currentZoom < 16 ? 16 : currentZoom;
    
    this.map.setView(latLng, targetZoom, {
      animate: true,
      duration: 0.5,
      easeLinearity: 0.25
    });
  }
  
  /**
   * Clear all breadcrumbs
   */
  clearBreadcrumbs(): void {
    this.breadcrumbs.forEach(breadcrumb => {
      this.map.removeLayer(breadcrumb);
    });
    this.breadcrumbs = [];
  }
  
  /**
   * Remove user marker and accuracy circle
   */
  clear(): void {
    if (this.userMarker) {
      this.map.removeLayer(this.userMarker);
      this.userMarker = null;
    }
    
    if (this.accuracyCircle) {
      this.map.removeLayer(this.accuracyCircle);
      this.accuracyCircle = null;
    }
    
    this.clearBreadcrumbs();
  }
  
  /**
   * Toggle auto-centering
   */
  setAutoCenter(enabled: boolean): void {
    this.options.autoCenter = enabled;
  }
  
  /**
   * Toggle breadcrumbs
   */
  setShowBreadcrumbs(enabled: boolean): void {
    this.options.showBreadcrumbs = enabled;
    if (!enabled) {
      this.clearBreadcrumbs();
    }
  }
}

/**
 * Add CSS animation for pulse effect
 */
export function injectMapUpdateCSS(): void {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.5);
        opacity: 0.5;
      }
      100% {
        transform: scale(2);
        opacity: 0;
      }
    }
    
    .user-position-marker {
      background: transparent !important;
      border: none !important;
    }
  `;
  document.head.appendChild(style);
}

// Extend Leaflet marker with slideTo method
declare module 'leaflet' {
  interface Marker {
    slideTo(latlng: L.LatLngExpression, options?: { duration?: number; keepAtCenter?: boolean }): this;
  }
}

// Polyfill for slideTo if not available
if (typeof L !== 'undefined' && L.Marker && !L.Marker.prototype.slideTo) {
  L.Marker.prototype.slideTo = function(
    latlng: L.LatLngExpression,
    options?: { duration?: number; keepAtCenter?: boolean }
  ) {
    const duration = options?.duration || 1000;
    const targetLatLng = L.latLng(latlng);
    const startLatLng = this.getLatLng();
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const lat = startLatLng.lat + (targetLatLng.lat - startLatLng.lat) * eased;
      const lng = startLatLng.lng + (targetLatLng.lng - startLatLng.lng) * eased;
      
      this.setLatLng([lat, lng]);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
    return this;
  };
}
