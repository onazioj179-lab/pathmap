import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { AppState } from '../App';
import { interactionController } from '../controllers/InteractionController';
import type { VisualizationMode } from '../services/visualization';

interface PanelRoutingEngineProps {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onClose: () => void;
}

export default function PanelRoutingEngine({ state, updateState, onClose }: PanelRoutingEngineProps) {
  const [error, setError] = useState<string | null>(null);
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>('full-reveal');
  const [controllerState, setControllerState] = useState(interactionController.getState());

  // V41: Subscribe to InteractionController state
  useEffect(() => {
    const unsubscribe = interactionController.subscribe(setControllerState);
    return unsubscribe;
  }, []);

  const handleStartRoute = async () => {
    if (!state.startPoint || !state.endPoint) {
      setError('Please select start and end points on the map');
      return;
    }

    setError(null);

    // V41: Use InteractionController with debouncing + async handling
    await interactionController.onStartRoute(
      state.startPoint,
      state.endPoint,
      state.algorithm,
      (routeData) => {
        updateState({ routeData });
        setError(null);
      },
      (errorMsg) => {
        setError(errorMsg);
      }
    );
  };

  const handleClearMap = () => {
    updateState({
      startPoint: null,
      endPoint: null,
      routeData: null,
      comparisonResults: null
    });
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
          <h2 className="text-sm font-medium text-white">ROUTE</h2>
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
          <div className="grid grid-cols-3 gap-1">
            {['ShadowPath', 'HomeGuard', 'PathfinderX'].map((algo) => (
              <button
                key={algo}
                onClick={() => updateState({ algorithm: algo as any })}
                className={`py-1.5 text-xs font-medium touch-manipulation ${
                  state.algorithm === algo
                    ? 'bg-white text-black'
                    : 'bg-gray-800 text-gray-400'
                }`}
              >
                {algo === 'ShadowPath' && 'FAST'}
                {algo === 'HomeGuard' && 'SAFE'}
                {algo === 'PathfinderX' && 'EXPLORE'}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-900/30 p-2 text-red-300 text-xs">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <button
              onClick={handleStartRoute}
              disabled={controllerState.isRouteLoading}
              className="w-full py-1.5 bg-blue-600 text-white text-xs font-medium touch-manipulation disabled:opacity-50"
            >
              {controllerState.isRouteLoading ? 'CALCULATING' : 'GO'}
            </button>
            <button
              onClick={handleClearMap}
              disabled={controllerState.isRouteLoading}
              className="w-full py-1.5 bg-gray-800 text-gray-300 text-xs font-medium touch-manipulation disabled:opacity-50"
            >
              CLEAR
            </button>
          </div>

          {state.routeData && (
            <div className="bg-gray-900 p-2">
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">KM</span>
                  <span className="text-white font-medium">{state.routeData.distance?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">MIN</span>
                  <span className="text-white font-medium">{state.routeData.time?.toFixed(1)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
