import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Settings from './pages/Settings';
import type { VisualizationMode } from './services/visualization';
import type { NavigationState } from './services/navigation';

export interface AppState {
  algorithm: 'ShadowPath' | 'HomeGuard' | 'PathfinderX';
  activePanel: 'routing' | 'compare' | 'safe' | 'track' | 'marks' | 'social' | null;
  startPoint: [number, number] | null;
  endPoint: [number, number] | null;
  routeData: any | null;
  compareMode: '2' | 'all' | null;
  comparisonResults: any[] | null;
  isTracking: boolean;
  trackingHistory: [number, number][];
  landmarks: Array<{ id: string; position: [number, number]; name: string; type: string }>;
  safeReturnRoutes: any[] | null;
  showHeatmap: boolean;
  visualizationSpeed: number;
  contextData: any | null;
  safetyScore: number;
  visualizationMode: VisualizationMode; // V30: Algorithm reveal mode
  showAlgorithmBehavior: boolean; // V30: Comparison mode toggle
  liveNavigation: NavigationState | null; // V31: Real-time navigation state
  isLiveNavActive: boolean; // V31: Live navigation enabled
  // V93: Social features
  showSocialHub: boolean;
  showAuthModal: boolean;
}

function App() {
  const [state, setState] = useState<AppState>({
    algorithm: 'ShadowPath',
    activePanel: null,
    startPoint: null,
    endPoint: null,
    routeData: null,
    compareMode: null,
    comparisonResults: null,
    isTracking: false,
    trackingHistory: [],
    landmarks: [],
    safeReturnRoutes: null,
    showHeatmap: false,
    visualizationSpeed: 1.0,
    contextData: null,
    safetyScore: 100,
    visualizationMode: 'full-reveal', // V30: Default to full reveal
    showAlgorithmBehavior: true, // V30: Default to showing algorithm behavior
    liveNavigation: null, // V31: Real-time navigation state
    isLiveNavActive: false, // V31: Live navigation disabled by default
    // V93: Social features
    showSocialHub: false,
    showAuthModal: false,
  });

  const updateState = (updates: Partial<AppState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home state={state} updateState={updateState} />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
