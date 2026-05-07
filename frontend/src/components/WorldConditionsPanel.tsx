/**
 * PATHFINDER V38 — WORLD CONDITIONS UI PANEL
 * 
 * Displays real-time environmental conditions affecting routing.
 */

import React, { useState, useEffect } from 'react';
import { XMarkIcon, ChevronDownIcon, ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { worldModelEngine, WorldModelState } from '../services/worldModelEngine';

interface WorldConditionsPanelProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  initialCollapsed?: boolean;
}

export const WorldConditionsPanel: React.FC<WorldConditionsPanelProps> = ({
  position = 'top-right',
  initialCollapsed = false,
}) => {
  const [worldState, setWorldState] = useState<WorldModelState | null>(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Initial state
    setWorldState(worldModelEngine.getCurrentState());

    // Subscribe to updates
    const unsubscribe = worldModelEngine.addListener((state) => {
      setWorldState(state);
    });

    return () => {
      worldModelEngine.removeListener(unsubscribe);
    };
  }, []);

  if (!worldState) return null;

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  const isEmergency = worldState.environmental_scores.emergency_urgency > 0.8;

  // Minimal indicator when collapsed
  if (collapsed) {
    return (
      <div
        className={`fixed ${positionClasses[position]} z-50 cursor-pointer`}
        onClick={() => setCollapsed(false)}
      >
        <div className={`px-3 py-2 rounded-lg shadow-lg ${
          isEmergency ? 'bg-red-600 text-white animate-pulse' : 'bg-white/90 backdrop-blur-sm'
        }`}>
          <div className="flex items-center gap-2">
            {getWeatherIcon(worldState.weather.type)}
            <span className="text-sm font-medium">
              {Math.round(worldState.weather.temperature)}°C
            </span>
            {isEmergency && <ExclamationTriangleIcon className="w-4 h-4 text-yellow-400" />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed ${positionClasses[position]} z-50 w-80`}>
      {/* Emergency Banner */}
      {isEmergency && (
        <div className="bg-red-600 text-white px-4 py-2 rounded-t-lg animate-pulse">
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1"><ExclamationTriangleIcon className="w-4 h-4" /> EMERGENCY CONDITIONS</span>
            <span className="text-xs">SEEK SHELTER</span>
          </div>
        </div>
      )}

      {/* Main Panel */}
      <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-bold text-gray-800">World Conditions</h3>
          <button
            onClick={() => setCollapsed(true)}
            className="text-gray-500 hover:text-gray-700"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Weather */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getWeatherIcon(worldState.weather.type)}
              <div>
                <div className="text-sm font-semibold capitalize">
                  {worldState.weather.type.replace('_', ' ')}
                </div>
                <div className="text-xs text-gray-500">
                  Feels like {Math.round(worldState.weather.feels_like)}°C
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold">{Math.round(worldState.weather.temperature)}°C</div>
              <div className={`text-xs font-semibold ${getSeverityColor(worldState.weather.weather_severity)}`}>
                {worldState.weather.weather_severity}
              </div>
            </div>
          </div>

          {worldState.weather.wind_speed > 5 && (
            <div className="mt-2 text-xs text-gray-600">
              Wind: {Math.round(worldState.weather.wind_speed)} m/s
            </div>
          )}

          {worldState.weather.precipitation_probability > 0.3 && (
            <div className="mt-1 text-xs text-blue-600">
              Rain: {Math.round(worldState.weather.precipitation_probability * 100)}%
            </div>
          )}
        </div>

        {/* Crowd Density */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Crowd Density</span>
            <span className="text-xs font-bold capitalize">{worldState.crowd.density_category}</span>
          </div>
          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`absolute left-0 top-0 h-full transition-all duration-500 ${getCrowdColor(worldState.crowd.density_value)}`}
              style={{ width: `${worldState.crowd.density_value * 100}%` }}
            />
          </div>
          {worldState.crowd.movement_speed_modifier < 1.0 && (
            <div className="mt-1 text-xs text-orange-600">
              Movement {Math.round((1 - worldState.crowd.movement_speed_modifier) * 100)}% slower
            </div>
          )}
        </div>

        {/* Hazards */}
        {worldState.hazards.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1"><ExclamationTriangleIcon className="w-4 h-4" /> Active Hazards</div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {worldState.hazards.slice(0, 3).map((hazard, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="capitalize">{hazard.type}</span>
                  <span className={`font-semibold ${getSeverityColor(hazard.severity)}`}>
                    {hazard.severity}
                  </span>
                </div>
              ))}
              {worldState.hazards.length > 3 && (
                <div className="text-xs text-gray-500">
                  +{worldState.hazards.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Walkability */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Walkability</span>
            <span className="text-lg font-bold" style={{ color: getScoreColor(worldState.walkability.overall_score) }}>
              {Math.round(worldState.walkability.overall_score * 100)}%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">Surface:</span>
              <span>{Math.round(worldState.walkability.surface_quality * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Lighting:</span>
              <span>{Math.round(worldState.walkability.lighting_quality * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Safety:</span>
              <span>{Math.round(worldState.walkability.safety_perception * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Access:</span>
              <span>{Math.round(worldState.walkability.accessibility * 100)}%</span>
            </div>
          </div>
          {worldState.walkability.environmental_friction > 1.2 && (
            <div className="mt-2 text-xs text-orange-600 flex items-center gap-1">
              <ExclamationTriangleIcon className="w-4 h-4" />
              <span>High environmental resistance ({worldState.walkability.environmental_friction.toFixed(1)}x)</span>
            </div>
          )}
        </div>

        {/* Street Activity */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Street Activity</span>
            <span className="text-xs font-bold capitalize">{worldState.activity.activity_level}</span>
          </div>
          <div className="mt-2 flex gap-2 text-xs">
            {worldState.activity.peak_hours && (
              <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded">Peak Hours</span>
            )}
            {worldState.activity.nighttime && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">Night</span>
            )}
            {worldState.activity.weekend && (
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded">Weekend</span>
            )}
          </div>
        </div>

        {/* Environmental Scores */}
        <div className="px-4 py-3">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full text-sm font-semibold text-gray-700 flex items-center justify-between"
          >
            <span>Environmental Scores</span>
            <span>{showDetails ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}</span>
          </button>

          {showDetails && (
            <div className="mt-2 space-y-1 text-xs">
              <ScoreBar
                label="Overall Safety"
                score={worldState.environmental_scores.overall_safety}
              />
              <ScoreBar
                label="Exploration"
                score={worldState.environmental_scores.exploration_favorability}
              />
              <ScoreBar
                label="Route Confidence"
                score={worldState.environmental_scores.route_confidence}
              />
              <ScoreBar
                label="Emergency Urgency"
                score={worldState.environmental_scores.emergency_urgency}
                isWarning
              />
              <ScoreBar
                label="Time Pressure"
                score={worldState.environmental_scores.time_pressure}
              />
            </div>
          )}
        </div>

        {/* Last Update */}
        <div className="px-4 py-2 bg-gray-50 rounded-b-lg">
          <div className="text-xs text-gray-500 text-center">
            Updated {getTimeAgo(worldState.last_update)}
          </div>
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// HELPER COMPONENTS
// =====================================================================

interface ScoreBarProps {
  label: string;
  score: number;
  isWarning?: boolean;
}

const ScoreBar: React.FC<ScoreBarProps> = ({ label, score, isWarning }) => {
  const color = isWarning && score > 0.6 ? 'bg-red-500' : 'bg-blue-500';
  
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold">{Math.round(score * 100)}%</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${score * 100}%` }}
        />
      </div>
    </div>
  );
};

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

function getWeatherIcon(_type: string): string {
  // Icons removed to avoid emoji usage; using text-only UI
  return '';
}

function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    none: 'text-green-600',
    low: 'text-yellow-600',
    moderate: 'text-orange-600',
    high: 'text-red-600',
    extreme: 'text-red-700',
    critical: 'text-red-700',
  };
  return colors[severity] || 'text-gray-600';
}

function getCrowdColor(density: number): string {
  if (density < 0.2) return 'bg-green-500';
  if (density < 0.4) return 'bg-yellow-500';
  if (density < 0.6) return 'bg-orange-500';
  if (density < 0.8) return 'bg-red-500';
  return 'bg-red-700';
}

function getScoreColor(score: number): string {
  if (score >= 0.8) return '#10b981'; // green
  if (score >= 0.6) return '#f59e0b'; // orange
  if (score >= 0.4) return '#ef4444'; // red
  return '#991b1b'; // dark red
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
