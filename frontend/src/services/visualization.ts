// PathFinder V30 - Advanced Visualization Engine
// Professional-grade algorithm reveal and route rendering system
// V32 Enhancement: Added timing instrumentation

import { getTimeEngine } from './timeEngine';

export type VisualizationMode = 'full-reveal' | 'path-only' | 'exploration-only';
export type AlgorithmType = 'ShadowPath' | 'HomeGuard' | 'PathfinderX';

// Visualization metadata structures from backend
export interface ExpansionNode {
  lat: number;
  lon: number;
  step: number;
  cost?: number;
  heuristic?: number;
}

export interface ExplorationWave {
  center: [number, number];
  radius: number;
  intensity: number;
  step: number;
}

export interface SafeZoneNode {
  lat: number;
  lon: number;
  safety_level: number;
  coverage_radius: number;
}

export interface HeuristicPathSample {
  lat: number;
  lon: number;
  heuristic_value: number;
  direction: 'forward' | 'backward';
}

export interface TimingProfile {
  expansion_time_ms: number;
  path_construction_ms: number;
  total_nodes_explored: number;
  nodes_per_second: number;
}

export interface VisualizationMetadata {
  expansion_nodes?: ExpansionNode[];
  exploration_waves?: ExplorationWave[];
  safe_zone_nodes?: SafeZoneNode[];
  heuristic_path_samples?: HeuristicPathSample[];
  timing_profile?: TimingProfile;
}

// Algorithm-specific visual configurations
export const ALGORITHM_VISUALS = {
  ShadowPath: {
    pathColor: '#FFD700',        // Yellow - fast path
    pathWeight: 4,
    expansionColor: 'rgba(255, 215, 0, 0.3)',
    heuristicColor: 'rgba(255, 255, 0, 0.5)',
    nodeRadius: 3,
    animationSpeed: 50,          // ms per step
    glowEffect: true,
  },
  HomeGuard: {
    pathColor: '#4169E1',        // Royal blue - safe path
    pathWeight: 4,
    expansionColor: 'rgba(65, 105, 225, 0.2)',
    safeZoneColor: 'rgba(100, 149, 237, 0.15)',
    breadcrumbColor: 'rgba(255, 255, 255, 0.6)',
    nodeRadius: 4,
    animationSpeed: 70,
    pulseEffect: true,
  },
  PathfinderX: {
    pathColor: '#FF1493',        // Deep pink - exploratory path
    pathWeight: 4,
    expansionColor: 'rgba(255, 20, 147, 0.25)',
    waveColor: 'rgba(255, 0, 127, 0.2)',
    interestZoneColor: 'rgba(220, 20, 60, 0.3)',
    nodeRadius: 3,
    animationSpeed: 60,
    radiateEffect: true,
  },
} as const;

// Performance optimization: Batch rendering configuration
export const RENDER_CONFIG = {
  CHUNK_SIZE: 100,               // Nodes per render batch
  FPS_TARGET: 50,                // Target 50fps on mobile
  FRAME_TIME_MS: 20,             // 1000/50 = 20ms per frame
  MAX_NODES_VISIBLE: 5000,       // Cull beyond this for performance
  USE_CANVAS: true,              // Use Canvas API for better performance
  REUSE_DOM_ELEMENTS: true,      // Recycle marker elements
};

/**
 * Visualization Engine - Core rendering orchestrator
 */
export class VisualizationEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrame: number | null = null;
  private isAnimating: boolean = false;

  constructor(canvasElement?: HTMLCanvasElement) {
    if (canvasElement) {
      this.initCanvas(canvasElement);
    }
  }

  initCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true, // GPU acceleration hint
    });
    
    // Set high-DPI rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    this.ctx?.scale(dpr, dpr);
  }

  /**
   * Clear canvas and reset animation state
   */
  clear() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.isAnimating = false;
  }

  /**
   * Render algorithm expansion in batched chunks for performance
   */
  async renderExpansionNodes(
    nodes: ExpansionNode[],
    algorithm: AlgorithmType,
    mode: VisualizationMode,
    mapProjection: (lat: number, lon: number) => { x: number; y: number } | null
  ): Promise<void> {
    if (!this.ctx || mode === 'path-only') return;

    // Track visualization rendering time
    const timeEngine = getTimeEngine();
    const timingId = timeEngine.startEvent('map_render', {
      algorithm,
      mode,
      nodeCount: nodes.length,
    });

    const visual = ALGORITHM_VISUALS[algorithm];
    const chunks = this.chunkArray(nodes, RENDER_CONFIG.CHUNK_SIZE);
    
    this.isAnimating = true;

    for (const chunk of chunks) {
      if (!this.isAnimating) break;

      await this.renderNodeChunk(chunk, visual, mapProjection);
      await this.waitFrame();
    }

    this.isAnimating = false;
    timeEngine.endEvent(timingId, true, {
      chunksRendered: chunks.length,
    });
  }

  /**
   * Render a single chunk of nodes with algorithm-specific styling
   */
  private renderNodeChunk(
    nodes: ExpansionNode[],
    visual: typeof ALGORITHM_VISUALS[AlgorithmType],
    mapProjection: (lat: number, lon: number) => { x: number; y: number } | null
  ) {
    if (!this.ctx) return;

    // Track frame rendering time
    const timeEngine = getTimeEngine();
    const frameTimingId = timeEngine.startEvent('visualization_frame', {
      chunkSize: nodes.length,
    });

    const ctx = this.ctx;
    
    nodes.forEach(node => {
      const point = mapProjection(node.lat, node.lon);
      if (!point) return;

      // Draw expansion node
      ctx.fillStyle = visual.expansionColor;
      ctx.beginPath();
      ctx.arc(point.x, point.y, visual.nodeRadius, 0, Math.PI * 2);
      ctx.fill();

      // Optional glow effect for ShadowPath
      if ('glowEffect' in visual && visual.glowEffect) {
        ctx.shadowColor = visual.pathColor;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = visual.pathColor;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });
    
    timeEngine.endEvent(frameTimingId, true);
  }

  /**
   * Render final path with algorithm-specific styling
   */
  renderPath(
    path: [number, number][],
    algorithm: AlgorithmType,
    mapProjection: (lat: number, lon: number) => { x: number; y: number } | null
  ) {
    if (!this.ctx || path.length < 2) return;

    // Track path rendering time
    const timeEngine = getTimeEngine();
    const timingId = timeEngine.startEvent('map_render', {
      algorithm,
      pathLength: path.length,
    });

    const visual = ALGORITHM_VISUALS[algorithm];
    const ctx = this.ctx;

    ctx.strokeStyle = visual.pathColor;
    ctx.lineWidth = visual.pathWeight;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    
    const firstPoint = mapProjection(path[0][0], path[0][1]);
    if (firstPoint) {
      ctx.moveTo(firstPoint.x, firstPoint.y);
    }

    for (let i = 1; i < path.length; i++) {
      const point = mapProjection(path[i][0], path[i][1]);
      if (point) {
        ctx.lineTo(point.x, point.y);
      }
    }

    ctx.stroke();
    timeEngine.endEvent(timingId, true);
  }

  /**
   * Render exploration waves for PathfinderX
   */
  async renderExplorationWaves(
    waves: ExplorationWave[],
    mapProjection: (lat: number, lon: number) => { x: number; y: number } | null
  ): Promise<void> {
    if (!this.ctx) return;

    const visual = ALGORITHM_VISUALS.PathfinderX;
    const ctx = this.ctx;
    
    this.isAnimating = true;

    for (const wave of waves) {
      if (!this.isAnimating) break;

      const center = mapProjection(wave.center[0], wave.center[1]);
      if (!center) continue;

      // Animate expanding wave
      const maxRadius = wave.radius * 50; // Scale for visibility
      const steps = 30;
      
      for (let i = 0; i < steps; i++) {
        if (!this.isAnimating) break;

        const radius = (i / steps) * maxRadius;
        const alpha = wave.intensity * (1 - i / steps);

        ctx.strokeStyle = visual.waveColor.replace(/[\d.]+\)$/, `${alpha})`);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        await this.waitFrame();
      }
    }

    this.isAnimating = false;
  }

  /**
   * Render safe zone coverage for HomeGuard
   */
  renderSafeZones(
    zones: SafeZoneNode[],
    mapProjection: (lat: number, lon: number) => { x: number; y: number } | null
  ) {
    if (!this.ctx) return;

    const visual = ALGORITHM_VISUALS.HomeGuard;
    const ctx = this.ctx;

    zones.forEach(zone => {
      const center = mapProjection(zone.lat, zone.lon);
      if (!center) return;

      const radius = zone.coverage_radius * 30;
      const alpha = zone.safety_level * 0.3;

      // Draw safe zone circle
      ctx.fillStyle = visual.safeZoneColor.replace(/[\d.]+\)$/, `${alpha})`);
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Pulse effect on zone center
      if (visual.pulseEffect) {
        ctx.fillStyle = visual.breadcrumbColor;
        ctx.beginPath();
        ctx.arc(center.x, center.y, visual.nodeRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  /**
   * Render heuristic path samples for ShadowPath
   */
  renderHeuristicSamples(
    samples: HeuristicPathSample[],
    mapProjection: (lat: number, lon: number) => { x: number; y: number } | null
  ) {
    if (!this.ctx) return;

    const visual = ALGORITHM_VISUALS.ShadowPath;
    const ctx = this.ctx;

    samples.forEach(sample => {
      const point = mapProjection(sample.lat, sample.lon);
      if (!point) return;

      // Color intensity based on heuristic value (normalized 0-1)
      const intensity = Math.min(sample.heuristic_value, 1);
      const alpha = 0.4 + intensity * 0.4;

      ctx.fillStyle = visual.heuristicColor.replace(/[\d.]+\)$/, `${alpha})`);
      ctx.beginPath();
      ctx.arc(point.x, point.y, visual.nodeRadius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Draw directional indicator
      if (sample.direction === 'forward') {
        ctx.strokeStyle = visual.pathColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(point.x + 8, point.y - 8);
        ctx.stroke();
      }
    });
  }

  /**
   * Stop any ongoing animation
   */
  stopAnimation() {
    this.isAnimating = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  // Helper methods
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private waitFrame(): Promise<void> {
    return new Promise(resolve => {
      this.animationFrame = requestAnimationFrame(() => resolve());
    });
  }
}

/**
 * SVG-based overlay renderer for Leaflet integration
 */
export class LeafletVisualizationOverlay {
  /**
   * Create SVG path element for algorithm routes
   */
  static createRoutePath(
    path: [number, number][],
    algorithm: AlgorithmType
  ): SVGPathElement {
    const visual = ALGORITHM_VISUALS[algorithm];
    const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    pathElement.setAttribute('fill', 'none');
    pathElement.setAttribute('stroke', visual.pathColor);
    pathElement.setAttribute('stroke-width', visual.pathWeight.toString());
    pathElement.setAttribute('stroke-linecap', 'round');
    pathElement.setAttribute('stroke-linejoin', 'round');
    pathElement.setAttribute('opacity', '0.9');
    
    return pathElement;
  }

  /**
   * Create expansion node markers with DOM pooling for performance
   */
  static createExpansionMarker(
    lat: number,
    lon: number,
    algorithm: AlgorithmType
  ): SVGCircleElement {
    const visual = ALGORITHM_VISUALS[algorithm];
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    
    marker.setAttribute('r', visual.nodeRadius.toString());
    marker.setAttribute('fill', visual.expansionColor);
    marker.setAttribute('stroke', 'none');
    
    return marker;
  }

  /**
   * Batch update marker positions during pan/zoom
   */
  static batchUpdateMarkers(
    markers: SVGCircleElement[],
    positions: { x: number; y: number }[]
  ) {
    // Use RAF for smooth updates
    requestAnimationFrame(() => {
      markers.forEach((marker, i) => {
        if (positions[i]) {
          marker.setAttribute('cx', positions[i].x.toString());
          marker.setAttribute('cy', positions[i].y.toString());
        }
      });
    });
  }
}

/**
 * Performance monitor for mobile optimization
 */
export class PerformanceMonitor {
  private frameTimestamps: number[] = [];
  private readonly maxSamples = 60;

  recordFrame() {
    const now = performance.now();
    this.frameTimestamps.push(now);
    
    if (this.frameTimestamps.length > this.maxSamples) {
      this.frameTimestamps.shift();
    }
  }

  getCurrentFPS(): number {
    if (this.frameTimestamps.length < 2) return 0;
    
    const first = this.frameTimestamps[0];
    const last = this.frameTimestamps[this.frameTimestamps.length - 1];
    const elapsed = last - first;
    
    return (this.frameTimestamps.length - 1) / (elapsed / 1000);
  }

  shouldThrottle(): boolean {
    return this.getCurrentFPS() < RENDER_CONFIG.FPS_TARGET - 5;
  }

  reset() {
    this.frameTimestamps = [];
  }
}
