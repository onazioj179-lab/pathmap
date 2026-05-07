/**
 * V61 — UI Behavior Analyzer (UIBA)
 * Derives subtle UI preferences from usage patterns (local-only).
 */

import { usagePatternMemory } from './usagePatternMemory';

export interface UIAdjustments {
  preferCompactControls: boolean;
  defaultZoomBias?: number; // -2..+2
}

class UIBehaviorAnalyzer {
  getAdjustments(): UIAdjustments {
    const snap = usagePatternMemory.getSnapshot();
    const zoom = snap.preferredZoom ?? 16;
    const preferCompact = zoom > 17; // users who zoom in a lot prefer compact UI
    const bias = Math.max(-2, Math.min(2, (zoom - 16) * 0.4));
    return { preferCompactControls: preferCompact, defaultZoomBias: bias };
  }
}

export const uiBehaviorAnalyzer = new UIBehaviorAnalyzer();
