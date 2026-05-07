import type { MotionMode } from './motionClassificationEngine';

export interface ViewSettings {
  targetPitch: number;
  targetZoom: number;
}

export function getViewSettings(mode: MotionMode): ViewSettings {
  switch (mode) {
    case 'walking':
      return { targetPitch: 35, targetZoom: 18 }; // closer view
    case 'cycling':
      return { targetPitch: 45, targetZoom: 16.5 };
    case 'driving':
      return { targetPitch: 55, targetZoom: 15 };
    case 'slow-vehicle':
      return { targetPitch: 50, targetZoom: 15.5 };
    case 'stationary':
    default:
      return { targetPitch: 45, targetZoom: 16 };
  }
}
