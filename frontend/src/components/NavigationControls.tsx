// PathFinder V31 - Navigation Controls
// Toggle for enabling/disabling live navigation mode

import React from 'react';
import { motion } from 'framer-motion';

interface NavigationControlsProps {
  isLiveNavActive: boolean;
  onToggleLiveNav: (enabled: boolean) => void;
  currentSpeed?: number;
  distanceToDestination?: number;
  estimatedTimeRemaining?: number;
}

export const NavigationControls: React.FC<NavigationControlsProps> = ({
  isLiveNavActive,
  onToggleLiveNav,
  currentSpeed,
  distanceToDestination,
  estimatedTimeRemaining,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-20 left-4 right-4 z-40 pointer-events-auto"
    >
      <div className="v72-panel max-w-sm">
        {/* Main Toggle */}
        <div className="flex items-center justify-between mb-2 v72-panel-header border-0 p-0">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isLiveNavActive ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className="font-medium text-gray-900">Live Navigation</span>
          </div>
          
          <button
            onClick={() => onToggleLiveNav(!isLiveNavActive)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              isLiveNavActive ? 'bg-green-500' : 'bg-gray-300'
            }`}
            type="button"
            aria-label="Toggle live navigation"
            title="Toggle live navigation"
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                isLiveNavActive ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Active Navigation Info */}
        {isLiveNavActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-2 pt-2 border-t border-gray-200"
          >
            <div className="grid grid-cols-3 gap-2 text-xs">
              {/* Current Speed */}
              <div className="bg-gray-50 rounded-md p-2 text-center">
                <div className="text-gray-500">Speed</div>
                <div className="font-semibold text-gray-900">
                  {currentSpeed !== undefined 
                    ? `${(currentSpeed * 3.6).toFixed(1)} km/h` 
                    : '--'}
                </div>
              </div>

              {/* Distance Remaining */}
              <div className="bg-gray-50 rounded-md p-2 text-center">
                <div className="text-gray-500">Distance</div>
                <div className="font-semibold text-gray-900">
                  {distanceToDestination !== undefined
                    ? `${(distanceToDestination / 1000).toFixed(2)} km`
                    : '--'}
                </div>
              </div>

              {/* Time Remaining */}
              <div className="bg-gray-50 rounded-md p-2 text-center">
                <div className="text-gray-500">ETA</div>
                <div className="font-semibold text-gray-900">
                  {estimatedTimeRemaining !== undefined
                    ? `${Math.round(estimatedTimeRemaining)} min`
                    : '--'}
                </div>
              </div>
            </div>

            {/* Status Message */}
            <div className="bg-blue-50 rounded-md p-2 text-xs text-blue-800 text-center">
              Real-time tracking active • Auto-reroute enabled
            </div>
          </motion.div>
        )}

        {/* Inactive Message */}
        {!isLiveNavActive && (
          <div className="text-xs text-gray-500 text-center pt-2 border-t border-gray-200">
            Enable to activate real-time GPS tracking and automatic rerouting
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default NavigationControls;
