import { test, expect } from '@playwright/test';
import { SOC, registerAndLogin } from './helpers';

test.describe('operational: auth', () => {
  test('register -> login -> me', async ({ request }) => {
    const user = await registerAndLogin(request, 'auth');
    expect(user.userId).toBeTruthy();

    const me = await request.get(`${SOC}/auth/me`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(me.status()).toBe(200);
    expect((await me.json()).data.id).toBe(user.userId);
  });

  test('protected endpoint rejects missing token', async ({ request }) => {
    const res = await request.get(`${SOC}/auth/me`);
    expect([401, 403]).toContain(res.status());
  });
});
