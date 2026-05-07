/**
 * PATHFINDER V32 — TIME ANALYTICS PANEL
 * 
 * Optional debugging panel for performance monitoring.
 * Displays timing metrics for all PathFinder operations.
 * Hidden by default, enabled via toggle.
 */

import React, { useState, useEffect } from 'react';
import { getTimeEngine } from '../services/timeEngine';
import type { TimingMetrics, PerformanceThresholds } from '../services/timeEngine';

interface TimeAnalyticsPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

export function TimeAnalyticsPanel({ isVisible, onClose }: TimeAnalyticsPanelProps) {
  const [metrics, setMetrics] = useState<TimingMetrics | null>(null);
  const [thresholds, setThresholds] = useState<PerformanceThresholds | null>(null);
  const [performanceStatus, setPerformanceStatus] = useState<string>('good');

  useEffect(() => {
    if (!isVisible) return;

    const updateMetrics = () => {
      const timeEngine = getTimeEngine();
      setMetrics(timeEngine.getMetrics());
      setThresholds(timeEngine.getThresholds());
      setPerformanceStatus(timeEngine.getPerformanceStatus());
    };

    // Initial update
    updateMetrics();

    // Update every second
    const intervalId = setInterval(updateMetrics, 1000);

    return () => clearInterval(intervalId);
  }, [isVisible]);

  if (!isVisible || !metrics || !thresholds) return null;

  const statusClass = {
    excellent: 'border-green-500 text-green-600',
    good: 'border-blue-500 text-blue-600',
    fair: 'border-yellow-500 text-yellow-600',
    poor: 'border-red-500 text-red-600',
  }[performanceStatus as keyof any] || 'border-gray-300 text-gray-500';

  return (
    <div className={`fixed top-20 right-5 z-50 w-[400px] max-h-[80vh] overflow-y-auto v72-panel border-2 shadow-xl font-mono text-xs ${statusClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="m-0 text-base font-bold">Time Analytics</h3>
        <button onClick={onClose} className="v58-control-btn" aria-label="Close time analytics" title="Close">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="v73-icon">
            <path fillRule="evenodd" d="M6.225 4.811a.75.75 0 011.06 0L12 9.525l4.715-4.714a.75.75 0 111.06 1.06L13.06 10.586l4.714 4.715a.75.75 0 11-1.06 1.06L12 11.646l-4.715 4.715a.75.75 0 11-1.06-1.06l4.714-4.715-4.714-4.714a.75.75 0 010-1.061z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Performance Status */}
      <div className="mb-4 p-3 bg-gray-50 rounded-md">
        <div className="text-sm font-bold mb-1">Status: {performanceStatus.toUpperCase()}</div>
        {metrics.isSlowDevice && (
          <div className="text-[11px] text-yellow-500">Slow device detected - optimizations active</div>
        )}
      </div>

      {/* Route Calculation Metrics */}
      <MetricSection
        title="Route Calculation"
        current={metrics.routeCalculationTime}
        average={metrics.routeCalculationAvg}
        max={metrics.routeCalculationMax}
        threshold={thresholds.routeCalculation}
        unit="ms"
      />

      {/* Safe Return Metrics */}
      <MetricSection
        title="Safe Return"
        current={metrics.safeReturnTime}
        average={metrics.safeReturnAvg}
        max={metrics.safeReturnMax}
        threshold={thresholds.safeReturn}
        unit="ms"
      />

      {/* Exploration Metrics */}
      <MetricSection
        title="Exploration Scan"
        current={metrics.explorationScanTime}
        average={metrics.explorationScanAvg}
        max={metrics.explorationScanMax}
        threshold={thresholds.explorationScan}
        unit="ms"
      />

      {/* Navigation Cycle Metrics */}
      <MetricSection
        title="Navigation Cycle"
        current={metrics.navigationCycleTime}
        average={metrics.navigationCycleAvg}
        max={metrics.navigationCycleMax}
        threshold={thresholds.navigationCycle}
        unit="ms"
        extra={
          <div className="text-[11px] text-gray-400 mt-1">Cycle Rate: {metrics.navigationCycleRate.toFixed(2)} Hz</div>
        }
      />

      {/* Map Render Metrics */}
      <MetricSection
        title="Map Render"
        current={metrics.mapRenderTime}
        average={metrics.mapRenderAvg}
        max={metrics.mapRenderMax}
        threshold={thresholds.mapRender}
        unit="ms"
      />

      {/* Visualization FPS */}
      <div className="mb-3 p-3 bg-gray-50 rounded-md">
        <div className="text-[13px] font-bold mb-1">Visualization FPS</div>
        <div className={`text-[20px] font-bold ${metrics.visualizationFPS >= thresholds.visualizationFPS ? 'text-green-500' : metrics.visualizationFPS >= thresholds.visualizationFPS * 0.7 ? 'text-yellow-500' : 'text-red-500'}`}>
          {metrics.visualizationFPS.toFixed(1)} fps
        </div>
        <div className="text-[11px] text-gray-400">Target: {thresholds.visualizationFPS} fps</div>
      </div>

      {/* API Latency */}
      <div className="mb-3 p-3 bg-gray-50 rounded-md">
        <div className="text-[13px] font-bold mb-1">API Latency</div>
        <div className="flex justify-between text-[11px] mb-1">
          <span>Average:</span>
          <span className={getColorForMetric(metrics.apiLatencyAvg, thresholds.apiLatency) === '#10b981' ? 'text-green-500' : getColorForMetric(metrics.apiLatencyAvg, thresholds.apiLatency) === '#f59e0b' ? 'text-yellow-500' : getColorForMetric(metrics.apiLatencyAvg, thresholds.apiLatency) === '#ef4444' ? 'text-red-500' : 'text-gray-400'}>
            {metrics.apiLatencyAvg.toFixed(0)} ms
          </span>
        </div>
        <div className="flex justify-between text-[11px] mb-1">
          <span>Max:</span>
          <span className={getColorForMetric(metrics.apiLatencyMax, thresholds.apiLatency) === '#10b981' ? 'text-green-500' : getColorForMetric(metrics.apiLatencyMax, thresholds.apiLatency) === '#f59e0b' ? 'text-yellow-500' : getColorForMetric(metrics.apiLatencyMax, thresholds.apiLatency) === '#ef4444' ? 'text-red-500' : 'text-gray-400'}>
            {metrics.apiLatencyMax.toFixed(0)} ms
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span>Backend Proc:</span>
          <span className="text-gray-400">{metrics.backendProcessingAvg.toFixed(0)} ms</span>
        </div>
      </div>

      {/* GPS Update */}
      {metrics.gpsUpdateInterval !== null && (
        <div className="mb-3 p-3 bg-gray-50 rounded-md">
          <div className="text-[13px] font-bold mb-1">GPS Update</div>
          <div className="flex justify-between text-[11px] mb-1">
            <span>Interval:</span>
            <span>{metrics.gpsUpdateInterval.toFixed(0)} ms</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span>Average:</span>
            <span>{metrics.gpsUpdateAvg.toFixed(0)} ms</span>
          </div>
        </div>
      )}

      {/* Slowest Operation */}
      {metrics.slowestOperation && (
        <div className="mb-3 p-3 rounded-md bg-red-50">
          <div className="text-[13px] font-bold mb-1 text-red-500">Slowest Operation</div>
          <div className="text-[11px]">{metrics.slowestOperation.replace(/_/g, ' ').toUpperCase()}</div>
          <div className="text-[18px] font-bold text-red-500 mt-1">{metrics.longestRecentDelay.toFixed(0)} ms</div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-[11px] mb-1"><span>Total Events:</span><span>{metrics.totalEvents}</span></div>
        <div className="flex justify-between text-[11px]"><span>Total Duration:</span><span>{(metrics.totalDuration / 1000).toFixed(2)} s</span></div>
      </div>

      {/* Footer */}
      <div className="mt-4 text-[10px] text-gray-500 text-center">V32 Time Engine • Updates every 1s</div>
    </div>
  );
}

// Helper component for metric sections
function MetricSection({
  title,
  current,
  average,
  max,
  threshold,
  unit,
  extra,
}: {
  title: string;
  current: number | null;
  average: number;
  max: number;
  threshold: number;
  unit: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mb-3 p-3 bg-gray-50 rounded-md">
      <div className="text-[13px] font-bold mb-1">{title}</div>
      {current !== null && (
        <div className={`text-[18px] font-bold ${getColorForMetric(current, threshold) === '#10b981' ? 'text-green-500' : getColorForMetric(current, threshold) === '#f59e0b' ? 'text-yellow-500' : getColorForMetric(current, threshold) === '#ef4444' ? 'text-red-500' : 'text-gray-400'} mb-1`}>
          {current.toFixed(0)} {unit}
        </div>
      )}
      <div className="flex justify-between text-[11px] mb-0.5">
        <span>Avg:</span>
        <span className={getColorForMetric(average, threshold) === '#10b981' ? 'text-green-500' : getColorForMetric(average, threshold) === '#f59e0b' ? 'text-yellow-500' : getColorForMetric(average, threshold) === '#ef4444' ? 'text-red-500' : 'text-gray-400'}>
          {average.toFixed(0)} {unit}
        </span>
      </div>
      <div className="flex justify-between text-[11px] mb-0.5">
        <span>Max:</span>
        <span className={getColorForMetric(max, threshold) === '#10b981' ? 'text-green-500' : getColorForMetric(max, threshold) === '#f59e0b' ? 'text-yellow-500' : getColorForMetric(max, threshold) === '#ef4444' ? 'text-red-500' : 'text-gray-400'}>
          {max.toFixed(0)} {unit}
        </span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span>Target:</span>
        <span className="text-gray-400">{'<'} {threshold} {unit}</span>
      </div>
      {extra}
    </div>
  );
}

// Helper functions for color coding
function getColorForMetric(value: number, threshold: number): string {
  if (value === 0) return '#6b7280';
  if (value <= threshold) return '#10b981'; // green
  if (value <= threshold * 1.5) return '#f59e0b'; // yellow
  return '#ef4444'; // red
}

function getColorForFPS(value: number, threshold: number): string {
  if (value === 0) return '#6b7280';
  if (value >= threshold) return '#10b981'; // green
  if (value >= threshold * 0.7) return '#f59e0b'; // yellow
  return '#ef4444'; // red
}

export default TimeAnalyticsPanel;
