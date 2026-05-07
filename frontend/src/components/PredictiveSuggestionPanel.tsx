import React, { useState, useEffect } from 'react';
import { behaviorPredictionEngine, PredictedIntent } from '../services/behaviorPredictionEngine';
import { intentModelingSystem, IntentBasedAdjustments } from '../services/intentModelingSystem';
import { CursorArrowRaysIcon, HomeIcon, MagnifyingGlassIcon, UserGroupIcon, CompassIcon, StopIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/solid';

/**
 * PATHFINDER V37 — PREDICTIVE SUGGESTION UI
 * 
 * Floating panel that displays proactive suggestions based on predicted user intent.
 * Only appears when prediction confidence exceeds threshold.
 */

interface PredictiveSuggestionPanelProps {
  position?: 'top-center' | 'bottom-center' | 'top-left' | 'top-right';
  autoHide?: boolean; // auto-hide after N seconds
  autoHideDelay?: number; // milliseconds
  minConfidence?: number; // min confidence to display
}

export const PredictiveSuggestionPanel: React.FC<PredictiveSuggestionPanelProps> = ({
  position = 'top-center',
  autoHide = false,
  autoHideDelay = 5000,
  minConfidence = 0.6,
}) => {
  const [prediction, setPrediction] = useState<PredictedIntent | null>(null);
  const [adjustments, setAdjustments] = useState<IntentBasedAdjustments | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isManuallyDismissed, setIsManuallyDismissed] = useState(false);

  useEffect(() => {
    // Get current prediction
    const currentPrediction = behaviorPredictionEngine.getCurrentPrediction();
    const currentAdjustments = intentModelingSystem.getCurrentAdjustments();
    
    if (currentPrediction) {
      setPrediction(currentPrediction);
    }
    if (currentAdjustments) {
      setAdjustments(currentAdjustments);
    }

    // Subscribe to updates
    const handlePredictionUpdate = (newPrediction: PredictedIntent) => {
      setPrediction(newPrediction);
      setIsManuallyDismissed(false); // reset on new prediction
    };

    const handleAdjustmentsUpdate = (newAdjustments: IntentBasedAdjustments) => {
      setAdjustments(newAdjustments);
    };

    // Note: BPE doesn't have direct listener, but IMS does
    intentModelingSystem.addListener(handleAdjustmentsUpdate);

    // Poll for prediction updates (since BPE updates via IMS)
    const pollInterval = setInterval(() => {
      const currentPred = behaviorPredictionEngine.getCurrentPrediction();
      if (currentPred) {
        setPrediction(currentPred);
      }
    }, 1000);

    return () => {
      intentModelingSystem.removeListener(handleAdjustmentsUpdate);
      clearInterval(pollInterval);
    };
  }, []);

  // Determine visibility
  useEffect(() => {
    if (isManuallyDismissed) {
      setIsVisible(false);
      return;
    }

    if (!prediction || !adjustments) {
      setIsVisible(false);
      return;
    }

    // Only show if confidence exceeds threshold and suggested action exists
    const shouldShow = 
      prediction.confidence_level >= minConfidence &&
      adjustments.suggested_action !== '';

    setIsVisible(shouldShow);

    // Auto-hide timer
    if (autoHide && shouldShow) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, autoHideDelay);

      return () => clearTimeout(timer);
    }
  }, [prediction, adjustments, isManuallyDismissed, autoHide, autoHideDelay, minConfidence]);

  if (!isVisible || !prediction || !adjustments) {
    return null;
  }

  // Position styling
  const positionStyles = {
    'top-center': 'top-4 left-1/2 transform -translate-x-1/2',
    'bottom-center': 'bottom-4 left-1/2 transform -translate-x-1/2',
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
  };

  // Intent-based styling
  const intentStyles = {
    route: 'bg-blue-500',
    safe_return: 'bg-orange-500',
    exploration: 'bg-green-500',
    friend_meetup: 'bg-purple-500',
    lost: 'bg-red-500',
    stationary: 'bg-gray-500',
    unknown: 'bg-gray-400',
  };

  const bgColor = intentStyles[prediction.primary_intent] || 'bg-gray-500';

  // Intent icons
  const intentIconComponents: Record<string, React.ReactNode> = {
    route: <CursorArrowRaysIcon className="w-7 h-7" />,
    safe_return: <HomeIcon className="w-7 h-7" />,
    exploration: <MagnifyingGlassIcon className="w-7 h-7" />,
    friend_meetup: <UserGroupIcon className="w-7 h-7" />,
    lost: <CompassIcon className="w-7 h-7" />,
    stationary: <StopIcon className="w-7 h-7" />,
    unknown: <QuestionMarkCircleIcon className="w-7 h-7" />,
  };
  const icon = intentIconComponents[prediction.primary_intent] || <QuestionMarkCircleIcon className="w-7 h-7" />;

  return (
    <div
      className={`fixed ${positionStyles[position]} z-50 max-w-sm animate-slideDown`}
    >
      <div className={`${bgColor} text-white rounded-lg shadow-lg p-4 flex items-center gap-3`}>
        {/* Icon */}
        <div className="text-3xl">{icon}</div>

        {/* Content */}
        <div className="flex-1">
          <div className="font-bold text-lg">{adjustments.suggested_action}</div>
          <div className="text-sm opacity-90">
            {Math.round(prediction.confidence_level * 100)}% confidence
          </div>
        </div>

        {/* Dismiss button */}
        <button
          onClick={() => setIsManuallyDismissed(true)}
          className="text-white hover:bg-white hover:bg-opacity-20 rounded-full w-6 h-6 flex items-center justify-center text-xl"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>

      {/* Optional reasoning (expandable) */}
      {adjustments.reasoning.length > 0 && (
        <details className="mt-2 bg-white bg-opacity-95 rounded-lg shadow p-2 text-sm">
          <summary className="cursor-pointer text-gray-700 font-medium">
            Why this suggestion?
          </summary>
          <ul className="mt-2 space-y-1 text-gray-600 text-xs">
            {adjustments.reasoning.map((reason, idx) => (
              <li key={idx}>• {reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

/**
 * Minimal inline suggestion indicator (for less intrusive display)
 */
interface InlineSuggestionIndicatorProps {
  position?: 'top' | 'bottom';
}

export const InlineSuggestionIndicator: React.FC<InlineSuggestionIndicatorProps> = ({
  position = 'top',
}) => {
  const [suggestedAction, setSuggestedAction] = useState<string>('');

  useEffect(() => {
    const updateSuggestion = () => {
      const action = intentModelingSystem.getSuggestedAction();
      setSuggestedAction(action);
    };

    updateSuggestion();

    // Subscribe to adjustments
    intentModelingSystem.addListener(updateSuggestion);

    // Poll for updates
    const interval = setInterval(updateSuggestion, 1000);

    return () => {
      intentModelingSystem.removeListener(updateSuggestion);
      clearInterval(interval);
    };
  }, []);

  if (!suggestedAction) {
    return null;
  }

  const positionClass = position === 'top' ? 'top-0' : 'bottom-0';

  return (
    <div className={`fixed ${positionClass} left-0 right-0 z-40 flex justify-center`}>
      <div className="bg-black bg-opacity-70 text-white text-sm px-4 py-2 rounded-b-lg flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M12 2a7 7 0 00-4.86 12.03c.28.25.45.61.45.99v.23c0 .69.56 1.25 1.25 1.25h6.32c.69 0 1.25-.56 1.25-1.25v-.23c0-.38.17-.74.45-.99A7 7 0 0012 2zm-2.5 16.5a.75.75 0 00-.75.75v.5c0 .41.34.75.75.75h5a.75.75 0 00.75-.75v-.5a.75.75 0 00-.75-.75h-5z" />
        </svg>
        <span>{suggestedAction}</span>
      </div>
    </div>
  );
};

/**
 * Settings toggle for predictive behavior
 */
interface PredictiveSettingsToggleProps {
  className?: string;
}

export const PredictiveSettingsToggle: React.FC<PredictiveSettingsToggleProps> = ({
  className = '',
}) => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [isBPERunning, setIsBPERunning] = useState(false);

  useEffect(() => {
    // Get initial state
    const options = intentModelingSystem.getOptions();
    setIsEnabled(options.intent_override_enabled);
    setIsBPERunning(behaviorPredictionEngine.getIsRunning());
  }, []);

  const handleToggle = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);

    // Update IMS options
    intentModelingSystem.updateOptions({
      intent_override_enabled: newState,
    });

    // Start/stop BPE
    if (newState) {
      behaviorPredictionEngine.start();
      setIsBPERunning(true);
    } else {
      behaviorPredictionEngine.stop();
      setIsBPERunning(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label htmlFor="predictive-toggle" className="text-sm font-medium text-gray-700">
        Enable Predictive Behavior
      </label>
      <button
        id="predictive-toggle"
        role="switch"
        aria-checked={isEnabled}
        onClick={handleToggle}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full transition-colors
          ${isEnabled ? 'bg-blue-600' : 'bg-gray-300'}
        `}
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full bg-white transition-transform
            ${isEnabled ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>
      {isBPERunning && (
        <span className="text-xs text-green-600">● Active</span>
      )}
    </div>
  );
};

// CSS animations (add to global styles or tailwind config)
const styles = `
@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slideDown {
  animation: slideDown 0.3s ease-out;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
