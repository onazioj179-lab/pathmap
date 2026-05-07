/*
 V82: Backend + Frontend Integrity Sync (BFIS)
 - Validates backend/ frontend versions before enabling backend-bound tiles
*/

export type BfisResult = {
  ok: boolean;
  reason?: string;
  backend?: any;
};

export const BFIS_UI_VERSION = "v78"; // current frontend engines integration version

export async function checkIntegrity(): Promise<BfisResult> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2000);
    const r = await fetch('/api/v1/health', { signal: ac.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!r.ok) return { ok: false, reason: 'health_not_ok' };
    const j = await r.json();

    // Version validation
    const apiOk = j.api_version === 'v1';
    const tileOk = typeof j.tile_format_version === 'string' && j.tile_format_version.startsWith('terrarium_');
    const terrainOk = typeof j.terrain_layer_version === 'string';
    const uiOk = j.ui_integration_version === BFIS_UI_VERSION;

    const ok = !!(apiOk && tileOk && terrainOk && uiOk);
    (window as any).__pfBackendReady = ok;
    (window as any).__pfBackendMeta = j;

    return ok ? { ok: true, backend: j } : { ok: false, reason: 'version_mismatch', backend: j };
  } catch (e) {
    (window as any).__pfBackendReady = false;
    return { ok: false, reason: 'unreachable' };
  }
}
