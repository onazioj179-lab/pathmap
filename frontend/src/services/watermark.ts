// V67 — Global Author Watermark System (GAWS)
// Centralized watermark constants + UI helpers

export const AUTHOR_NAME = 'Onazi Treasure';
export const WATERMARK_SHORT = 'OJ';
export const ENGINE_SIGNATURE = 'PATHFINDER_ENGINE_CORE_OJ';

let observer: MutationObserver | null = null;
let arMode = false;

function createElement(id = 'pf-uiwm') {
  const el = document.createElement('div');
  el.id = id;
  el.className = 'ui-watermark';
  el.textContent = `${AUTHOR_NAME} — ${WATERMARK_SHORT}`;
  return el;
}

export function ensureUIWatermark(root?: HTMLElement | null) {
  const mount = root || document.querySelector('.glmap-root') || document.body;
  if (!mount) return;
  let el = document.getElementById('pf-uiwm') as HTMLDivElement | null;
  if (!el) {
    el = createElement();
    mount.appendChild(el);
  }
  // Adjust opacity if AR mode is active
  setARMode(arMode);
}

export function enforceIntegrity(target?: HTMLElement | Document | null) {
  const root = (target as HTMLElement) || document;
  if (observer) return; // single instance
  observer = new MutationObserver(() => {
    const el = document.getElementById('pf-uiwm');
    if (!el) {
      // Try to remount into map root first
      const mount = document.querySelector('.glmap-root') as HTMLElement || document.body;
      ensureUIWatermark(mount);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
}

export function disconnectIntegrityWatcher() {
  observer?.disconnect();
  observer = null;
}

export function setARMode(active: boolean) {
  arMode = active;
  const el = document.getElementById('pf-uiwm') as HTMLDivElement | null;
  if (el) {
    // 3D/AR: slightly fainter (5–8%)
    el.style.opacity = active ? '0.06' : '0.10';
  }
}

export function getMetadata() {
  return {
    author: AUTHOR_NAME,
    watermark: WATERMARK_SHORT,
    engine_signature: ENGINE_SIGNATURE,
    version: 'V68',
  } as const;
}

// Runtime validation (WIS): ensure constants exist
export function validateWatermarkPresence(strict = import.meta.env.PROD) {
  if (!AUTHOR_NAME || !WATERMARK_SHORT || !ENGINE_SIGNATURE) {
    const msg = '[V67][WIS] Watermark constants missing';
    if (strict) throw new Error(msg);
    // dev: warn
    // eslint-disable-next-line no-console
    console.warn(msg);
  }
}
