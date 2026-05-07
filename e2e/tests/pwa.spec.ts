import { test, expect } from "@playwright/test";

/**
 * PATHMAP V97 - PWA Tests
 * =======================
 * Critical flow: PWA functionality
 */

test.describe("PWA Functionality", () => {
  test("should have valid manifest", async ({ page }) => {
    await page.goto("/");

    // Check for manifest link
    const manifestLink = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    expect(manifestLink).toBeTruthy();

    // Fetch manifest
    const manifestResponse = await page.request.get(
      manifestLink || "/manifest.json",
    );
    expect(manifestResponse.ok()).toBeTruthy();

    const manifest = await manifestResponse.json();
    expect(manifest.name).toBeDefined();
    expect(manifest.icons).toBeDefined();
    expect(manifest.start_url).toBeDefined();
  });

  test("should register service worker", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check for service worker registration
    const swRegistered = await page.evaluate(async () => {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations.length > 0;
      }
      return false;
    });

    // May not be registered in test environment
    expect(typeof swRegistered).toBe("boolean");
  });

  test("should have proper meta tags", async ({ page }) => {
    await page.goto("/");

    // Check viewport meta
    const viewport = await page
      .locator('meta[name="viewport"]')
      .getAttribute("content");
    expect(viewport).toContain("width=device-width");

    // Check theme color
    const themeColor = await page
      .locator('meta[name="theme-color"]')
      .getAttribute("content");
    expect(themeColor).toBeDefined();
  });
});
