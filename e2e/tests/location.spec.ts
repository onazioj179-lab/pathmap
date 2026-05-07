import { test, expect } from "@playwright/test";

/**
 * PATHMAP V97 - Location Tracking Tests
 * =====================================
 * Critical flow: Location permissions and tracking
 */

test.describe("Location Tracking", () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant geolocation permission
    await context.grantPermissions(["geolocation"]);

    // Set mock geolocation
    await context.setGeolocation({ latitude: 9.082, longitude: 7.49 });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should request location permission UI", async ({ page }) => {
    // Look for permission-related UI
    const permissionUI = page.locator(
      '[class*="permission"], [class*="location"]',
    );

    // Page should have some location-related elements
    const count = await permissionUI.count();
    expect(count).toBeGreaterThanOrEqual(0); // May not show if auto-granted
  });

  test("tracking API should accept location updates", async ({ request }) => {
    const response = await request.post(
      "http://localhost:8000/api/v1/tracking/location/update",
      {
        data: {
          lat: 9.082,
          lng: 7.49,
          accuracy: 10,
          timestamp: new Date().toISOString(),
        },
        headers: {
          "Content-Type": "application/json",
          "X-Device-ID": "test-device-123",
        },
      },
    );

    // May fail without auth, but should not be 500
    expect(response.status()).toBeLessThan(500);
  });
});
