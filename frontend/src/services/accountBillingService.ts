import { withApiBase } from './apiConfig';

export type BillingPlan = 'starter' | 'pro' | 'enterprise';

export interface PersistedSettings {
  language: 'en' | 'es';
  theme: 'dark' | 'light' | 'system';
  units: 'metric' | 'imperial';
  offline: boolean;
  precisionMode: boolean;
  safetyAlerts: boolean;
  reducedMotion: boolean;
  debug: boolean;
  billingPlan: BillingPlan;
}

const ACCOUNT_CACHE_KEY = 'pathmap.account.billing.v1';

async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(id);
  }
}

function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function loadLocal(): Partial<PersistedSettings> {
  try {
    const raw = localStorage.getItem(ACCOUNT_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedSettings>) : {};
  } catch {
    return {};
  }
}

function saveLocal(patch: Partial<PersistedSettings>): void {
  const next = { ...loadLocal(), ...patch };
  localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(next));
}

class AccountBillingService {
  async loadHydratedSettings(token: string | null): Promise<Partial<PersistedSettings>> {
    const local = loadLocal();

    if (!token) {
      return local;
    }

    try {
      const [profile, billing] = await Promise.all([
        fetchJson<{ preferences?: Partial<PersistedSettings> }>(withApiBase('/api/v1/account/me'), {
          method: 'GET',
          headers: { ...authHeaders(token) },
        }),
        fetchJson<{ plan?: BillingPlan }>(withApiBase('/api/v1/billing/plan'), {
          method: 'GET',
          headers: { ...authHeaders(token) },
        }),
      ]);

      const merged: Partial<PersistedSettings> = {
        ...local,
        ...(profile.preferences || {}),
        ...(billing.plan ? { billingPlan: billing.plan } : {}),
      };
      saveLocal(merged);
      return merged;
    } catch {
      return local;
    }
  }

  async persistSettings(token: string | null, settings: PersistedSettings): Promise<void> {
    saveLocal(settings);

    if (!token) {
      return;
    }

    const preferences: Omit<PersistedSettings, 'billingPlan'> = {
      language: settings.language,
      theme: settings.theme,
      units: settings.units,
      offline: settings.offline,
      precisionMode: settings.precisionMode,
      safetyAlerts: settings.safetyAlerts,
      reducedMotion: settings.reducedMotion,
      debug: settings.debug,
    };

    await Promise.all([
      fetchJson(withApiBase('/api/v1/account/preferences'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
        body: JSON.stringify(preferences),
      }).catch(() => null),
      fetchJson(withApiBase('/api/v1/billing/plan'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(token),
        },
        body: JSON.stringify({ plan: settings.billingPlan }),
      }).catch(() => null),
    ]);
  }
}

export const accountBillingService = new AccountBillingService();
