/**
 * PATHFINDER V60 — THEME CONTROL PANEL
 * 
 * UI component for testing and controlling the Dynamic Theme Engine.
 * This panel allows users to manually override theme settings.
 */

import { useState, useEffect } from 'react';
import { XMarkIcon, PaintBrushIcon } from '@heroicons/react/24/solid';
// Theme control removed per user request

export default function ThemeControlPanel() {
  const [isVisible, setIsVisible] = useState(false);
  const [themeState, setThemeState] = useState({} as any);

  useEffect(() => {
    // Update local state when theme changes
    const interval = setInterval(() => {
      setThemeState({});
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleModeChange = (mode: ThemeMode) => {
    setThemeState({});
  };

  const handleWeatherChange = (weather: WeatherCondition) => {
    setThemeState({});
  };

  const handleAccessibilityChange = (mode: AccessibilityMode) => {
    setThemeState({});
  };

  const handleBrightnessChange = (brightness: number) => {
    setThemeState({});
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-24 left-4 w-10 h-10 rounded-full bg-gray-800 text-white flex items-center justify-center z-50 hover:bg-gray-700 transition-colors"
        title="Open Theme Controls"
      >
        <PaintBrushIcon className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 left-4 bg-white dark:bg-gray-900 rounded-lg shadow-2xl p-4 z-50 w-80 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm">V60 Theme Controls</h3>
        <button
          onClick={() => setIsVisible(false)}
          className="w-6 h-6 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Theme Mode */}
      <div className="mb-4">
        <label className="block text-xs font-medium mb-2">Mode</label>
        <div className="flex gap-2">
          {(['auto', 'day', 'night'] as ThemeMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              className={`flex-1 py-2 px-3 text-xs rounded ${
                themeState.mode === mode
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-gray-500 mt-1">
          Active: {themeState.activeTheme}
        </div>
      </div>

      {/* Weather */}
      <div className="mb-4">
        <label className="block text-xs font-medium mb-2">Weather</label>
        <select
          value={themeState.weather}
          onChange={(e) => handleWeatherChange(e.target.value as WeatherCondition)}
          className="w-full px-3 py-2 text-xs rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
        >
          <option value="clear">Clear</option>
          <option value="sunny">Sunny</option>
          <option value="cloudy">Cloudy</option>
          <option value="rain">Rain</option>
          <option value="snow">Snow</option>
          <option value="fog">Fog</option>
        </select>
      </div>

      {/* Ambient Brightness */}
      <div className="mb-4">
        <label className="block text-xs font-medium mb-2">
          Ambient Brightness: {Math.round(themeState.ambientBrightness * 100)}%
        </label>
        <input
          type="range"
          min="0"
          max="100"
          value={themeState.ambientBrightness * 100}
          onChange={(e) => handleBrightnessChange(parseInt(e.target.value) / 100)}
          className="w-full"
        />
      </div>

      {/* Accessibility */}
      <div className="mb-4">
        <label className="block text-xs font-medium mb-2">Accessibility</label>
        <select
          value={themeState.accessibilityMode}
          onChange={(e) => handleAccessibilityChange(e.target.value as AccessibilityMode)}
          className="w-full px-3 py-2 text-xs rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
        >
          <option value="none">None</option>
          <option value="high-contrast">High Contrast</option>
          <option value="color-blind">Color Blind</option>
          <option value="large-text">Large Text</option>
          <option value="reduced-motion">Reduced Motion</option>
        </select>
      </div>

      {/* Current Palette Preview */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        <div className="text-[10px] font-medium mb-2">Current Palette</div>
        <div className="grid grid-cols-5 gap-1">
          <div
            className="h-8 rounded"
            style={{ backgroundColor: themeState.palette.bg }}
            title="Background"
          />
          <div
            className="h-8 rounded"
            style={{ backgroundColor: themeState.palette.fg }}
            title="Foreground"
          />
          <div
            className="h-8 rounded"
            style={{ backgroundColor: themeState.palette.accent }}
            title="Accent"
          />
          <div
            className="h-8 rounded"
            style={{ backgroundColor: themeState.palette.panel }}
            title="Panel"
          />
          <div
            className="h-8 rounded"
            style={{ backgroundColor: themeState.palette.muted }}
            title="Muted"
          />
        </div>
      </div>
    </div>
  );
}
