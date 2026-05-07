// PathFinder V35 - Ambient Mode Indicator Component
// Visual indicator showing current ambient mode status and trigger reasons

import React, { useState, useEffect } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import { getAmbientModeEngine } from '../services/ambientModeEngine';
import type { AmbientModeState } from '../services/ambientModeEngine';

interface AmbientModeIndicatorProps {
  className?: string;
  showDetails?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

const AmbientModeIndicator: React.FC<AmbientModeIndicatorProps> = ({
  className = '',
  showDetails = true,
  position = 'top-right'
}) => {
  const [ambientState, setAmbientState] = useState<AmbientModeState | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const ambientEngine = getAmbientModeEngine();
    
    const handleStateUpdate = (state: AmbientModeState) => {
      setAmbientState(state);
    };

    ambientEngine.addListener(handleStateUpdate);
    setAmbientState(ambientEngine.getState());

    return () => {
      ambientEngine.removeListener(handleStateUpdate);
    };
  }, []);

  if (!ambientState) {
    return null;
  }

  const getStatusColor = (): string => {
    if (!ambientState.isActive) return '#10B981'; // Green - normal
    if (ambientState.safetyBoost >= 2.0) return '#EF4444'; // Red - critical
    if (ambientState.safetyBoost >= 1.5) return '#F59E0B'; // Amber - warning
    return '#3B82F6'; // Blue - active
  };

  const getStatusText = (): string => {
    if (!ambientState.isActive) return 'Normal Mode';
    return `Ambient Safety (${ambientState.safetyBoost.toFixed(1)}x)`;
  };

  const getPositionClasses = (): string => {
    const positions = {
      'top-right': 'top-4 right-4',
      'top-left': 'top-4 left-4',
      'bottom-right': 'bottom-4 right-4',
      'bottom-left': 'bottom-4 left-4',
    };
    return positions[position];
  };

  const formatTriggerReason = (reason: string): string => {
    const reasonMap: Record<string, string> = {
      'night_mode': 'Night Time',
      'unsafe_area': 'Unsafe Zone',
      'unfamiliar_area': 'Unfamiliar Area',
      'low_battery': 'Low Battery',
      'poor_gps': 'Poor GPS Signal',
      'user_request': 'Manual Activation',
    };
    return reasonMap[reason] || reason;
  };

  const getTriggerIcon = (_reason: string): string => {
    // Icons removed to avoid emojis; keeping text-only labels
    return '';
  };

  return (
    <div 
      className={`fixed z-50 ${getPositionClasses()} ${className}`}
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* Main Indicator */}
      <div 
        className="bg-white shadow-lg rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-xl"
        onClick={() => showDetails && setIsExpanded(!isExpanded)}
        style={{
          borderLeft: `4px solid ${getStatusColor()}`,
          minWidth: '200px',
        }}
      >
        {/* Status Bar */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div 
              className="w-3 h-3 rounded-full animate-pulse"
              style={{ backgroundColor: getStatusColor() }}
            />
            <div>
              <div className="text-sm font-semibold text-gray-800">
                {getStatusText()}
              </div>
              {ambientState.isActive && (
                <div className="text-xs text-gray-500">
                  {ambientState.recommendedAlgorithm}
                </div>
              )}
            </div>
          </div>
          
          {showDetails && (
            <div className="text-gray-400">
              {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
            </div>
          )}
        </div>

        {/* Expanded Details */}
        {isExpanded && showDetails && (
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 rounded-b-lg">
            {/* Active Triggers */}
            {ambientState.isActive && ambientState.activeTriggers.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-700 mb-2">
                  Active Triggers:
                </div>
                <div className="space-y-1">
                  {ambientState.activeTriggers.map((trigger, index) => (
                    <div 
                      key={index}
                      className="flex items-center space-x-2 text-xs"
                    >
                      <span>{getTriggerIcon(trigger)}</span>
                      <span className="text-gray-600">
                        {formatTriggerReason(trigger)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Safety Boost Details */}
            {ambientState.isActive && (
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-700 mb-2">
                  Safety Adjustments:
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div>• Route Safety: +{Math.round((ambientState.safetyBoost - 1) * 100)}%</div>
                  <div>• Algorithm: {ambientState.recommendedAlgorithm}</div>
                  {ambientState.safetyBoost >= 1.5 && (
                    <div>• High Alert Mode Active</div>
                  )}
                </div>
              </div>
            )}

            {/* Recommended Actions */}
            {ambientState.isActive && ambientState.recommendedBehaviors.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-700 mb-2">
                  Recommendations:
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  {ambientState.recommendedBehaviors.map((behavior, index) => (
                    <div key={index}>• {behavior}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Normal Mode Info */}
            {!ambientState.isActive && (
              <div className="text-xs text-gray-600">
                <div className="flex items-center space-x-2 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-green-500">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-2.59a.75.75 0 10-1.22-.86l-3.28 4.66-1.72-1.72a.75.75 0 10-1.06 1.06l2.25 2.25a.75.75 0 001.14-.1l3.89-5.29z" clipRule="evenodd" />
                  </svg>
                  <span>All conditions normal</span>
                </div>
                <div>Standard safety algorithms active</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions (only when active) */}
      {ambientState.isActive && (
        <div className="mt-2 flex space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Force high safety mode
              const ambientEngine = getAmbientModeEngine();
              ambientEngine.forceHighSafety(true);
            }}
            className="px-3 py-1 bg-blue-500 text-white text-xs rounded-md hover:bg-blue-600 transition-colors"
          >
            Max Safety
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Temporarily override (user knows better)
              const ambientEngine = getAmbientModeEngine();
              ambientEngine.temporaryOverride(300000); // 5 minutes
            }}
            className="px-3 py-1 bg-gray-500 text-white text-xs rounded-md hover:bg-gray-600 transition-colors"
          >
            Override 5m
          </button>
        </div>
      )}
    </div>
  );
};

export default AmbientModeIndicator;