import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import './i18n';
import { validateWatermarkPresence } from './services/watermark';
import { antiTamperEngine } from './services/antiTamperEngine';
import { identityCore } from './services/identityCore';
import { uiScaleEngine } from './services/uiScaleEngine';
import { fullDarkModeEngine } from './services/fullDarkModeEngine';
import { mapEngine } from './services/mapEngine';
import { searchEngine } from './services/searchEngine';
import { ultraCleanMode } from './services/ultraCleanMode';
import { initWebVitals } from './services/webVitals';

// V98: Wrap App with ErrorBoundary for graceful error handling
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <React.Suspense fallback={<div className="loading-screen">Loading System...</div>}>
        <App />
      </React.Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);

// V98: Initialize Web Vitals performance monitoring
initWebVitals();

// Ensure any old service workers are unregistered (pure online mode)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister().catch(() => {}));
  }).catch(() => {});
}

// V67: WIS — Validate watermark presence at startup (strict in PROD)
validateWatermarkPresence(true);

// V68: Start Anti-Tamper Engine and initial RSV
antiTamperEngine.start();

// V70: Initialize dormant Identity Core (device-bound local profile)
// Non-blocking, silent init; errors are swallowed to remain dormant
Promise.resolve().then(() => identityCore.init()).catch(() => {});

// V77: Enforce full dark mode across UI surfaces
try { fullDarkModeEngine.init(); } catch {}

// V73: Start responsive UI scaling (FRA-UI + DIS + CVE foundation)
try { uiScaleEngine.start(); } catch {}

// Initialize ultra-clean mode - Map + Header + Bottom Nav only
console.log('[PATHMAP] ULTRA CLEAN MODE');
console.log('[PATHMAP] Map + Header + Bottom Nav only');
console.log('[PATHMAP] All clutter removed');
// Map, search, and ultra-clean mode auto-initialize on import
