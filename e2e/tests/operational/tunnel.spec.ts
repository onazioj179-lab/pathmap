import { test, expect } from '@playwright/test';
import { registerAndLogin, TEST_LAT, TEST_LNG } from './helpers';

// The tunnel client uses WebCrypto + the DEV-only window.__tunnel handle; pin to
// chromium so we exercise the real client once rather than across every engine.
test.describe('operational: encrypted tunnel', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'tunnel bot runs on chromium');

  test('handshake -> register -> encrypted location is acked', async ({ page, request }) => {
    const user = await registerAndLogin(request, 'tunnel');

    await page.goto('/');
    // Wait for the DEV tunnel handle the app exposes.
    await page.waitForFunction(() => !!(window as any).__tunnel, null, { timeout: 20000 });

    const result = await page.evaluate(
      async ({ token, lat, lng }) => {
        const t: any = (window as any).__tunnel;
        if (!t.isConnected()) await t.connect();
        const registered = await t.registerSession(token);
        const ack = await new Promise<any>(resolve => {
          const onAck = (m: any) => resolve(m);
          t.on('location_ack', onAck);
          t.sendLocation(lat, lng, 5, { source: 'gps' });
          setTimeout(() => resolve(null), 8000);
        });
        return { registered, ack };
      },
      { token: user.token, lat: TEST_LAT, lng: TEST_LNG }
    );

    expect(result.registered, 'tunnel registered to user').toBe(true);
    expect(result.ack, 'location_ack received').toBeTruthy();
    expect(result.ack.received, 'ack.received').toBe(true);
  });
});
