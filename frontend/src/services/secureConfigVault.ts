// V68 — Secure Config Vault (SCV) + Encrypted Engine Signature (EES)
// Stores encrypted signature and provides validation helpers

import { ENGINE_SIGNATURE, AUTHOR_NAME, WATERMARK_SHORT } from './watermark';

// Generated at build time by buildIntegrity.mjs
// If missing (dev), provide placeholders to keep app running.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { EES_CIPHERTEXT, EES_IV, BUILD_TIME, ENGINE_HASH } from './ees.generated';

function enc(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

async function sha256Str(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc(str) as unknown as BufferSource);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(secret: string, salt: string) {
  const base = await crypto.subtle.importKey('raw', enc(secret) as unknown as BufferSource, { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc(salt) as unknown as BufferSource, iterations: 100000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

async function decryptEES(): Promise<Record<string, string> | null> {
  try {
    if (!EES_CIPHERTEXT || !EES_IV || !BUILD_TIME) return null;
    const key = await deriveKey(ENGINE_SIGNATURE, BUILD_TIME);
    const ctBytes = Uint8Array.from(atob(EES_CIPHERTEXT), c => c.charCodeAt(0));
    const ivBytes = Uint8Array.from(atob(EES_IV), c => c.charCodeAt(0));
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, ctBytes);
    const json = new TextDecoder().decode(new Uint8Array(plainBuf));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const secureConfigVault = {
  getBuildTime(): string | null { try { return BUILD_TIME || null; } catch { return null; } },
  getExpectedEngineHash(): string | null { try { return ENGINE_HASH || null; } catch { return null; } },

  async getDecryptedSignature() {
    return decryptEES();
  },

  async computeRuntimeHash(): Promise<string> {
    const bt = this.getBuildTime() || 'DEV';
    const core = `${AUTHOR_NAME}|${WATERMARK_SHORT}|${ENGINE_SIGNATURE}|${bt}`;
    return sha256Str(core);
  },

  async verifyEngineHash(): Promise<boolean> {
    const expected = this.getExpectedEngineHash();
    if (!expected) return true; // dev mode fallback
    const actual = await this.computeRuntimeHash();
    return expected === actual;
  },
};
