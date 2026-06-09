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

  test('outbound frames are ciphertext envelopes, not plaintext coordinates', async ({
    page,
    request,
  }) => {
    const user = await registerAndLogin(request, 'tunnelct');

    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__tunnel, null, { timeout: 20000 });

    const frames = await page.evaluate(
      async ({ token, lat, lng }) => {
        const captured: string[] = [];
        const orig = WebSocket.prototype.send;
        // Patch the prototype so every frame the tunnel sends is captured.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        WebSocket.prototype.send = function (data: any) {
          if (typeof data === 'string') captured.push(data);
          return orig.call(this, data);
        };
        try {
          const t: any = (window as any).__tunnel;
          if (!t.isConnected()) await t.connect();
          await t.registerSession(token);
          await t.sendLocation(lat, lng, 5, { source: 'gps' });
          await new Promise(r => setTimeout(r, 600));
        } finally {
          WebSocket.prototype.send = orig;
        }
        return captured;
      },
      { token: user.token, lat: TEST_LAT, lng: TEST_LNG }
    );

    // At least one frame, every frame is a {n,ct} AES-GCM envelope, and no frame
    // leaks the plaintext coordinates.
    expect(frames.length, 'captured outbound frames').toBeGreaterThan(0);
    for (const f of frames) {
      const env = JSON.parse(f);
      expect(env.n, 'envelope nonce').toBeTruthy();
      expect(env.ct, 'envelope ciphertext').toBeTruthy();
      expect(f.includes(String(TEST_LAT)), 'no plaintext latitude').toBe(false);
      expect(f.includes(String(TEST_LNG)), 'no plaintext longitude').toBe(false);
    }
  });

  test('route request round-trips over the encrypted tunnel', async ({ page, request }) => {
    const user = await registerAndLogin(request, 'tunnelroute');

    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__tunnel, null, { timeout: 20000 });

    const resp = await page.evaluate(
      async ({ token, lat, lng }) => {
        const t: any = (window as any).__tunnel;
        if (!t.isConnected()) await t.connect();
        await t.registerSession(token);
        // request() returns the correlated, decrypted route_result envelope.
        return t.request(
          'route_request',
          { request: { start: [lat, lng], end: [lat + 0.01, lng + 0.01], algo: 'ShadowPath' } },
          12000
        );
      },
      { token: user.token, lat: TEST_LAT, lng: TEST_LNG }
    );

    // The encrypted round-trip must complete with a well-formed result whether or
    // not a path exists for these coordinates.
    expect(resp, 'route_result received').toBeTruthy();
    expect(resp.type, 'message type').toBe('route_result');
    expect(typeof resp.ok, 'ok is boolean').toBe('boolean');
  });
});
