// V70 — Device Binding Module (DBM)
// Binds identity to device using a device-specific hash and derived keys.

async function sha256Str(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getOrCreateSalt(): string {
  const key = 'pf_dbm_salt_v70';
  let salt = localStorage.getItem(key) || '';
  if (!salt) {
    const arr = crypto.getRandomValues(new Uint8Array(16));
    salt = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(key, salt); } catch {}
  }
  return salt;
}

function getDeviceInfoString(): string {
  const n = navigator as any;
  return [
    navigator.userAgent,
    (navigator as any).platform,
    (n.hardwareConcurrency || 'hc'),
    (n.deviceMemory || 'dm'),
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'tz'
  ].join('|');
}

export async function getDeviceHash(): Promise<string> {
  const info = getDeviceInfoString();
  const salt = getOrCreateSalt();
  return sha256Str(info + '|' + salt);
}

export async function deriveDeviceKey(purpose: string): Promise<CryptoKey> {
  const hash = await getDeviceHash();
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(hash), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode('PF_V70|' + purpose), iterations: 150000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
