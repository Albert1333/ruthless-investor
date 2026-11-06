import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, timeout: 60000,
  use: { baseURL: process.env.E2E_BASE_URL || "http://localhost:5173", browserName: "chromium", channel: process.env.E2E_CHANNEL || undefined, trace: "retain-on-failure" },
  reporter: "list",
});

