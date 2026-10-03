import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  workers: 2,
  use: {
    channel: "msedge",
    headless: true,
    baseURL: "http://127.0.0.1:1422",
    viewport: { width: 1100, height: 760 },
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 1422",
    url: "http://127.0.0.1:1422",
    reuseExistingServer: !process.env.CI,
  },
});
