/*
 V82: Auto-Rollback System (ARS)
 - Monitors runtime signals and triggers zddl.rollback() on failure thresholds.
*/

import { zddl } from './zddl';

export type ArsSignal = 'blank_map' | 'tile_missing' | 'routing_error' | 'backend_timeout' | 'fps_collapse';

const COUNTS_KEY = 'pf_ars_counts_v82';

function loadCounts(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(COUNTS_KEY) || '{}'); } catch { return {}; }
}
function saveCounts(c: Record<string, number>) { try { localStorage.setItem(COUNTS_KEY, JSON.stringify(c)); } catch {} }

export const ars = {
  threshold: 3,
  report(sig: ArsSignal) {
    const counts = loadCounts();
    counts[sig] = (counts[sig] || 0) + 1;
    saveCounts(counts);
    if (counts[sig] >= this.threshold) {
      try { console.warn('[ARS] Threshold reached for', sig, '→ rollback'); } catch {}
      zddl.rollback();
    }
  },
  clear() { saveCounts({}); }
};
