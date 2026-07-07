import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests-generated",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [["json", { outputFile: "playwright-report.json" }]],
  use: {
    baseURL: "http://localhost:4000",
    extraHTTPHeaders: { "Content-Type": "application/json" },
  },
});