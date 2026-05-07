const FALLBACK_HTTP_BASE = 'http://localhost:8000';

function normalizeBaseUrl(raw: string | undefined | null, fallback: string): string {
  const value = (raw || '').trim();
  if (!value) return fallback;
  return value.replace(/\/$/, '');
}

export function getApiHttpBase(): string {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  return normalizeBaseUrl(fromEnv?.VITE_API_BASE_URL, FALLBACK_HTTP_BASE);
}

export function getApiWsBase(): string {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  const explicit = normalizeBaseUrl(fromEnv?.VITE_WS_BASE_URL, '');
  if (explicit) return explicit;

  const httpBase = getApiHttpBase();
  if (httpBase.startsWith('https://')) return `wss://${httpBase.slice(8)}`;
  if (httpBase.startsWith('http://')) return `ws://${httpBase.slice(7)}`;
  return 'ws://localhost:8000';
}

export function withApiBase(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiHttpBase()}${cleanPath}`;
}
