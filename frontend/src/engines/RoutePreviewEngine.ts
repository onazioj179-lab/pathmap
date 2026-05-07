/**
 * PATHFINDER V51 — ROUTE PREVIEW ENGINE (RPE)
 * 
 * Interactive route preview system:
 * - Route scrubbing with drag handle
 * - Tap to inspect segments
 * - Elevation preview in 3D mode
 * - Smooth camera animation along path
 * - Waypoint jumping with ETA display
 * - Tile preloading before animation
 */

import L from 'leaflet';

export interface RouteSegment {
  start: L.LatLng;
  end: L.LatLng;
  distance: number;
  duration: number;
  elevation?: number;
}

export interface RoutePreviewState {
  active: boolean;
  route: L.LatLng[];
  currentIndex: number;
  totalDistance: number;
  animating: boolean;
  scrubbing: boolean;
}

export interface PreviewCallbacks {
  onSegmentInspect?: (segment: RouteSegment, index: number) => void;
  onWaypointReach?: (waypoint: L.LatLng, eta: number) => void;
  onPreviewComplete?: () => void;
}

export class RoutePreviewEngine {
  private map: L.Map;
  private callbacks: PreviewCallbacks;
  private state: RoutePreviewState;
  
  private routeLine: L.Polyline | null = null;
  private previewMarker: L.Marker | null = null;
  private segmentMarkers: L.Marker[] = [];
  private animationFrame: number | null = null;
  
  private readonly ANIMATION_SPEED = 50;
  private readonly SCRUB_SNAP_DISTANCE = 20;

  constructor(map: L.Map, callbacks: PreviewCallbacks = {}) {
    this.map = map;
    this.callbacks = callbacks;
    this.state = {
      active: false,
      route: [],
      currentIndex: 0,
      totalDistance: 0,
      animating: false,
      scrubbing: false
    };
  }

  public async startPreview(route: L.LatLng[]): Promise<void> {
    if (this.state.active || route.length < 2) return;

    this.state.route = route;
    this.state.currentIndex = 0;
    this.state.totalDistance = this.calculateTotalDistance(route);
    this.state.active = true;

    await this.preloadTiles(route);
    this.renderRoute();
    this.attachInteractionHandlers();
  }

  public stopPreview(): void {
    if (!this.state.active) return;

    this.clearVisuals();
    this.detachInteractionHandlers();
    
    this.state.active = false;
    this.state.animating = false;
    this.state.scrubbing = false;
    this.state.route = [];
    
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.callbacks.onPreviewComplete?.();
  }

  private async preloadTiles(route: L.LatLng[]): Promise<void> {
    const bounds = L.latLngBounds(route);
    const padding = 0.01;
    
    const paddedBounds = L.latLngBounds(
      [bounds.getSouth() - padding, bounds.getWest() - padding],
      [bounds.getNorth() + padding, bounds.getEast() + padding]
    );

    this.map.fitBounds(paddedBounds, { animate: false });
    
    return new Promise(resolve => {
      setTimeout(resolve, 500);
    });
  }

  private renderRoute(): void {
    this.clearVisuals();

    this.routeLine = L.polyline(this.state.route, {
      color: '#2196F3',
      weight: 4,
      opacity: 0.8
    }).addTo(this.map);

    const startIcon = L.divIcon({
      html: '<div style="background: #4CAF50; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
      className: 'route-waypoint-icon',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    const endIcon = L.divIcon({
      html: '<div style="background: #F44336; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
      className: 'route-waypoint-icon',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    L.marker(this.state.route[0], { icon: startIcon }).addTo(this.map);
    L.marker(this.state.route[this.state.route.length - 1], { icon: endIcon }).addTo(this.map);

    this.createPreviewMarker();
  }

  private createPreviewMarker(): void {
    const icon = L.divIcon({
      html: '<div style="background: #FF9800; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
      className: 'route-preview-marker',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    this.previewMarker = L.marker(this.state.route[0], {
      icon,
      draggable: true
    }).addTo(this.map);

    this.previewMarker.on('drag', this.handleMarkerDrag.bind(this));
    this.previewMarker.on('dragstart', () => {
      this.state.scrubbing = true;
      this.stopAnimation();
    });
    this.previewMarker.on('dragend', () => {
      this.state.scrubbing = false;
    });
  }

  private handleMarkerDrag(e: L.LeafletEvent): void {
    const marker = e.target as L.Marker;
    const position = marker.getLatLng();
    
    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < this.state.route.length; i++) {
      const dist = position.distanceTo(this.state.route[i]);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }

    this.state.currentIndex = closestIndex;
    marker.setLatLng(this.state.route[closestIndex]);
    
    this.map.panTo(this.state.route[closestIndex], { animate: false });
  }

  private attachInteractionHandlers(): void {
    if (this.routeLine) {
      this.routeLine.on('click', this.handleSegmentClick.bind(this));
    }
  }

  private detachInteractionHandlers(): void {
    if (this.routeLine) {
      this.routeLine.off('click');
    }
  }

  private handleSegmentClick(e: L.LeafletMouseEvent): void {
    const clickedPoint = e.latlng;
    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < this.state.route.length - 1; i++) {
      const segmentStart = this.state.route[i];
      const segmentEnd = this.state.route[i + 1];
      const dist = this.distanceToSegment(clickedPoint, segmentStart, segmentEnd);
      
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }

    const segment: RouteSegment = {
      start: this.state.route[closestIndex],
      end: this.state.route[closestIndex + 1],
      distance: this.state.route[closestIndex].distanceTo(this.state.route[closestIndex + 1]),
      duration: 0
    };

    this.callbacks.onSegmentInspect?.(segment, closestIndex);
  }

  private distanceToSegment(point: L.LatLng, segStart: L.LatLng, segEnd: L.LatLng): number {
    const A = point.lat - segStart.lat;
    const B = point.lng - segStart.lng;
    const C = segEnd.lat - segStart.lat;
    const D = segEnd.lng - segStart.lng;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let closestLat, closestLng;

    if (param < 0) {
      closestLat = segStart.lat;
      closestLng = segStart.lng;
    } else if (param > 1) {
      closestLat = segEnd.lat;
      closestLng = segEnd.lng;
    } else {
      closestLat = segStart.lat + param * C;
      closestLng = segStart.lng + param * D;
    }

    const closest = L.latLng(closestLat, closestLng);
    return point.distanceTo(closest);
  }

  public startAnimation(): void {
    if (this.state.animating || this.state.route.length < 2) return;

    this.state.animating = true;
    this.state.currentIndex = 0;
    this.animate();
  }

  public stopAnimation(): void {
    this.state.animating = false;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private animate(): void {
    if (!this.state.animating) return;

    this.state.currentIndex++;
    
    if (this.state.currentIndex >= this.state.route.length) {
      this.stopAnimation();
      this.callbacks.onPreviewComplete?.();
      return;
    }

    const currentPoint = this.state.route[this.state.currentIndex];
    
    if (this.previewMarker) {
      this.previewMarker.setLatLng(currentPoint);
    }

    this.map.panTo(currentPoint, { animate: true, duration: 0.3 });

    setTimeout(() => {
      this.animationFrame = requestAnimationFrame(() => this.animate());
    }, this.ANIMATION_SPEED);
  }

  private calculateTotalDistance(route: L.LatLng[]): number {
    let total = 0;
    for (let i = 0; i < route.length - 1; i++) {
      total += route[i].distanceTo(route[i + 1]);
    }
    return total;
  }

  private clearVisuals(): void {
    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
      this.routeLine = null;
    }

    if (this.previewMarker) {
      this.map.removeLayer(this.previewMarker);
      this.previewMarker = null;
    }

    this.segmentMarkers.forEach(marker => this.map.removeLayer(marker));
    this.segmentMarkers = [];
  }

  public getState(): RoutePreviewState {
    return { ...this.state };
  }

  public jumpToIndex(index: number): void {
    if (index < 0 || index >= this.state.route.length) return;

    this.state.currentIndex = index;
    const point = this.state.route[index];
    
    if (this.previewMarker) {
      this.previewMarker.setLatLng(point);
    }

    this.map.setView(point, this.map.getZoom(), { animate: true });
  }

  public destroy(): void {
    this.stopPreview();
  }
}
