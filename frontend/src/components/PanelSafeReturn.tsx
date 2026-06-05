import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { AppState } from '../App';
import { interactionController } from '../controllers/InteractionController';

interface PanelSafeReturnProps {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onClose: () => void;
}

export default function PanelSafeReturn({ state, updateState, onClose }: PanelSafeReturnProps) {
  const [error, setError] = useState<string | null>(null);
  const [controllerState, setControllerState] = useState(interactionController.getState());

  // Subscribe to InteractionController state
  useEffect(() => {
    const unsubscribe = interactionController.subscribe(setControllerState);
    return unsubscribe;
  }, []);

  const handleSafeReturn = async () => {
    const currentPosition = state.trackingHistory.length > 0
      ? state.trackingHistory[state.trackingHistory.length - 1]
      : state.startPoint;

    if (!currentPosition) {
      setError('No current position available. Start tracking or set a start point.');
      return;
    }

    setError(null);

    // Use InteractionController with debouncing + async handling
    await interactionController.onSafeReturn(
      currentPosition,
      (routeData) => {
        updateState({ safeReturnRoutes: [routeData.main_route] });
        setError(null);
      },
      (errorMsg) => {
        setError(errorMsg);
      }
    );
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
          <h2 className="text-sm font-medium text-white">SAFE RETURN</h2>
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
          {error && (
            <div className="bg-red-900/30 p-2 text-red-300 text-xs">
              {error}
            </div>
          )}

          <button
            onClick={handleSafeReturn}
            disabled={controllerState.isSafeReturnLoading}
            className="w-full py-1.5 bg-green-600 text-white text-xs font-medium touch-manipulation disabled:opacity-50"
          >
            {controllerState.isSafeReturnLoading ? 'CALCULATING' : 'FIND SAFE ROUTE'}
          </button>

          {state.safeReturnRoutes && state.safeReturnRoutes.length > 0 && (
            <div className="space-y-1">
              {state.safeReturnRoutes.map((route, idx) => (
                <div key={idx} className="bg-gray-900 p-2">
                  <div className="text-xs text-gray-400 mb-1">ROUTE {idx + 1}</div>
                  <div className="grid grid-cols-2 gap-1 text-xs mb-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">KM</span>
                      <span className="text-white font-medium">{route.distance?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">MIN</span>
                      <span className="text-white font-medium">{route.time?.toFixed(1)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => updateState({ routeData: route })}
                    className="w-full py-1 bg-blue-600 text-white text-xs font-medium touch-manipulation"
                  >
                    USE
                  </button>
                </div>
              ))}
            </div>
          )}

          {(!state.safeReturnRoutes || state.safeReturnRoutes.length === 0) && (
            <div className="text-center text-gray-500 text-xs py-4">
              No routes calculated yet
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
