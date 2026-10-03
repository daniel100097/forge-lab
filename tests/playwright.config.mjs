import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.mjs",
  testIgnore: "**/quality/**",
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: "list",
  outputDir: "../playwright-results/regression",
  use: {
    baseURL: process.env.FORGEJO_TEST_URL || "http://localhost:3100",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
