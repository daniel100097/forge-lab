import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "quality",
  testMatch: "**/*.spec.mjs",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 12000, toHaveScreenshot: { maxDiffPixels: 50 } },
  reporter: "list",
  outputDir: "../playwright-results/quality",
  snapshotPathTemplate: "{testDir}/snapshots/{arg}{ext}",
  use: {
    baseURL: process.env.FORGEJO_TEST_URL || "http://localhost:3100",
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "firefox",
      use: { browserName: "firefox" },
      testIgnore: "**/visual.spec.mjs",
    },
    {
      name: "webkit",
      use: { browserName: "webkit" },
      testIgnore: "**/visual.spec.mjs",
    },
  ],
});
