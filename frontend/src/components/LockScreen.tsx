/**
 * PATHFINDER — LOCKSCREEN (DISABLED FOR MINIMAL RELEASE)
 * Minimal stub to avoid bundling the full screen. Kept for API compatibility.
 */
import React from 'react';

export interface LockScreenProps {
  onUnlock: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = () => null;
