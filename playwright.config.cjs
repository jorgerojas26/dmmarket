const path = require("node:path");
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  outputDir: path.join(__dirname, "test-results"),
  testMatch: "**/*.spec.cjs",
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: { viewport: { width: 1280, height: 900 }, trace: "off", screenshot: "off", video: "off" },
});
