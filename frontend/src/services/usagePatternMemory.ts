/**
 * V61 — Usage Pattern Memory (UPM)
 * Stores recent UI actions and simple preferences locally (privacy-first)
 */

export type UserAction =
  | { type: 'zoom'; delta: number; timestamp: number }
  | { type: 'tilt'; delta: number; timestamp: number }
  | { type: 'pan'; dx: number; dy: number; timestamp: number }
  | { type: 'tab-select'; id: string; timestamp: number }
  | { type: 'panel-open'; id: string; timestamp: number };

export interface UsageSnapshot {
  recentHeadings: number[];
  preferredZoom?: number;
  preferredPitch?: number;
}

class UsagePatternMemory {
  private static KEY = 'v61_usage_pattern_memory';
  private actions: UserAction[] = [];
  private snapshot: UsageSnapshot = { recentHeadings: [] };
  private max = 50;

  constructor() {
    try {
      const raw = localStorage.getItem(UsagePatternMemory.KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.actions = parsed.actions ?? [];
        this.snapshot = parsed.snapshot ?? { recentHeadings: [] };
      }
    } catch {
      // ignore
    }
  }

  record(action: UserAction) {
    this.actions.push(action);
    if (this.actions.length > this.max) this.actions.shift();
    // update simple prefs
    if (action.type === 'zoom') {
      const last = this.snapshot.preferredZoom ?? 16;
      this.snapshot.preferredZoom = Math.max(3, Math.min(21, last + action.delta * 0.05));
    }
    if (action.type === 'tilt') {
      const last = this.snapshot.preferredPitch ?? 45;
      this.snapshot.preferredPitch = Math.max(0, Math.min(85, last + action.delta * 0.5));
    }
    this.persist();
  }

  pushHeading(headingDeg: number) {
    const arr = this.snapshot.recentHeadings;
    arr.push(((headingDeg % 360) + 360) % 360);
    if (arr.length > 20) arr.shift();
    this.persist();
  }

  getSnapshot(): UsageSnapshot {
    return { ...this.snapshot, recentHeadings: [...this.snapshot.recentHeadings] };
  }

  private persist() {
    try {
      localStorage.setItem(UsagePatternMemory.KEY, JSON.stringify({ actions: this.actions, snapshot: this.snapshot }));
    } catch {
      // ignore
    }
  }
}

export const usagePatternMemory = new UsagePatternMemory();
