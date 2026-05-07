// V71 — Local Heatmap Generator (LHG)
// Aggregates location samples into grid cells locally (encrypted storage).
import { lepl } from './localEncryptedProfile';

type CellKey = string; // e.g., "z13:x:y"

function cellKey(lat: number, lon: number, meters = 100): CellKey {
  // Approximate meters/deg at mid lat
  const mPerDegLat = 111_132;
  const mPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const dLat = meters / mPerDegLat;
  const dLon = meters / Math.max(1, mPerDegLon);
  const ix = Math.floor(lon / dLon);
  const iy = Math.floor(lat / dLat);
  return `m${meters}:${ix}:${iy}`;
}

class LocalHeatmapGenerator {
  private static _i: LocalHeatmapGenerator;
  static get instance() { return this._i || (this._i = new LocalHeatmapGenerator()); }

  private counts: Map<CellKey, number> = new Map();
  private lastSave = 0;

  async load() {
    const data = await lepl.load('analytics.lhg.json.enc');
    if (data && data.map) {
      this.counts = new Map(data.map as [CellKey, number][]);
    }
  }

  addSample(lat: number, lon: number, meters = 100, t = Date.now()) {
    const key = cellKey(lat, lon, meters);
    const cur = this.counts.get(key) || 0;
    this.counts.set(key, cur + 1);
    if (t - this.lastSave > 20000) {
      this.lastSave = t;
      this.save().catch(() => {});
    }
  }

  topCells(limit = 50): Array<{ key: CellKey; count: number }> {
    return Array.from(this.counts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private async save() {
    const payload = { map: Array.from(this.counts.entries()) };
    await lepl.save('analytics.lhg.json.enc', payload);
  }
}

export const localHeatmapGenerator = LocalHeatmapGenerator.instance;
