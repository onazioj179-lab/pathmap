import { test, expect } from "@playwright/test";

/**
 * PATHMAP V97 - Routing Tests
 * ===========================
 * Critical flow: User can request and view routes
 */

test.describe("Route Calculation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should have route controls visible", async ({ page }) => {
    // Look for route-related UI elements
    const routeElements = page.locator(
      '[class*="route"], [class*="panel"], [class*="control"]',
    );
    await expect(routeElements.first()).toBeVisible({ timeout: 10000 });
  });

  test("should call route API successfully", async ({ page, request }) => {
    // Test the route API directly
    const response = await request.post("http://localhost:8000/route", {
      data: {
        start: [9.082, 7.49],
        end: [9.085, 7.495],
        algo: "ShadowPath",
      },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty("path");
    expect(data).toHaveProperty("algorithm");
  });

  test("should handle route with different algorithms", async ({ request }) => {
    const algorithms = ["ShadowPath", "HomeGuard", "PathfinderX"];

    for (const algo of algorithms) {
      const response = await request.post("http://localhost:8000/route", {
        data: {
          start: [9.082, 7.49],
          end: [9.085, 7.495],
          algo,
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.algo_used || data.algorithm).toBe(algo);
    }
  });
});
