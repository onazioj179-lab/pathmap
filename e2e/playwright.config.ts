import { defineConfig, devices } from "@playwright/test";

/**
 * PATHMAP V97 - Playwright Configuration
 * ======================================
 * E2E testing configuration for all critical user flows.
 */

export default defineConfig({
  testDir: "./tests",

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],

  // Shared settings for all projects
  use: {
    // Base URL for all tests
    baseURL: "http://localhost:3002",

    // Collect trace when retrying the failed test
    trace: "on-first-retry",

    // Screenshot on failure
    screenshot: "only-on-failure",

    // Video on failure
    video: "on-first-retry",

    // Default timeout for actions
    actionTimeout: 10000,

    // Geolocation for location-based tests
    geolocation: { latitude: 9.082, longitude: 7.49 },
    permissions: ["geolocation"],
  },

  // Configure projects for major browsers
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    // Mobile viewports
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],

  // Run local dev server before starting tests
  webServer: [
    {
      command: "cd ../frontend && npm run dev",
      url: "http://localhost:3002",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command:
        "cd ../backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000",
      url: "http://localhost:8000/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        // Bots register/log in many users quickly; relax the auth rate limit
        // for the test backend (production keeps the strict default).
        AUTH_RATE_LIMIT_PER_MINUTE: "1000",
        JWT_SECRET: process.env.JWT_SECRET || "e2e-test-secret",
      },
    },
  ],
});
