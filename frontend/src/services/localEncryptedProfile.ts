// V70 — Local Encrypted Profile Layer (LEPL)
// AES-GCM encrypted JSON blobs stored in localStorage (placeholder for IndexedDB)

import { deriveDeviceKey } from './deviceBinding';

function b64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function b64dec(s: string) { return new Uint8Array(atob(s).split('').map(c => c.charCodeAt(0))); }

async function encryptJSON(obj: any, purpose: string): Promise<string> {
  const key = await deriveDeviceKey(purpose);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return `${b64(iv)}.${b64(ct)}`;
}

async function decryptJSON(payload: string, purpose: string): Promise<any | null> {
  try {
    const [ivB64, ctB64] = payload.split('.');
    const key = await deriveDeviceKey(purpose);
    const iv = b64dec(ivB64);
    const ct = b64dec(ctB64);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(new Uint8Array(plainBuf)));
  } catch {
    return null;
  }
}

export const lepl = {
  async save(name: string, obj: any) {
    const enc = await encryptJSON(obj, name);
    try { localStorage.setItem(`pf_${name}`, enc); } catch {}
  },
  async load(name: string) {
    const enc = localStorage.getItem(`pf_${name}`);
    if (!enc) return null;
    return decryptJSON(enc, name);
  },
  async remove(name: string) {
    try { localStorage.removeItem(`pf_${name}`); } catch {}
  }
};
