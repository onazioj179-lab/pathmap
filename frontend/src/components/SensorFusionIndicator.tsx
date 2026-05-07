// PathFinder V36 - Sensor Fusion Active Indicator
// Minimal indicator showing sensor fusion status

import React, { useState, useEffect } from 'react';
import { getSensorFusionLayer } from '../services/sensorFusionLayer';

interface SensorFusionIndicatorProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

const SensorFusionIndicator: React.FC<SensorFusionIndicatorProps> = ({
  position = 'top-right'
}) => {
  const [isActive, setIsActive] = useState(false);
  const [confidence, setConfidence] = useState(0);

  useEffect(() => {
    const sfl = getSensorFusionLayer();
    
    const handleUpdate = () => {
      const state = sfl.getState();
      setIsActive(state.isActive);
      setConfidence(state.sensor_health.overall_confidence);
    };

    sfl.addListener(handleUpdate);
    handleUpdate();

    return () => sfl.removeListener(handleUpdate);
  }, []);

  if (!isActive) return null;

  const getConfidenceColor = (): string => {
    if (confidence >= 0.8) return '#10B981';
    if (confidence >= 0.6) return '#3B82F6';
    if (confidence >= 0.4) return '#F59E0B';
    return '#EF4444';
  };

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  }[position];

  return (
    <div 
      className={`fixed ${positionClasses} z-30 bg-white shadow-lg rounded-full px-3 py-2 border border-gray-200 flex items-center space-x-2`}
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div 
        className="w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: getConfidenceColor() }}
      />
      <span className="text-xs font-medium text-gray-700">
        Sensor Fusion
      </span>
    </div>
  );
};

export default SensorFusionIndicator;
