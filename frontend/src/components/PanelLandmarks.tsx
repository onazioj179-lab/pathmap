import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { AppState } from '../App';

interface PanelLandmarksProps {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onClose: () => void;
}

const landmarkTypes = [
  { value: 'hospital', label: 'Hospital', color: 'text-red-600' },
  { value: 'police', label: 'Police', color: 'text-blue-600' },
  { value: 'fire', label: 'Fire Station', color: 'text-orange-600' },
  { value: 'shelter', label: 'Shelter', color: 'text-green-600' },
  { value: 'other', label: 'Other', color: 'text-gray-600' }
];

export default function PanelLandmarks({ state, updateState, onClose }: PanelLandmarksProps) {
  const [newLandmarkName, setNewLandmarkName] = useState('');
  const [newLandmarkType, setNewLandmarkType] = useState('hospital');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddLandmark = () => {
    if (!state.startPoint && !state.endPoint) {
      alert('Please click on the map to set a landmark position');
      return;
    }

    const position = state.endPoint || state.startPoint;
    if (!position) return;

    const newLandmark = {
      id: `landmark-${Date.now()}`,
      position,
      name: newLandmarkName || 'Unnamed Landmark',
      type: newLandmarkType
    };

    updateState({
      landmarks: [...state.landmarks, newLandmark],
      endPoint: null
    });

    setNewLandmarkName('');
    setIsAdding(false);
  };

  const handleRemoveLandmark = (id: string) => {
    updateState({
      landmarks: state.landmarks.filter(lm => lm.id !== id)
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
          <h2 className="text-sm font-medium text-white">LANDMARKS</h2>
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
          {!isAdding ? (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full py-1.5 bg-blue-600 text-white text-xs font-medium touch-manipulation"
            >
              ADD LANDMARK
            </button>
          ) : (
            <div className="bg-gray-900 p-2 space-y-2">
              <input
                type="text"
                placeholder="Name"
                value={newLandmarkName}
                onChange={(e) => setNewLandmarkName(e.target.value)}
                className="w-full px-2 py-1 bg-gray-800 text-white text-xs border border-gray-700"
              />
              <select
                value={newLandmarkType}
                onChange={(e) => setNewLandmarkType(e.target.value)}
                className="w-full px-2 py-1 bg-gray-800 text-white text-xs border border-gray-700"
                title="Landmark type"
              >
                {landmarkTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
              <div className="flex gap-1">
                <button
                  onClick={handleAddLandmark}
                  className="flex-1 py-1.5 bg-blue-600 text-white text-xs font-medium touch-manipulation"
                >
                  SAVE
                </button>
                <button
                  onClick={() => setIsAdding(false)}
                  className="flex-1 py-1.5 bg-gray-800 text-gray-300 text-xs font-medium touch-manipulation"
                >
                  CANCEL
                </button>
              </div>
              <div className="text-xs text-gray-500">
                Click map to set position
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="text-xs text-gray-500">SAVED ({state.landmarks.length})</div>
            {state.landmarks.length === 0 ? (
              <div className="text-center text-gray-500 text-xs py-4">
                No landmarks yet
              </div>
            ) : (
              state.landmarks.map(landmark => {
                const typeInfo = landmarkTypes.find(t => t.value === landmark.type);
                return (
                  <div key={landmark.id} className="bg-gray-900 p-2 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-xs text-white">{landmark.name}</div>
                      <div className="text-xs text-gray-500">
                        {typeInfo?.label || landmark.type}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveLandmark(landmark.id)}
                      className="ml-2 p-1 text-red-400 hover:bg-gray-800 touch-manipulation"
                      title="Remove landmark"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
