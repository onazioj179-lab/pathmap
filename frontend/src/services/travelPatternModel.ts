// V71 — Travel Pattern Model (TPM)
// Learns coarse time-of-day and weekly patterns without storing PII timestamps.
import { lepl } from './localEncryptedProfile';

type Histogram = number[]; // fixed bins

class TravelPatternModel {
  private static _i: TravelPatternModel;
  static get instance() { return this._i || (this._i = new TravelPatternModel()); }

  private hourOfDay: Histogram = new Array(24).fill(0);
  private weekday: Histogram = new Array(7).fill(0);
  private heading: Histogram = new Array(8).fill(0); // 45° bins
  private lastSave = 0;

  async load() {
    const data = await lepl.load('analytics.tpm.json.enc');
    if (data) {
      this.hourOfDay = Array.isArray(data.hourOfDay) ? data.hourOfDay : this.hourOfDay;
      this.weekday = Array.isArray(data.weekday) ? data.weekday : this.weekday;
      this.heading = Array.isArray(data.heading) ? data.heading : this.heading;
    }
  }

  tick(now = new Date(), headingDeg?: number) {
    const h = now.getHours();
    const d = now.getDay();
    this.hourOfDay[h]++;
    this.weekday[d]++;
    if (headingDeg != null) {
      const bin = Math.floor(((headingDeg % 360) + 360) % 360 / 45) % 8;
      this.heading[bin]++;
    }
    const t = Date.now();
    if (t - this.lastSave > 30000) { this.lastSave = t; this.save().catch(() => {}); }
  }

  getSummary() {
    const favHour = this.argmax(this.hourOfDay);
    const favDay = this.argmax(this.weekday);
    const favDirBin = this.argmax(this.heading);
    return { favHour, favDay, favDirBin };
  }

  private async save() {
    await lepl.save('analytics.tpm.json.enc', {
      hourOfDay: this.hourOfDay,
      weekday: this.weekday,
      heading: this.heading
    });
  }

  private argmax(arr: number[]) { let i = 0, v = -Infinity, idx = 0; for (i = 0; i < arr.length; i++) { if (arr[i] > v) { v = arr[i]; idx = i; } } return idx; }
}

export const travelPatternModel = TravelPatternModel.instance;
