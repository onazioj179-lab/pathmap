import { test, expect } from "@playwright/test";

/**
 * PATHMAP V97 - API Health Tests
 * ==============================
 * Critical flow: Backend APIs should be accessible
 */

test.describe("API Health", () => {
  test("health endpoint returns OK", async ({ request }) => {
    const response = await request.get("http://localhost:8000/v1/health");

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe("ok");
  });

  test("tunnel stats endpoint works", async ({ request }) => {
    const response = await request.get(
      "http://localhost:8000/api/v1/tunnel/stats",
    );

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty("active_tunnels");
  });

  test("push API test endpoint works", async ({ request }) => {
    const response = await request.get(
      "http://localhost:8000/api/v1/push/test",
    );

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe("ok");
  });

  test("CORS headers are present", async ({ request }) => {
    const response = await request.get("http://localhost:8000/v1/health", {
      headers: {
        Origin: "http://localhost:3002",
      },
    });

    expect(response.ok()).toBeTruthy();

    const headers = response.headers();
    expect(headers["access-control-allow-origin"]).toBeDefined();
  });
});
