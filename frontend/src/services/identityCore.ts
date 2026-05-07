// V70 — Identity Core System (ICS) — dormant
import { lepl } from './localEncryptedProfile';
import { getDeviceHash, deriveDeviceKey } from './deviceBinding';

export interface IdentityCore {
  user_id: string;
  display_name: string;
  creation_timestamp: number;
  last_active_timestamp: number;
  encrypted_profile_ref: string; // points to 'profile.json.enc'
  device_hash: string;
}

function uuidv4() {
  const a = crypto.getRandomValues(new Uint8Array(16));
  a[6] = (a[6] & 0x0f) | 0x40; // version
  a[8] = (a[8] & 0x3f) | 0x80; // variant
  const h = Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export const identityCore = {
  _id: null as IdentityCore | null,

  async init() {
    // Load or create dormant identity
    const meta = await lepl.load('profile.meta.enc');
    if (meta && meta.user_id) {
      this._id = meta as IdentityCore;
      this._id.last_active_timestamp = Date.now();
      await lepl.save('profile.meta.enc', this._id);
      return this._id;
    }
    const now = Date.now();
    const device_hash = await getDeviceHash();
    const id: IdentityCore = {
      user_id: uuidv4(),
      display_name: 'User',
      creation_timestamp: now,
      last_active_timestamp: now,
      encrypted_profile_ref: 'profile.json.enc',
      device_hash,
    };
    // Minimal default profile payload
    const profile = {
      prefs: { theme: 'system', mapStyle: 'auto', ar: { hints: true } },
      safety: { cautiousNight: true },
      history: [],
    };
    await lepl.save('profile.json.enc', profile);
    await lepl.save('profile.meta.enc', id);
    this._id = id;
    return id;
  },

  get(): IdentityCore | null { return this._id; },
};
