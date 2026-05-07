import { CheckIcon, XMarkIcon, ChevronDownIcon, ChevronUpIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
// PathFinder V36 - Sensor Diagnostics Panel Component
// Real-time display of sensor fusion data and hardware status

import React, { useState, useEffect } from 'react';
import { getSensorFusionLayer } from '../services/sensorFusionLayer';
import type { SensorFusionState, MotionState } from '../services/sensorFusionLayer';

interface SensorDiagnosticsPanelProps {
  className?: string;
  position?: 'left' | 'right';
  defaultExpanded?: boolean;
}

const SensorDiagnosticsPanel: React.FC<SensorDiagnosticsPanelProps> = ({
  className = '',
  position = 'left',
  defaultExpanded = false
}) => {
  const [sensorState, setSensorState] = useState<SensorFusionState | null>(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    const sfl = getSensorFusionLayer();
    
    const handleStateUpdate = (state: SensorFusionState) => {
      setSensorState(state);
    };

    sfl.addListener(handleStateUpdate);
    setSensorState(sfl.getState());

    return () => {
      sfl.removeListener(handleStateUpdate);
    };
  }, []);

  if (!sensorState) {
    return null;
  }

  const getQualityColor = (quality: string): string => {
    switch (quality) {
      case 'excellent': return '#10B981';
      case 'good': return '#3B82F6';
      case 'fair': return '#F59E0B';
      case 'poor': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return '#10B981';
    if (confidence >= 0.6) return '#3B82F6';
    if (confidence >= 0.4) return '#F59E0B';
    return '#EF4444';
  };

  const getMotionStateIcon = (_state: MotionState): string => {
    return '';
  };

  const formatSpeed = (speed: number): string => {
    const kmh = speed * 3.6;
    return `${kmh.toFixed(1)} km/h`;
  };

  const formatHeading = (heading: number): string => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(heading / 45) % 8;
    return `${Math.round(heading)}° ${directions[index]}`;
  };

  const positionClasses = position === 'left' ? 'left-4' : 'right-4';

  return (
    <div 
      className={`fixed bottom-20 ${positionClasses} z-30 ${className}`}
      style={{ fontFamily: 'Inter, system-ui, sans-serif', maxWidth: '320px' }}
    >
      {/* Main Panel */}
      <div 
        className="bg-white shadow-xl rounded-lg border border-gray-200 overflow-hidden"
        style={{
          borderLeft: `4px solid ${getConfidenceColor(sensorState.sensor_health.overall_confidence)}`,
        }}
      >
        {/* Header */}
        <div 
          className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 cursor-pointer flex items-center justify-between"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${sensorState.isActive ? 'animate-pulse bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-sm font-semibold text-gray-800">
              Sensor Fusion {sensorState.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="text-gray-400 text-xs">
            {isExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronUpIcon className="w-4 h-4" />}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="p-4 space-y-4">
            {/* Fused Position */}
            {sensorState.fused_position && (
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center justify-between">
                  <span>Fused Position</span>
                  <span 
                    className="px-2 py-0.5 rounded text-white text-xs"
                    style={{ backgroundColor: getConfidenceColor(sensorState.fused_position.confidence_level) }}
                  >
                    {Math.round(sensorState.fused_position.confidence_level * 100)}% confidence
                  </span>
                </div>
                <div className="space-y-1 text-xs text-gray-600">
                  <div className="flex justify-between">
                    <span>Motion:</span>
                    <span className="font-medium">
                      {getMotionStateIcon(sensorState.fused_position.motion_state)}{' '}
                      {sensorState.fused_position.motion_state}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Speed:</span>
                    <span className="font-medium">{formatSpeed(sensorState.fused_position.speed)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Heading:</span>
                    <span className="font-medium">{formatHeading(sensorState.fused_position.heading)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* GPS Quality */}
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">GPS Quality</div>
              <div className="flex items-center space-x-2">
                <div 
                  className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden"
                >
                  <div 
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${sensorState.sensor_health.gps_quality === 'excellent' ? 100 :
                               sensorState.sensor_health.gps_quality === 'good' ? 75 :
                               sensorState.sensor_health.gps_quality === 'fair' ? 50 : 25}%`,
                      backgroundColor: getQualityColor(sensorState.sensor_health.gps_quality)
                    }}
                  />
                </div>
                <span 
                  className="text-xs font-medium capitalize"
                  style={{ color: getQualityColor(sensorState.sensor_health.gps_quality) }}
                >
                  {sensorState.sensor_health.gps_quality}
                </span>
              </div>
            </div>

            {/* Sensor Health */}
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">Sensor Health</div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Heading Stability</span>
                    <span>{Math.round(sensorState.sensor_health.heading_stability * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${sensorState.sensor_health.heading_stability * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Motion Consistency</span>
                    <span>{Math.round(sensorState.sensor_health.motion_consistency * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all duration-300"
                      style={{ width: `${sensorState.sensor_health.motion_consistency * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Available Sensors */}
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">Available Sensors</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className={`flex items-center space-x-1 ${sensorState.sensor_profile.accelerometer_available ? 'text-green-600' : 'text-gray-400'}`}>
                  {sensorState.sensor_profile.accelerometer_available ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : (
                    <XMarkIcon className="w-4 h-4" />
                  )}
                  <span>Accelerometer</span>
                </div>
                <div className={`flex items-center space-x-1 ${sensorState.sensor_profile.gyroscope_available ? 'text-green-600' : 'text-gray-400'}`}>
                  {sensorState.sensor_profile.gyroscope_available ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : (
                    <XMarkIcon className="w-4 h-4" />
                  )}
                  <span>Gyroscope</span>
                </div>
                <div className={`flex items-center space-x-1 ${sensorState.sensor_profile.compass_available ? 'text-green-600' : 'text-gray-400'}`}>
                  {sensorState.sensor_profile.compass_available ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : (
                    <XMarkIcon className="w-4 h-4" />
                  )}
                  <span>Compass</span>
                </div>
                <div className={`flex items-center space-x-1 ${sensorState.sensor_profile.ambient_light_available ? 'text-green-600' : 'text-gray-400'}`}>
                  {sensorState.sensor_profile.ambient_light_available ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : (
                    <XMarkIcon className="w-4 h-4" />
                  )}
                  <span>Ambient Light</span>
                </div>
              </div>
            </div>

            {/* Movement Pattern Alerts */}
            {(sensorState.movement_pattern.sudden_turn_detected ||
              sensorState.movement_pattern.erratic_movement ||
              sensorState.movement_pattern.stop_and_start_detected) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                <div className="text-xs font-semibold text-yellow-800 mb-1 flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-4 h-4" />
                  <span>Movement Alerts</span>
                </div>
                <div className="text-xs text-yellow-700 space-y-0.5">
                  {sensorState.movement_pattern.sudden_turn_detected && (
                    <div>• Sudden turn detected</div>
                  )}
                  {sensorState.movement_pattern.erratic_movement && (
                    <div>• Erratic movement</div>
                  )}
                  {sensorState.movement_pattern.stop_and_start_detected && (
                    <div>• Frequent stops</div>
                  )}
                  {sensorState.movement_pattern.direction_changes_per_minute > 5 && (
                    <div>• High direction changes ({sensorState.movement_pattern.direction_changes_per_minute}/min)</div>
                  )}
                </div>
              </div>
            )}

            {/* Ambient Light */}
            {sensorState.raw_sensor_data?.ambientLight !== undefined && (
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1">
                  Ambient Light
                </div>
                <div className="text-xs text-gray-600">
                  {Math.round(sensorState.raw_sensor_data.ambientLight)} lux
                  {sensorState.raw_sensor_data.ambientLight < 10 && ' (Dark)'}
                  {sensorState.raw_sensor_data.ambientLight >= 10 && sensorState.raw_sensor_data.ambientLight < 1000 && ' (Indoor)'}
                  {sensorState.raw_sensor_data.ambientLight >= 1000 && ' (Bright)'}
                </div>
              </div>
            )}

            {/* Sensor Weights */}
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">Fusion Weights</div>
              <div className="space-y-1 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>GPS:</span>
                  <span className="font-medium">{Math.round(sensorState.sensor_profile.gps_weight * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Heading:</span>
                  <span className="font-medium">{Math.round(sensorState.sensor_profile.heading_weight * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Motion:</span>
                  <span className="font-medium">{Math.round(sensorState.sensor_profile.motion_weight * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Familiarity:</span>
                  <span className="font-medium">{Math.round(sensorState.sensor_profile.familiarity_weight * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {isExpanded && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex justify-between text-xs">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const sfl = getSensorFusionLayer();
                navigator.geolocation.getCurrentPosition((pos) => {
                  sfl.calibrateFromKnownPosition(pos.coords.latitude, pos.coords.longitude);
                });
              }}
              className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Recalibrate
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
              className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Minimize
            </button>
          </div>
        )}
      </div>

      {/* Floating Indicator (when collapsed) */}
      {!isExpanded && (
        <div 
          className="mt-2 bg-white shadow-lg rounded-full px-3 py-2 cursor-pointer border border-gray-200 flex items-center space-x-2"
          onClick={() => setIsExpanded(true)}
        >
          <div 
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: getConfidenceColor(sensorState.sensor_health.overall_confidence) }}
          />
          <span className="text-xs font-medium text-gray-700">
            {Math.round(sensorState.sensor_health.overall_confidence * 100)}%
          </span>
          {sensorState.fused_position && (
            <span className="text-xs text-gray-500">
              {getMotionStateIcon(sensorState.fused_position.motion_state)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default SensorDiagnosticsPanel;
