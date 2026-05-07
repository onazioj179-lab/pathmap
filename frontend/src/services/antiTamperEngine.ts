// V68 — Anti-Tamper Engine (ATE) + Runtime Signature Verification (RSV)
import { ensureUIWatermark } from './watermark';
import { ENGINE_METADATA } from '../engines/EngineMetadata';
import { secureConfigVault } from './secureConfigVault';
import { arxController } from './arxController';

type ATEReport = {
  ts: number;
  watermark_present: boolean;
  metadata_ok: boolean;
  ar_watermark_ok: boolean;
  engine_hash_ok: boolean;
};

class AntiTamperEngine {
  private interval30min: number | null = null;
  private interval15min: number | null = null;

  start() {
    // Initial checks at startup
    this.verifyNow();
    // Recheck every 30 minutes (ATE)
    this.interval30min = window.setInterval(() => this.verifyNow(), 30 * 60 * 1000);
    // RSV cadence: every 15 minutes during session
    this.interval15min = window.setInterval(() => this.verifyCore(false), 15 * 60 * 1000);
  }

  stop() {
    if (this.interval30min) window.clearInterval(this.interval30min);
    if (this.interval15min) window.clearInterval(this.interval15min);
    this.interval30min = this.interval15min = null;
  }

  async verifyNow(): Promise<ATEReport> {
    const report = await this.verifyCore(true);
    return report;
  }

  private async verifyCore(repair: boolean): Promise<ATEReport> {
    const ts = Date.now();
    // UI watermark presence
    let wmEl = document.getElementById('pf-uiwm');
    const watermark_present = !!wmEl;
    if (!watermark_present && repair) ensureUIWatermark(document.querySelector('.glmap-root') as HTMLElement || document.body);

    // Metadata correctness
    const md = (window as any).PATHMAP_METADATA || ENGINE_METADATA;
    const metadata_ok = md?.author === 'Onazi Treasure' && md?.watermark === 'OJ' && typeof md?.engine_signature === 'string';
    if (!metadata_ok && repair) (window as any).PATHMAP_METADATA = ENGINE_METADATA;

    // AR watermark presence (if AR active ensure overlay exists)
    const arActive = arxController.isActive();
    if (arActive && !document.getElementById('pf-uiwm') && repair) ensureUIWatermark(document.querySelector('.glmap-root') as HTMLElement || document.body);
    const ar_watermark_ok = arActive ? !!document.getElementById('pf-uiwm') : true;

    // Engine hash verification
    const engine_hash_ok = await secureConfigVault.verifyEngineHash().catch(() => false);

    const report: ATEReport = { ts, watermark_present: !!document.getElementById('pf-uiwm'), metadata_ok, ar_watermark_ok, engine_hash_ok };
    if (!(metadata_ok && ar_watermark_ok && report.watermark_present && engine_hash_ok)) {
      // Internal warning only
      // eslint-disable-next-line no-console
      console.warn('[V68][ATE] Tamper or inconsistency detected', report);
    }
    return report;
  }
}

export const antiTamperEngine = new AntiTamperEngine();
