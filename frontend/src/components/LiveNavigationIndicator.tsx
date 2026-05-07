// PathFinder V31 - Live Navigation Status Indicator
// Top-bar showing GPS accuracy, battery, safety, and algorithm status

import React from 'react';
import { ExclamationTriangleIcon, CheckIcon, ShieldCheckIcon } from '@heroicons/react/24/solid';
import { CompassIcon } from './Icons';
import type { NavigationState } from '../services/navigation';

interface LiveNavigationIndicatorProps {
  navigationState: NavigationState;
  isActive: boolean;
}

export const LiveNavigationIndicator: React.FC<LiveNavigationIndicatorProps> = ({
  navigationState,
  isActive,
}) => {
  if (!isActive) return null;

  const { currentPosition, safetyScore, batteryLevel, algorithm, deviationDistance } = navigationState;

  // GPS accuracy indicator
  const getGPSAccuracyColor = () => {
    if (!currentPosition) return 'text-gray-400';
    if (currentPosition.accuracy < 10) return 'text-green-500';
    if (currentPosition.accuracy < 20) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getGPSAccuracyBg = () => {
    if (!currentPosition) return 'bg-gray-400';
    if (currentPosition.accuracy < 10) return 'bg-green-500';
    if (currentPosition.accuracy < 20) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Safety score color
  const getSafetyColor = () => {
    if (safetyScore >= 80) return 'text-green-500';
    if (safetyScore >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  // Battery color
  const getBatteryColor = () => {
    if (batteryLevel >= 50) return 'text-green-500';
    if (batteryLevel >= 20) return 'text-yellow-500';
    return 'text-red-500';
  };

  // Algorithm badge color
  const getAlgorithmColor = () => {
    switch (algorithm) {
      case 'ShadowPath':
        return 'bg-yellow-500';
      case 'HomeGuard':
        return 'bg-blue-500';
      case 'PathfinderX':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 bg-gradient-to-b from-black to-transparent z-50 pointer-events-none">
      <div className="flex items-center justify-between px-4 py-2 text-white text-xs pointer-events-auto">
        {/* Left: Navigation Status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-black bg-opacity-50 px-2 py-1 rounded-full">
            <CompassIcon className="w-4 h-4 animate-pulse" />
            <span className="font-semibold">LIVE NAV</span>
          </div>
          
          <div className={`flex items-center gap-1 bg-black bg-opacity-50 px-2 py-1 rounded-full ${getAlgorithmColor()}`}>
            <span className="font-mono font-bold">{algorithm}</span>
          </div>
        </div>

        {/* Center: Deviation indicator */}
        {deviationDistance > 0 && (
          <div className="flex items-center gap-1 bg-black bg-opacity-50 px-2 py-1 rounded-full">
            {deviationDistance > 50 ? (
              <>
                <ExclamationTriangleIcon className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-400">{Math.round(deviationDistance)}m off route</span>
              </>
            ) : (
              <>
                <CheckIcon className="w-4 h-4 text-green-400" />
                <span className="text-green-400">On route</span>
              </>
            )}
          </div>
        )}

        {/* Right: Status indicators */}
        <div className="flex items-center gap-2">
          {/* GPS Accuracy */}
          <div className="flex items-center gap-1 bg-black bg-opacity-50 px-2 py-1 rounded-full">
            <span className={`w-2 h-2 rounded-full ${getGPSAccuracyBg()}`} />
            <span className={getGPSAccuracyColor()}>
              {currentPosition ? `${Math.round(currentPosition.accuracy)}m` : 'No GPS'}
            </span>
          </div>

          {/* Battery */}
          <div className="flex items-center gap-1 bg-black bg-opacity-50 px-2 py-1 rounded-full">
            <span className={getBatteryColor()}>{batteryLevel}%</span>
          </div>

          {/* Safety Score */}
          <div className="flex items-center gap-1 bg-black bg-opacity-50 px-2 py-1 rounded-full">
            <ShieldCheckIcon className="w-4 h-4" />
            <span className={getSafetyColor()}>{safetyScore}</span>
          </div>
        </div>
      </div>

      {/* Warning bar for critical conditions */}
      {(navigationState.environmentSignals.isLowBattery || 
        navigationState.environmentSignals.isNightTime) && (
        <div className="bg-red-600 text-white text-center text-xs py-1 px-4">
          {navigationState.environmentSignals.isLowBattery && 'Low Battery '}
          {navigationState.environmentSignals.isNightTime && 'Night Mode '}
          - Safe Return Recommended
        </div>
      )}
    </div>
  );
};

export default LiveNavigationIndicator;
