import { test, expect } from "@playwright/test";

/**
 * PATHMAP V97 - Map Loading Tests
 * ===============================
 * Critical flow: Map should load and be interactive
 */

test.describe("Map Loading", () => {
  test("should load the map view", async ({ page }) => {
    await page.goto("/");

    // Wait for map container to be present
    const mapContainer = page.locator('.map-container, [class*="map"]').first();
    await expect(mapContainer).toBeVisible({ timeout: 15000 });
  });

  test("should display location controls", async ({ page }) => {
    await page.goto("/");

    // Wait for page to load
    await page.waitForLoadState("networkidle");

    // Check for control buttons
    const controls = page.locator('button, [role="button"]');
    await expect(controls.first()).toBeVisible({ timeout: 10000 });
  });

  test("should handle map click", async ({ page }) => {
    await page.goto("/");

    // Wait for map to be interactive
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000); // Allow map tiles to load

    // Click on map area
    const mapArea = page.locator('.map-container, [class*="map"]').first();
    if (await mapArea.isVisible()) {
      await mapArea.click({ position: { x: 200, y: 200 } });
    }
  });

  test("should be responsive on mobile", async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
    }

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check viewport is mobile-friendly
    const viewport = page.viewportSize();
    expect(viewport?.width).toBeLessThan(768);

    // Map should still be visible
    const mapContainer = page.locator('.map-container, [class*="map"]').first();
    await expect(mapContainer).toBeVisible({ timeout: 15000 });
  });
});
