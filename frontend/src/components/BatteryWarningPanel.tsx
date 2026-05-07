// PathFinder V35 - Battery Warning Panel Component
// Shows battery level with critical/conservative mode warnings and power-saving actions

import React, { useState, useEffect } from 'react';
import { BoltIcon, ChevronDownIcon, ChevronUpIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { getBatteryAwareRoutingEngine } from '../services/batteryAwareRoutingEngine';
import type { BatteryState, PowerMode } from '../services/batteryAwareRoutingEngine';

interface BatteryWarningPanelProps {
  className?: string;
  alwaysShow?: boolean;
  position?: 'top' | 'bottom';
}

const BatteryWarningPanel: React.FC<BatteryWarningPanelProps> = ({
  className = '',
  alwaysShow = false,
  position = 'bottom'
}) => {
  const [batteryState, setBatteryState] = useState<BatteryState | null>(null);
  const [powerMode, setPowerMode] = useState<PowerMode>('normal');
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastWarningTime, setLastWarningTime] = useState<number>(0);

  useEffect(() => {
    const batteryEngine = getBatteryAwareRoutingEngine();
    
    const updateBatteryInfo = () => {
      const state = batteryEngine.getBatteryState();
      const mode = batteryEngine.getCurrentPowerMode();
      
      setBatteryState(state);
      setPowerMode(mode);

      // Auto-expand on critical battery
      if (mode === 'critical' && Date.now() - lastWarningTime > 30000) {
        setIsExpanded(true);
        setLastWarningTime(Date.now());
      }
    };

    // Initial update
    updateBatteryInfo();

    // Listen for battery changes
    const interval = setInterval(updateBatteryInfo, 5000); // Every 5 seconds

    return () => {
      clearInterval(interval);
    };
  }, [lastWarningTime]);

  if (!batteryState) {
    return null;
  }

  const shouldShow = alwaysShow || powerMode !== 'normal' || batteryState.level < 30;

  if (!shouldShow) {
    return null;
  }

  const getBatteryColor = (): string => {
    if (batteryState.level < 10) return '#EF4444'; // Red
    if (batteryState.level < 25) return '#F59E0B'; // Orange
    if (batteryState.level < 50) return '#EAB308'; // Yellow
    return '#10B981'; // Green
  };

  // Emoji battery icons removed per guidelines.

  const getModeColor = (): string => {
    switch (powerMode) {
      case 'critical': return '#EF4444';
      case 'conservative': return '#F59E0B';
      default: return '#10B981';
    }
  };

  const getModeText = (): string => {
    switch (powerMode) {
      case 'critical': return 'Critical Power Mode';
      case 'conservative': return 'Conservative Mode';
      default: return 'Normal Mode';
    }
  };

  const formatTimeRemaining = (minutes: number): string => {
    if (minutes < 60) {
      return `${Math.round(minutes)}m remaining`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m remaining`;
  };

  const getPositionClasses = (): string => {
    return position === 'top' ? 'top-4' : 'bottom-4';
  };

  const getPowerModeAdjustments = () => {
    const batteryEngine = getBatteryAwareRoutingEngine();
    const adjustments = batteryEngine.getCurrentAdjustments();
    return adjustments;
  };

  return (
    <div 
      className={`fixed left-4 right-4 z-40 ${getPositionClasses()} ${className}`}
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* Main Battery Panel */}
      <div 
        className={`bg-white shadow-lg rounded-lg border cursor-pointer transition-all duration-300 ${
          isExpanded ? 'shadow-2xl' : 'hover:shadow-xl'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          borderTop: `4px solid ${getModeColor()}`,
          maxWidth: '600px',
          margin: '0 auto',
        }}
      >
        {/* Header Bar */}
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Battery Status */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {batteryState.isCharging && <BoltIcon className="w-5 h-5 text-yellow-500" />}
              <div className="flex flex-col">
                <div className="text-sm font-semibold text-gray-800">
                  {batteryState.level}% Battery
                </div>
                {batteryState.isCharging && (
                  <div className="text-xs text-green-600 font-medium">
                    Charging
                  </div>
                )}
              </div>
            </div>

            {/* Battery Level Bar */}
            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full transition-all duration-500 rounded-full"
                style={{ 
                  width: `${batteryState.level}%`,
                  backgroundColor: getBatteryColor()
                }}
              />
            </div>

            {/* Power Mode */}
            <div className="flex flex-col items-center">
              <div 
                className="text-xs font-bold px-2 py-1 rounded text-white"
                style={{ backgroundColor: getModeColor() }}
              >
                {getModeText()}
              </div>
              {batteryState.chargingTime > 0 && batteryState.isCharging && (
                <div className="text-xs text-gray-500 mt-1">
                  {formatTimeRemaining(batteryState.chargingTime)}
                </div>
              )}
              {batteryState.dischargingTime > 0 && !batteryState.isCharging && (
                <div className="text-xs text-gray-500 mt-1">
                  {formatTimeRemaining(batteryState.dischargingTime)}
                </div>
              )}
            </div>
          </div>

          {/* Expand Icon */}
          <div className="text-gray-400">
            {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 rounded-b-lg">
            {/* Power Mode Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Current Adjustments */}
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">
                  Current Adjustments:
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  {(() => {
                    const adjustments = getPowerModeAdjustments();
                    return (
                      <>
                        <div>• API Calls: {Math.round(adjustments.apiFrequencyMultiplier * 100)}% of normal</div>
                        <div>• Navigation Cycle: {adjustments.navigationCycleInterval / 1000}s</div>
                        <div>• Algorithm: {adjustments.algorithmRecommendation}</div>
                        {adjustments.disableHeavyVisualization && (
                          <div>• Heavy visualizations disabled</div>
                        )}
                        {adjustments.forceSafeReturn && (
                          <div className="text-red-600 font-medium">• Safe return forced</div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Battery Health */}
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">
                  Battery Info:
                </div>
                <div className="text-xs text-gray-600 space-y-1">
                  <div>• Level: {batteryState.level}%</div>
                  <div>• Status: {batteryState.isCharging ? 'Charging' : 'Discharging'}</div>
                  {batteryState.chargingTime > 0 && batteryState.isCharging && (
                    <div>• Full in: {formatTimeRemaining(batteryState.chargingTime)}</div>
                  )}
                  {batteryState.dischargingTime > 0 && !batteryState.isCharging && (
                    <div>• Empty in: {formatTimeRemaining(batteryState.dischargingTime)}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Critical Warnings */}
            {powerMode === 'critical' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <div className="flex items-center space-x-2 mb-2">
                  <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-bold text-red-700">Critical Battery Level</span>
                </div>
                <div className="text-xs text-red-600 space-y-1">
                  <div>• Navigation may be interrupted</div>
                  <div>• Only essential features active</div>
                  <div>• Find charging source immediately</div>
                </div>
              </div>
            )}

            {/* Power Saving Tips */}
            {(powerMode === 'conservative' || powerMode === 'critical') && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-sm font-medium text-blue-700 mb-2">
                  Power Saving Tips:
                </div>
                <div className="text-xs text-blue-600 space-y-1">
                  <div>• Reduce screen brightness</div>
                  <div>• Close other apps</div>
                  <div>• Use airplane mode in safe areas</div>
                  <div>• Consider shorter routes</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        {isExpanded && (
          <div className="px-4 py-3 border-t border-gray-100 flex justify-center space-x-3">
            {powerMode !== 'critical' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const batteryEngine = getBatteryAwareRoutingEngine();
                  batteryEngine.forcePowerMode('conservative', 600000); // 10 minutes
                }}
                className="px-4 py-2 bg-orange-500 text-white text-xs rounded-md hover:bg-orange-600 transition-colors"
              >
                Force Conservative
              </button>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                const batteryEngine = getBatteryAwareRoutingEngine();
                batteryEngine.enableUltimateEcoMode();
              }}
              className="px-4 py-2 bg-green-500 text-white text-xs rounded-md hover:bg-green-600 transition-colors"
            >
              Eco Mode
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
              className="px-4 py-2 bg-gray-500 text-white text-xs rounded-md hover:bg-gray-600 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BatteryWarningPanel;