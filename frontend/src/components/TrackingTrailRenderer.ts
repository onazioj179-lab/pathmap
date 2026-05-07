/**
 * PATHMAP V94 - Tracking Trail Renderer
 * 
 * Animated polyline that follows the tracked person with:
 * - Gradient color based on accuracy/confidence
 * - Smooth animation using requestAnimationFrame
 * - Pulsing head marker showing current position
 * - Direction indicator arrow
 * - Fade effect for older trail segments
 */

declare const L: any;

import { getPrecisionTrackingService, TrackedPosition, TrailPoint } from '../services/precisionTrackingService';

export interface TrailStyle {
  lineWidth: number;
  headRadius: number;
  fadeLength: number;
  colorExcellent: string;
  colorGood: string;
  colorFair: string;
  colorPoor: string;
  colorDeadReckoning: string;
  pulseEnabled: boolean;
  arrowEnabled: boolean;
}

const DEFAULT_STYLE: TrailStyle = {
  lineWidth: 4,
  headRadius: 12,
  fadeLength: 100,
  colorExcellent: '#00ff88',
  colorGood: '#00ccff',
  colorFair: '#ffcc00',
  colorPoor: '#ff6600',
  colorDeadReckoning: '#ff0066',
  pulseEnabled: true,
  arrowEnabled: true
};

export class TrackingTrailRenderer {
  private map: any; // Leaflet map instance
  private trailLayer: any; // Leaflet layer group
  private headMarker: any; // Current position marker
  private directionArrow: any; // Heading indicator
  private polyline: any; // Trail polyline
  
  private style: TrailStyle;
  private isRendering = false;
  private animationFrame: number | null = null;
  private pulsePhase = 0;
  
  private trackingService = getPrecisionTrackingService();
  private currentPosition: TrackedPosition | null = null;
  private trail: TrailPoint[] = [];

  constructor(map: any, style: Partial<TrailStyle> = {}) {
    this.map = map;
    this.style = { ...DEFAULT_STYLE, ...style };
    this.initializeLayers();
  }

  private initializeLayers(): void {
    // Create layer group for all tracking elements
    if (typeof L !== 'undefined') {
      this.trailLayer = L.layerGroup().addTo(this.map);
      
      // Initialize polyline
      this.polyline = L.polyline([], {
        color: this.style.colorGood,
        weight: this.style.lineWidth,
        opacity: 0.8,
        smoothFactor: 1,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.trailLayer);
      
      // Initialize head marker with custom pulsing div
      const headIcon = L.divIcon({
        className: 'tracking-head-marker',
        html: this.createHeadMarkerHtml(),
        iconSize: [this.style.headRadius * 2 + 8, this.style.headRadius * 2 + 8],
        iconAnchor: [this.style.headRadius + 4, this.style.headRadius + 4]
      });
      
      this.headMarker = L.marker([0, 0], {
        icon: headIcon,
        zIndexOffset: 1000
      });
      
      // Direction arrow
      if (this.style.arrowEnabled) {
        const arrowIcon = L.divIcon({
          className: 'tracking-direction-arrow',
          html: this.createDirectionArrowHtml(0),
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        
        this.directionArrow = L.marker([0, 0], {
          icon: arrowIcon,
          zIndexOffset: 999
        });
      }
    }
  }

  private createHeadMarkerHtml(): string {
    return `
      <div class="tracking-head-outer" style="
        width: ${this.style.headRadius * 2 + 8}px;
        height: ${this.style.headRadius * 2 + 8}px;
        border-radius: 50%;
        background: rgba(0, 200, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: pulse-outer 2s ease-in-out infinite;
      ">
        <div class="tracking-head-inner" style="
          width: ${this.style.headRadius * 2}px;
          height: ${this.style.headRadius * 2}px;
          border-radius: 50%;
          background: linear-gradient(135deg, #00ccff, #0088ff);
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        "></div>
      </div>
      <style>
        @keyframes pulse-outer {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.3); opacity: 0.3; }
        }
      </style>
    `;
  }

  private createDirectionArrowHtml(heading: number): string {
    return `
      <div style="
        width: 24px;
        height: 24px;
        transform: rotate(${heading}deg);
        transition: transform 0.3s ease-out;
      ">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L20 20L12 16L4 20L12 2Z" fill="#0088ff" stroke="white" stroke-width="1.5"/>
        </svg>
      </div>
    `;
  }

  start(): void {
    if (this.isRendering) return;
    
    this.isRendering = true;
    
    // Subscribe to tracking updates
    this.trackingService.addPositionListener((pos) => {
      this.currentPosition = pos;
    });
    
    this.trackingService.addTrailListener((trail) => {
      this.trail = trail;
    });
    
    // Start render loop
    this.render();
    
    console.log('[TrailRenderer] Started');
  }

  stop(): void {
    this.isRendering = false;
    
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    console.log('[TrailRenderer] Stopped');
  }

  private render(): void {
    if (!this.isRendering) return;
    
    this.updateTrail();
    this.updateHeadMarker();
    this.updateDirectionArrow();
    
    // Pulse animation
    this.pulsePhase = (this.pulsePhase + 0.05) % (Math.PI * 2);
    
    this.animationFrame = requestAnimationFrame(() => this.render());
  }

  private updateTrail(): void {
    if (!this.polyline || this.trail.length < 2) return;
    
    const coords = this.trail.map(p => [p.lat, p.lon]);
    this.polyline.setLatLngs(coords);
    
    // Update color based on latest accuracy
    if (this.currentPosition) {
      const color = this.getQualityColor(this.currentPosition.sourceQuality);
      this.polyline.setStyle({ color });
    }
  }

  private updateHeadMarker(): void {
    if (!this.headMarker || !this.currentPosition) return;
    
    const pos = this.currentPosition;
    this.headMarker.setLatLng([pos.latitude, pos.longitude]);
    
    if (!this.map.hasLayer(this.headMarker)) {
      this.headMarker.addTo(this.trailLayer);
    }
    
    // Update pulse size based on accuracy
    if (this.style.pulseEnabled) {
      const element = this.headMarker.getElement();
      if (element) {
        const outer = element.querySelector('.tracking-head-outer') as HTMLElement;
        if (outer) {
          const scale = 1 + Math.sin(this.pulsePhase) * 0.15;
          outer.style.transform = `scale(${scale})`;
        }
      }
    }
  }

  private updateDirectionArrow(): void {
    if (!this.directionArrow || !this.currentPosition || !this.style.arrowEnabled) return;
    
    const pos = this.currentPosition;
    
    // Position arrow ahead of head marker in direction of travel
    const offset = 0.0002; // Approx 20m
    const headingRad = pos.heading * Math.PI / 180;
    const arrowLat = pos.latitude + offset * Math.cos(headingRad);
    const arrowLon = pos.longitude + offset * Math.sin(headingRad);
    
    this.directionArrow.setLatLng([arrowLat, arrowLon]);
    
    if (!this.map.hasLayer(this.directionArrow)) {
      this.directionArrow.addTo(this.trailLayer);
    }
    
    // Update arrow rotation
    const element = this.directionArrow.getElement();
    if (element) {
      const inner = element.querySelector('div') as HTMLElement;
      if (inner) {
        inner.style.transform = `rotate(${pos.heading}deg)`;
      }
    }
  }

  private getQualityColor(quality: string): string {
    switch (quality) {
      case 'excellent': return this.style.colorExcellent;
      case 'good': return this.style.colorGood;
      case 'fair': return this.style.colorFair;
      case 'poor': return this.style.colorPoor;
      case 'dead_reckoning': return this.style.colorDeadReckoning;
      default: return this.style.colorGood;
    }
  }

  setStyle(style: Partial<TrailStyle>): void {
    this.style = { ...this.style, ...style };
    
    if (this.polyline) {
      this.polyline.setStyle({ weight: this.style.lineWidth });
    }
  }

  clearTrail(): void {
    if (this.polyline) {
      this.polyline.setLatLngs([]);
    }
    this.trail = [];
  }

  centerOnPosition(): void {
    if (this.currentPosition && this.map) {
      this.map.setView([this.currentPosition.latitude, this.currentPosition.longitude], 17);
    }
  }

  destroy(): void {
    this.stop();
    
    if (this.trailLayer) {
      this.map.removeLayer(this.trailLayer);
    }
  }
}

// Factory function
export function createTrackingTrailRenderer(map: any, style?: Partial<TrailStyle>): TrackingTrailRenderer {
  return new TrackingTrailRenderer(map, style);
}

export default { createTrackingTrailRenderer, TrackingTrailRenderer };
