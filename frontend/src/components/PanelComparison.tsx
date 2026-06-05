import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { AppState } from '../App';
import { fetchComparison } from '../services/api';

interface PanelComparisonProps {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onClose: () => void;
}

export default function PanelComparison({ state, updateState, onClose }: PanelComparisonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompare = async (mode: '2' | 'all') => {
    if (!state.startPoint || !state.endPoint) {
      setError('Please select start and end points on the map');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const algorithms = mode === '2' 
        ? ['ShadowPath', 'HomeGuard']
        : ['ShadowPath', 'HomeGuard', 'PathfinderX'];

      const data = await fetchComparison({
        start_lat: state.startPoint[0],
        start_lon: state.startPoint[1],
        end_lat: state.endPoint[0],
        end_lon: state.endPoint[1],
        algorithms,
        profile: 'walking',
        include_visualization: state.showAlgorithmBehavior // Request viz data if enabled
      });

      updateState({ 
        comparisonResults: data.results,
        compareMode: mode
      });
      setError(null);
    } catch (error) {
      console.error('Comparison request failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to compare algorithms');
    } finally {
      setIsLoading(false);
    }
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
          <h2 className="text-sm font-medium text-white">COMPARE</h2>
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

          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => handleCompare('2')}
              disabled={isLoading}
              className="py-1.5 bg-blue-600 text-white text-xs font-medium touch-manipulation disabled:opacity-50"
            >
              {isLoading ? 'COMPARING' : 'COMPARE 2'}
            </button>
            <button
              onClick={() => handleCompare('all')}
              disabled={isLoading}
              className="py-1.5 bg-purple-600 text-white text-xs font-medium touch-manipulation disabled:opacity-50"
            >
              {isLoading ? 'COMPARING' : 'COMPARE ALL'}
            </button>
          </div>

          {state.comparisonResults && state.comparisonResults.length > 0 && (
            <div className="space-y-1">
              {state.comparisonResults.map((result, idx) => {
                const accent = idx === 0 ? 'border-l-2 border-blue-500' : idx === 1 ? 'border-l-2 border-emerald-500' : 'border-l-2 border-amber-500';
                return (
                <div key={idx} className={`bg-gray-900 p-2 ${accent}`}>
                  <div className="text-xs text-gray-400 mb-1">{result.algorithm.toUpperCase()}</div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">KM</span>
                      <span className="text-white font-medium">{result.distance?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">MIN</span>
                      <span className="text-white font-medium">{result.time?.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              );})}
            </div>
          )}

          {(!state.comparisonResults || state.comparisonResults.length === 0) && (
            <div className="text-center text-gray-500 py-8">
              Select start and end points, then compare algorithms
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
