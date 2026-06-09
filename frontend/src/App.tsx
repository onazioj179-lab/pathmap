import { BrowserRouter, Routes, Route } from 'react-router-dom';
import OnboardingTerms from './components/OnboardingTerms';
import Home from './pages/Home';
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
  visualizationMode: VisualizationMode; // Algorithm reveal mode
  showAlgorithmBehavior: boolean; // Comparison mode toggle
  liveNavigation: NavigationState | null; // Real-time navigation state
  isLiveNavActive: boolean; // Live navigation enabled
  // Social features
  showSocialHub: boolean;
  showAuthModal: boolean;
}

function App() {
  return (
    <OnboardingTerms>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </OnboardingTerms>
  );
}

export default App;
