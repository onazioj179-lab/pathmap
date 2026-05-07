/*
 V82: Zero-Downtime Deployment Logic (ZDDL)
 - Provides API to preload next build and switch without losing state.
 - In this SPA, we simulate via asset prefetch and controlled reload.
*/

type ZddlState = {
  currentBuildId: string | null;
  nextBuildId: string | null;
};

const KEY = 'pf_zddl_state_v82';

function loadState(): ZddlState {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as ZddlState; } catch { return { currentBuildId: null, nextBuildId: null }; }
}
function saveState(s: ZddlState) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

export const zddl = {
  getState(): ZddlState { return loadState(); },
  markCurrent(buildId: string) { const s = loadState(); s.currentBuildId = buildId; saveState(s); },
  async preload(urls: string[]): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const timeouts = urls.map(() => setTimeout(() => ctrl.abort(), 3000));
      await Promise.all(urls.map(u => fetch(u, { signal: ctrl.signal, cache: 'reload' })));
      timeouts.forEach(clearTimeout);
      return true;
    } catch { return false; }
  },
  async activate(nextBuildId: string) {
    const s = loadState(); s.nextBuildId = nextBuildId; saveState(s);
    // Soft switch: trigger reload; stateful modules can persist via localStorage
    window.location.reload();
  },
  async rollback() {
    // Reload to previous version; in CDN-based deploy this would flip a pointer
    window.location.reload();
  }
};
