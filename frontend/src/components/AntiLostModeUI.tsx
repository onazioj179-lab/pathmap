// PathFinder V35 - Anti-Lost Mode UI Component
// Simplified navigation interface for when user is disoriented

import React, { useState, useEffect } from 'react';
import { CompassIcon } from '@heroicons/react/24/solid';
import { getAntiLostModeEngine } from '../services/antiLostModeEngine';
import type { AntiLostModeState } from '../services/antiLostModeEngine';

const AntiLostModeUI: React.FC = () => {
  const [lostState, setLostState] = useState<AntiLostModeState | null>(null);

  useEffect(() => {
    const engine = getAntiLostModeEngine();
    
    const handleUpdate = (state: AntiLostModeState) => {
      setLostState(state);
    };

    engine.addListener(handleUpdate);
    setLostState(engine.getState());

    return () => engine.removeListener(handleUpdate);
  }, []);

  if (!lostState?.isActive) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="text-center space-y-8 px-8">
        <div className="mb-4 flex justify-center text-white">
          <CompassIcon className="w-16 h-16" />
        </div>
        
        <div className="text-white">
          <div className="text-sm text-gray-400 mb-2">Anti-Lost Mode Active</div>
          <div className="text-4xl font-bold mb-6">{lostState.currentInstruction}</div>
          
          <div className="text-2xl text-gray-300 mb-8">
            Confidence: {Math.round(lostState.lostConfidence * 100)}%
          </div>
        </div>

        <div className="bg-white bg-opacity-10 rounded-lg p-6 text-white">
          <div className="text-sm mb-2">Active Triggers:</div>
          <div className="text-xs space-y-1">
            {lostState.triggerReasons.map((reason, i) => (
              <div key={i}>• {reason}</div>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            const engine = getAntiLostModeEngine();
            engine.deactivate();
          }}
          className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600"
        >
          Exit Anti-Lost Mode
        </button>
      </div>
    </div>
  );
};

export default AntiLostModeUI;
