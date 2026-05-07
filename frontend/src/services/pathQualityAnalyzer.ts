// V71 — Path Quality Analyzer (PQA)
// Scores taken route segments using simple heuristics and safety signals.
import { globalSafetyEngine } from './globalSafetyEngine';
import { lepl } from './localEncryptedProfile';

type RouteLike = { path?: [number, number][], segments?: any[] } | null;

class PathQualityAnalyzer {
  private static _i: PathQualityAnalyzer;
  static get instance() { return this._i || (this._i = new PathQualityAnalyzer()); }

  private route: RouteLike = null;
  private lastSave = 0;
  private lastScore = 100;

  setRoute(r: RouteLike) { this.route = r; }

  updateWithPosition(pos: { lat: number; lon: number; speedMps?: number; heading?: number }) {
    // Fast scoring: combine safety rating + deviation heuristic
    const gse = globalSafetyEngine.getState();
    const base = gse.safe_path_rating; // 0..100
    // crude deviation: lower speed and frequent heading changes → penalty
    const speed = pos.speedMps ?? 0;
    const speedBonus = Math.min(10, speed * 1.5);
    const hazardPenalty = gse.hazard_flags.length * 3;
    const recommendedPenalty = gse.recommended_action !== 'none' ? 5 : 0;
    const score = Math.max(0, Math.min(100, base + speedBonus - hazardPenalty - recommendedPenalty));
    this.lastScore = score;

    const t = Date.now();
    if (t - this.lastSave > 20000) { this.lastSave = t; this.save().catch(() => {}); }
  }

  getScore() { return this.lastScore; }

  private async save() {
    await lepl.save('analytics.pqa.json.enc', {
      last_score: this.lastScore,
      last_update: Date.now()
    });
  }
}

export const pathQualityAnalyzer = PathQualityAnalyzer.instance;
