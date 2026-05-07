import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { AppState } from '../App';
import { interactionController } from '../controllers/InteractionController';

interface PanelTrackingProps {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onClose: () => void;
}

export default function PanelTracking({ state, updateState, onClose }: PanelTrackingProps) {
  const [controllerState, setControllerState] = useState(interactionController.getState());

  // V41: Subscribe to InteractionController state
  useEffect(() => {
    const unsubscribe = interactionController.subscribe(setControllerState);
    return unsubscribe;
  }, []);

  const handleStartTracking = () => {
    if (controllerState.isTrackingActive) return;

    // V41: Use InteractionController for tracking
    interactionController.onTrackStart();
    updateState({ isTracking: true });
  };

  const handleStopTracking = () => {
    if (!controllerState.isTrackingActive) return;

    // V41: Use InteractionController to stop tracking
    const points = interactionController.onTrackStop();
    
    // Convert to app format and update
    const trackingHistory = points.map(p => [p.lat, p.lon] as [number, number]);
    updateState({ 
      isTracking: false,
      trackingHistory: [...state.trackingHistory, ...trackingHistory]
    });
  };

  const handleClearHistory = () => {
    interactionController.clearTracking();
    updateState({ trackingHistory: [] });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ duration: 0.24, ease: [0.20, 0.6, 0.2, 1] }}
        className="v59-panel-slide fixed bottom-16 left-0 right-0 bg-black z-50 max-h-[70vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-black px-4 py-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-white">TRACKING</h2>
          <button
            onClick={onClose}
            title="Close"
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-900 touch-manipulation"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-3 space-y-2">
          <div className="flex items-center justify-center gap-2 bg-gray-900 p-2">
            <div className={`w-2 h-2 rounded-full ${controllerState.isTrackingActive ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-xs text-gray-400">
              {controllerState.isTrackingActive ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>

          <div className="space-y-1">
            {!controllerState.isTrackingActive ? (
              <button
                onClick={handleStartTracking}
                className="w-full py-2 bg-green-600 text-white text-xs font-medium touch-manipulation hover:bg-green-700 transition-colors"
              >
                START
              </button>
            ) : (
              <button
                onClick={handleStopTracking}
                className="w-full py-2 bg-red-600 text-white text-xs font-medium touch-manipulation hover:bg-red-700 transition-colors"
              >
                STOP
              </button>
            )}

            <button
              onClick={handleClearHistory}
              disabled={state.trackingHistory.length === 0}
              className="w-full py-2 bg-gray-800 text-gray-300 text-xs font-medium touch-manipulation hover:bg-gray-700 transition-colors disabled:opacity-30"
            >
              CLEAR
            </button>
          </div>

          <div className="bg-gray-900 p-2">
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">POINTS</span>
                <span className="text-gray-300">{state.trackingHistory.length}</span>
              </div>
              {state.trackingHistory.length > 1 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">LAST</span>
                  <span className="text-gray-300 text-[10px]">
                    {state.trackingHistory[state.trackingHistory.length - 1][0].toFixed(4)}, 
                    {state.trackingHistory[state.trackingHistory.length - 1][1].toFixed(4)}
                  </span>
                </div>
              )}
            </div>
          </div>

        </div>
      </motion.div>
    </AnimatePresence>
  );
}
