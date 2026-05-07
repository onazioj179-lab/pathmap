// PathFinder V30 - Algorithm Visualizer Component
// Canvas-based high-performance visualization overlay for route algorithms

import React, { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import {
  VisualizationEngine,
  VisualizationMetadata,
  VisualizationMode,
  AlgorithmType,
  PerformanceMonitor,
  RENDER_CONFIG,
} from '../services/visualization';

interface AlgorithmVisualizerProps {
  algorithm: AlgorithmType;
  path: [number, number][];
  visualizationData?: VisualizationMetadata;
  mode: VisualizationMode;
  isActive: boolean;
  onComplete?: () => void;
}

export const AlgorithmVisualizer: React.FC<AlgorithmVisualizerProps> = ({
  algorithm,
  path,
  visualizationData,
  mode,
  isActive,
  onComplete,
}) => {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<VisualizationEngine | null>(null);
  const perfMonitorRef = useRef(new PerformanceMonitor());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fps, setFps] = useState<number>(0);

  // Initialize canvas and visualization engine
  useEffect(() => {
    if (!canvasRef.current) return;

    engineRef.current = new VisualizationEngine(canvasRef.current);
    
    // Position canvas overlay on map
    const updateCanvasSize = () => {
      if (!canvasRef.current || !map) return;
      const size = map.getSize();
      canvasRef.current.style.width = `${size.x}px`;
      canvasRef.current.style.height = `${size.y}px`;
    };

    updateCanvasSize();
    map.on('resize', updateCanvasSize);

    return () => {
      map.off('resize', updateCanvasSize);
      engineRef.current?.stopAnimation();
    };
  }, [map]);

  // Update canvas position on map move/zoom
  useEffect(() => {
    if (!engineRef.current || !canvasRef.current) return;

    const updateCanvas = () => {
      if (!engineRef.current || !isActive) return;
      engineRef.current.clear();
      renderVisualization();
    };

    map.on('move', updateCanvas);
    map.on('zoom', updateCanvas);

    return () => {
      map.off('move', updateCanvas);
      map.off('zoom', updateCanvas);
    };
  }, [map, path, visualizationData, mode, isActive]);

  // Main rendering logic
  useEffect(() => {
    if (!isActive || !engineRef.current) {
      engineRef.current?.clear();
      return;
    }

    renderVisualization();
  }, [algorithm, path, visualizationData, mode, isActive]);

  // Performance monitoring
  useEffect(() => {
    if (!isActive) return;

    const monitor = perfMonitorRef.current;
    const intervalId = setInterval(() => {
      monitor.recordFrame();
      setFps(Math.round(monitor.getCurrentFPS()));
    }, 1000);

    return () => {
      clearInterval(intervalId);
      monitor.reset();
    };
  }, [isActive]);

  const renderVisualization = async () => {
    const engine = engineRef.current;
    if (!engine || !map) return;

    // Map projection helper
    const projectPoint = (lat: number, lon: number) => {
      const point = map.latLngToContainerPoint([lat, lon]);
      return point ? { x: point.x, y: point.y } : null;
    };

    // Performance check - throttle if FPS drops
    const perfMonitor = perfMonitorRef.current;
    if (perfMonitor.shouldThrottle() && mode === 'full-reveal') {
      console.warn('Performance throttling active - reducing visualization detail');
    }

    // Render based on mode
    switch (mode) {
      case 'path-only':
        // Only render final path
        engine.clear();
        engine.renderPath(path, algorithm, projectPoint);
        break;

      case 'exploration-only':
        // Only render exploration/expansion data
        engine.clear();
        if (visualizationData?.expansion_nodes) {
          await engine.renderExpansionNodes(
            visualizationData.expansion_nodes,
            algorithm,
            mode,
            projectPoint
          );
        }
        if (visualizationData?.exploration_waves && algorithm === 'PathfinderX') {
          await engine.renderExplorationWaves(
            visualizationData.exploration_waves,
            projectPoint
          );
        }
        if (visualizationData?.safe_zone_nodes && algorithm === 'HomeGuard') {
          engine.renderSafeZones(visualizationData.safe_zone_nodes, projectPoint);
        }
        if (visualizationData?.heuristic_path_samples && algorithm === 'ShadowPath') {
          engine.renderHeuristicSamples(
            visualizationData.heuristic_path_samples,
            projectPoint
          );
        }
        break;

      case 'full-reveal':
      default:
        // Render everything with animated sequence
        engine.clear();

        // Step 1: Expansion nodes (animated)
        if (visualizationData?.expansion_nodes) {
          await engine.renderExpansionNodes(
            visualizationData.expansion_nodes,
            algorithm,
            mode,
            projectPoint
          );
        }

        // Step 2: Algorithm-specific overlays
        if (algorithm === 'PathfinderX' && visualizationData?.exploration_waves) {
          await engine.renderExplorationWaves(
            visualizationData.exploration_waves,
            projectPoint
          );
        }

        if (algorithm === 'HomeGuard' && visualizationData?.safe_zone_nodes) {
          engine.renderSafeZones(visualizationData.safe_zone_nodes, projectPoint);
        }

        if (algorithm === 'ShadowPath' && visualizationData?.heuristic_path_samples) {
          engine.renderHeuristicSamples(
            visualizationData.heuristic_path_samples,
            projectPoint
          );
        }

        // Step 3: Final path (always on top)
        engine.renderPath(path, algorithm, projectPoint);
        break;
    }

    onComplete?.();
  };

  if (!isActive) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full pointer-events-none z-[600]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
      
      {/* Performance indicator */}
      {fps > 0 && (
        <div className={`absolute top-2 right-2 bg-black bg-opacity-70 px-2 py-1 rounded text-xs font-mono pointer-events-auto ${fps < RENDER_CONFIG.FPS_TARGET ? 'text-red-400' : 'text-green-400'}`}>
          {fps} FPS
        </div>
      )}
    </div>
  );
};

export default AlgorithmVisualizer;
