import { test, expect } from '@playwright/test';
import { API } from './helpers';

test.describe('operational: health', () => {
  test('backend health is ok', async ({ request }) => {
    const res = await request.get(`${API}/v1/health`);
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('ok');
  });

  test('tunnel stats expose active_sessions', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/tunnel/stats`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Correct field is active_sessions (not active_tunnels); connection count is
    // nested under the security report's backpressure block.
    expect(body).toHaveProperty('active_sessions');
    expect(body).toHaveProperty('threat_level');
  });
});
