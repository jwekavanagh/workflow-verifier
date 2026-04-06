import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(__dirname, "test", "debug-ui"),
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:9371",
    trace: "off",
  },
  webServer: {
    command: "node scripts/playwright-debug-server.mjs",
    url: "http://127.0.0.1:9371/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
