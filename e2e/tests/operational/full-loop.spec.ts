import { test, expect } from '@playwright/test';
import { SOC, registerAndLogin, TEST_LAT, TEST_LNG } from './helpers';

async function startSharing(request, owner, withUser) {
  const res = await request.post(`${SOC}/sharing/start`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    data: { shared_with_id: withUser.userId, precision: 'exact' },
  });
  expect(res.status(), 'start_sharing').toBe(200);
}

async function friendsOf(request, user) {
  const res = await request.get(`${SOC}/sharing/friends`, {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  expect(res.status(), 'get friends').toBe(200);
  return (await res.json()).data as any[];
}

test.describe('operational: full Find-My-Friends loop', () => {
  test('A pushes via HTTP -> B sees A', async ({ request }) => {
    const A = await registerAndLogin(request, 'A');
    const B = await registerAndLogin(request, 'B');
    await startSharing(request, A, B);

    const upd = await request.post(`${SOC}/sharing/location`, {
      headers: { Authorization: `Bearer ${A.token}` },
      data: { latitude: TEST_LAT, longitude: TEST_LNG, accuracy: 5 },
    });
    expect(upd.status()).toBe(200);

    const a = (await friendsOf(request, B)).find(f => f.user_id === A.userId);
    expect(a, 'B sees A').toBeTruthy();
    expect(Math.abs(a.latitude - TEST_LAT)).toBeLessThan(1e-4);
    expect(Math.abs(a.longitude - TEST_LNG)).toBeLessThan(1e-4);
  });

  test('A pushes via encrypted tunnel -> B sees A', async ({ page, request, browserName }) => {
    test.skip(browserName !== 'chromium', 'tunnel push runs on chromium');

    const A = await registerAndLogin(request, 'TA');
    const B = await registerAndLogin(request, 'TB');
    await startSharing(request, A, B);

    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__tunnel, null, { timeout: 20000 });
    const ack = await page.evaluate(
      async ({ token, lat, lng }) => {
        const t: any = (window as any).__tunnel;
        if (!t.isConnected()) await t.connect();
        await t.registerSession(token);
        return await new Promise<any>(resolve => {
          t.on('location_ack', (m: any) => resolve(m));
          t.sendLocation(lat, lng, 5, { source: 'gps' });
          setTimeout(() => resolve(null), 8000);
        });
      },
      { token: A.token, lat: TEST_LAT, lng: TEST_LNG }
    );
    expect(ack?.received, 'tunnel ack').toBe(true);

    // Allow the write to settle, then B should see A from the durable store.
    await expect
      .poll(async () => (await friendsOf(request, B)).some(f => f.user_id === A.userId), {
        timeout: 8000,
      })
      .toBe(true);
    const a = (await friendsOf(request, B)).find(f => f.user_id === A.userId);
    expect(Math.abs(a.latitude - TEST_LAT)).toBeLessThan(1e-4);
  });
});
